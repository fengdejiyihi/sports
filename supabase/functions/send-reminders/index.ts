import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { reminderDue } from './due.ts'

Deno.serve(async (request) => {
  try {
    if (request.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) return new Response('Unauthorized', { status: 401 })
    const url = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
    const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
    const subject = Deno.env.get('VAPID_SUBJECT')
    if (!url || !serviceKey || !publicKey || !privateKey || !subject) throw new Error('推送服务端配置不完整')

    const supabase = createClient(url, serviceKey)
    const { data: settings, error } = await supabase.from('reminder_settings').select('user_id,reminder_time,timezone,weekdays,last_sent_on').eq('enabled', true)
    if (error) throw error
    const now = new Date()
    // ponytail: full scan is enough for a personal app; batch by due-time bucket if users exceed 1,000.
    const due = (settings || []).map((setting) => ({ ...setting, ...reminderDue(now, setting.reminder_time, setting.timezone, setting.weekdays, setting.last_sent_on) })).filter((setting) => setting.due)
    if (!due.length) return Response.json({ sent: 0 })

    const { data: subscriptions, error: subscriptionError } = await supabase.from('push_subscriptions').select('id,user_id,subscription').in('user_id', due.map((setting) => setting.user_id))
    if (subscriptionError) throw subscriptionError
    webpush.setVapidDetails(subject, publicKey, privateKey)
    let sent = 0
    const successfulUsers = new Set<string>()
    for (const item of subscriptions || []) {
      try {
        await webpush.sendNotification(item.subscription, JSON.stringify({ title: '该锻炼了 💪', body: '今天的训练计划在等你，完成后记得打卡。', url: '/?page=checkin' }))
        sent += 1; successfulUsers.add(item.user_id)
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) await supabase.from('push_subscriptions').delete().eq('id', item.id)
      }
    }
    for (const setting of due) if (successfulUsers.has(setting.user_id)) await supabase.from('reminder_settings').update({ last_sent_on: setting.date }).eq('user_id', setting.user_id)
    return Response.json({ sent })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '发送失败' }, { status: 500 })
  }
})
