import { describe, expect, it } from 'vitest'
import { checkinValues, emptyCheckinDraft, validateCheckin } from './checkin'
import { validateImageMeta } from './nutrition'
import { urlBase64ToUint8Array } from './reminders'
import { reminderDue } from '../../supabase/functions/send-reminders/due'

const validCheckin = { status: 'completed' as const, durationMinutes: '40', weightKg: '70.7', waistCm: '83.5', sleepHours: '7.2', energy: '4', soreness: '2', notes: '' }

describe('validateCheckin', () => {
  it('starts a new account without another account’s measurements', () => {
    expect(emptyCheckinDraft()).toMatchObject({ weightKg: '', waistCm: '', sleepHours: '', notes: '' })
  })
  it('rejects impossible measurements before they can distort progress data', () => { expect(validateCheckin({ ...validCheckin, weightKg: '0', sleepHours: '27' })).toEqual(['请输入合理的体重', '睡眠时长应在 0–24 小时之间']) })
  it('accepts a completed daily check-in with valid measurements', () => { expect(validateCheckin(validCheckin)).toEqual([]) })
  it('stores sleep as whole minutes and omits duration for a skipped workout', () => {
    expect(checkinValues({ ...validCheckin, status: 'skipped', sleepHours: '7.25' })).toMatchObject({ durationMinutes: null, sleepMinutes: 435 })
  })
})

describe('validateImageMeta', () => {
  it('rejects unsupported or oversized uploads before AI processing', () => {
    expect(validateImageMeta({ type: 'image/gif', size: 10 })).toBe('仅支持 JPG、PNG 或 WebP 图片')
    expect(validateImageMeta({ type: 'image/jpeg', size: 6 * 1024 * 1024 })).toBe('图片不能超过 5 MB')
  })
})

describe('urlBase64ToUint8Array', () => {
  it('converts a VAPID URL-safe public key for PushManager', () => {
    expect([...urlBase64ToUint8Array('AQID-_8')]).toEqual([1, 2, 3, 251, 255])
  })
})

describe('reminderDue', () => {
  it('sends once inside the local reminder window', () => {
    const now = new Date('2026-08-31T11:35:00Z')
    expect(reminderDue(now, '19:30', 'Asia/Shanghai', [1], null)).toEqual({ date: '2026-08-31', due: true })
    expect(reminderDue(now, '19:30', 'Asia/Shanghai', [1], '2026-08-31').due).toBe(false)
  })
})
