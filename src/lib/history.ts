export type HistoryCheckin = { date: string; status: 'completed' | 'skipped' | 'backfill'; durationMinutes: number | null; sleepMinutes: number | null }
export type HistoryMeasurement = { date: string; weightKg: number; waistCm: number | null }
export type HistoryDay = HistoryCheckin & { weightKg: number | null; waistCm: number | null }

export function mergeHistory(checkins: HistoryCheckin[], measurements: HistoryMeasurement[]): HistoryDay[] {
  const byDate = new Map(checkins.map((checkin) => [checkin.date, { ...checkin, weightKg: null, waistCm: null }]))
  measurements.forEach((measurement) => {
    const entry = byDate.get(measurement.date)
    if (entry) Object.assign(entry, measurement)
  })
  return [...byDate.values()].sort((left, right) => right.date.localeCompare(left.date))
}
