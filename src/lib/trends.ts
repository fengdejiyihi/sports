export type MeasurementPoint = { measuredOn: string; weightKg: number; waistCm: number | null }

export function trendDelta(points: MeasurementPoint[], key: 'weightKg' | 'waistCm') {
  const values = points.map((point) => point[key]).filter((value): value is number => value != null)
  return values.length > 1 ? values[values.length - 1] - values[0] : null
}

export function trendPoints(points: MeasurementPoint[], key: 'weightKg' | 'waistCm') {
  const values = points.map((point) => point[key]).filter((value): value is number => value != null)
  if (values.length < 2) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  return values.map((value, index) => `${(index / (values.length - 1)) * 100},${88 - ((value - min) / span) * 76}`).join(' ')
}
