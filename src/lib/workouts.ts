export type WorkoutPlanItemDraft = { exerciseName: string; sets: string; repsMin: string; repsMax: string }
export type WorkoutPlanDraft = { name: string; weekday: string; durationMinutes: string; isActive: boolean; items: WorkoutPlanItemDraft[] }
export type WorkoutPlan = WorkoutPlanDraft & { id: string }

export const weekdayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export function emptyWorkoutPlan(): WorkoutPlanDraft {
  return { name: '', weekday: '1', durationMinutes: '40', isActive: true, items: [{ exerciseName: '', sets: '3', repsMin: '8', repsMax: '12' }] }
}

export function validateWorkoutPlan(plan: WorkoutPlanDraft): string {
  const weekday = Number(plan.weekday)
  const duration = Number(plan.durationMinutes)
  if (!plan.name.trim() || plan.name.trim().length > 80) return '请输入 1–80 字的计划名称'
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return '请选择训练日'
  if (!Number.isInteger(duration) || duration < 1 || duration > 600) return '训练时长应在 1–600 分钟之间'
  if (!plan.items.length || plan.items.length > 20) return '每个计划需要 1–20 个动作'
  for (const item of plan.items) {
    const sets = Number(item.sets)
    const repsMin = Number(item.repsMin)
    const repsMax = Number(item.repsMax)
    if (!item.exerciseName.trim() || item.exerciseName.trim().length > 80) return '请输入 1–80 字的动作名称'
    if (!Number.isInteger(sets) || sets < 1 || sets > 20) return '动作组数应在 1–20 之间'
    if (!Number.isInteger(repsMin) || !Number.isInteger(repsMax) || repsMin < 1 || repsMax < repsMin || repsMax > 200) return '动作次数应为 1–200 的合理区间'
  }
  return ''
}
