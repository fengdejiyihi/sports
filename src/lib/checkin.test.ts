import { describe, expect, it } from 'vitest'
import { checkinValues, emptyCheckinDraft, validateCheckin } from './checkin'
import { mealTotals, validateImageMeta, validateManualMeal } from './nutrition'
import { ageFromBirthDate, isValidWeight, validateProfile } from './profile'
import { urlBase64ToUint8Array } from './reminders'
import { reminderDue } from '../../supabase/functions/send-reminders/due'
import { trendDelta, trendPoints } from './trends'
import { mergeHistory } from './history'
import { emptyWorkoutPlan, validateWorkoutPlan, weekdayOptions } from './workouts'

const validCheckin = { status: 'completed' as const, planId: '', durationMinutes: '40', weightKg: '70.7', waistCm: '83.5', sleepHours: '7.2', energy: '4', soreness: '2', notes: '' }

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

describe('validateProfile', () => {
  it('keeps each user profile within safe recommendation ranges', () => {
    expect(ageFromBirthDate('2000-09-01', new Date('2026-08-31'))).toBe(25)
    expect(isValidWeight('70.5')).toBe(true)
    expect(isValidWeight('0')).toBe(false)
    expect(validateProfile({ sex: 'unspecified', birthDate: '2018-01-01', heightCm: '178', targetWeightKg: '65' })).toContain('请输入 14–100 岁范围内的出生日期')
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

describe('measurement trends', () => {
  it('uses only recorded values so an optional waist measurement does not break the trend', () => {
    const points = [{ measuredOn: '2026-08-01', weightKg: 71, waistCm: 84 }, { measuredOn: '2026-08-02', weightKg: 70.6, waistCm: null }, { measuredOn: '2026-08-03', weightKg: 70.4, waistCm: 83.5 }]
    expect(trendDelta(points, 'weightKg')).toBeCloseTo(-0.6)
    expect(trendDelta(points, 'waistCm')).toBeCloseTo(-0.5)
    expect(trendPoints(points, 'weightKg')).not.toBe('')
  })
})

describe('meal ledger validation', () => {
  it('rejects impossible manual nutrition values before writing a meal entry', () => {
    expect(validateManualMeal({ mealName: '鸡胸肉饭', mealType: 'lunch', totalCalories: '600', proteinGrams: '40' })).toBe('')
    expect(validateManualMeal({ mealName: '', mealType: 'lunch', totalCalories: '-1', proteinGrams: '40' })).toBe('请输入 1–80 字的餐食名称')
    expect(mealTotals([{ id: 'a', mealName: '早餐', mealType: 'breakfast', totalCalories: 450, proteinGrams: 30, source: 'manual' }, { id: 'b', mealName: '午餐', mealType: 'lunch', totalCalories: 600, proteinGrams: 40, source: 'vision' }])).toEqual({ calories: 1050, protein: 70 })
  })
})

describe('check-in history', () => {
  it('keeps one day per check-in and attaches only that day’s measurements', () => {
    expect(mergeHistory([{ date: '2026-08-02', status: 'completed', durationMinutes: 40, sleepMinutes: 420 }, { date: '2026-08-01', status: 'skipped', durationMinutes: null, sleepMinutes: 450 }], [{ date: '2026-08-02', weightKg: 70.5, waistCm: 83 }])).toEqual([{ date: '2026-08-02', status: 'completed', durationMinutes: 40, sleepMinutes: 420, weightKg: 70.5, waistCm: 83 }, { date: '2026-08-01', status: 'skipped', durationMinutes: null, sleepMinutes: 450, weightKg: null, waistCm: null }])
  })
})

describe('workout plan validation', () => {
  it('keeps plan exercises complete before replacing the saved routine', () => {
    expect(validateWorkoutPlan({ ...emptyWorkoutPlan(), name: '晚饭后慢走' })).toBe('')
    expect(validateWorkoutPlan({ ...emptyWorkoutPlan(), name: '力量 A', items: [{ exerciseName: '深蹲', sets: '3', repsMin: '8', repsMax: '12' }] })).toBe('')
    expect(weekdayOptions.map(([value]) => value)).toEqual(['1', '2', '3', '4', '5', '6', '0'])
  })
})
