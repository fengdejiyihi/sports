const weekdayNumbers: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

export function reminderDue(now: Date, reminderTime: string, timezone: string, weekdays: number[], lastSentOn?: string | null) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map((part) => [part.type, part.value]))
  const date = `${parts.year}-${parts.month}-${parts.day}`
  const minute = Number(parts.hour) * 60 + Number(parts.minute)
  const [hour, minutes] = reminderTime.split(':').map(Number)
  const target = hour * 60 + minutes
  return { date, due: weekdays.includes(weekdayNumbers[parts.weekday]) && lastSentOn !== date && minute >= target && minute < target + 30 }
}
