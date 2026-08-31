import { supabase } from './supabase'

export type ReminderSettings = { enabled: boolean; reminderTime: string; weekdays: number[] }

export function urlBase64ToUint8Array(value: string) {
  const base64 = (value + '='.repeat((4 - value.length % 4) % 4)).replaceAll('-', '+').replaceAll('_', '/')
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
}

export async function loadReminder(userId: string): Promise<ReminderSettings> {
  if (!supabase) return { enabled: false, reminderTime: '19:30', weekdays: [1, 3, 5, 6] }
  const { data, error } = await supabase.from('reminder_settings').select('enabled,reminder_time,weekdays').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data ? { enabled: data.enabled, reminderTime: String(data.reminder_time).slice(0, 5), weekdays: data.weekdays } : { enabled: false, reminderTime: '19:30', weekdays: [1, 3, 5, 6] }
}

export async function saveReminder(settings: ReminderSettings) {
  if (!supabase) throw new Error('请先配置 Supabase 并登录')
  let subscription: PushSubscriptionJSON | null = null
  if (settings.enabled) {
    const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
    if (!publicKey) throw new Error('尚未配置 VAPID 公钥')
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('当前浏览器不支持推送通知')
    if (await Notification.requestPermission() !== 'granted') throw new Error('需要允许通知权限才能启用提醒')
    const registration = await navigator.serviceWorker.ready
    const current = await registration.pushManager.getSubscription()
    subscription = (current || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) })).toJSON()
  }
  const { error } = await supabase.rpc('save_reminder_settings', {
    p_enabled: settings.enabled,
    p_reminder_time: settings.reminderTime,
    p_weekdays: settings.weekdays,
    p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai',
    p_subscription: subscription,
  })
  if (error) throw error
}
