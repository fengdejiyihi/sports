export type CheckinDraft = { status: 'completed' | 'skipped' | 'backfill'; planId: string; durationMinutes: string; weightKg: string; waistCm: string; sleepHours: string; energy: string; soreness: string; notes: string }

export function emptyCheckinDraft(): CheckinDraft {
  return { status: 'completed', planId: '', durationMinutes: '', weightKg: '', waistCm: '', sleepHours: '', energy: '4', soreness: '2', notes: '' }
}

export function checkinValues(draft: CheckinDraft) {
  return {
    status: draft.status,
    durationMinutes: draft.status === 'skipped' ? null : Number(draft.durationMinutes),
    weightKg: Number(draft.weightKg),
    waistCm: Number(draft.waistCm),
    sleepMinutes: Math.round(Number(draft.sleepHours) * 60),
    energyRating: Number(draft.energy),
    sorenessRating: Number(draft.soreness),
    notes: draft.notes.trim() || null,
    planId: draft.planId || null,
  }
}

export function validateCheckin(draft: CheckinDraft): string[] {
  const errors: string[] = []
  const duration = Number(draft.durationMinutes)
  const weight = Number(draft.weightKg)
  const waist = Number(draft.waistCm)
  const sleep = Number(draft.sleepHours)
  if (draft.status === 'completed' && (!Number.isFinite(duration) || duration < 1 || duration > 600)) errors.push('训练时长应在 1–600 分钟之间')
  if (!Number.isFinite(weight) || weight < 25 || weight > 300) errors.push('请输入合理的体重')
  if (!Number.isFinite(waist) || waist < 30 || waist > 200) errors.push('请输入合理的腰围')
  if (!Number.isFinite(sleep) || sleep < 0 || sleep > 24) errors.push('睡眠时长应在 0–24 小时之间')
  if (!['1', '2', '3', '4', '5'].includes(draft.energy)) errors.push('请选择精力评分')
  if (!['1', '2', '3', '4', '5'].includes(draft.soreness)) errors.push('请选择酸痛程度')
  return errors
}
