import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { DayPicker } from '@daypicker/react'
import { zhCN } from '@daypicker/react/locale'
import '@daypicker/react/style.css'
import { emptyCheckinDraft, validateCheckin } from './lib/checkin'
import type { CheckinDraft } from './lib/checkin'
import { fileToDataUrl, mealTotals, mealTypeLabels, validateImageMeta, validateManualMeal } from './lib/nutrition'
import type { DietPlan, FoodAnalysis, ManualMealDraft, MealEntry, MealType } from './lib/nutrition'
import { loadReminder, saveReminder } from './lib/reminders'
import type { ReminderSettings } from './lib/reminders'
import { ageFromBirthDate, emptyProfile, isValidWeight, validateProfile } from './lib/profile'
import type { ProfileDraft } from './lib/profile'
import { askNutrition, cloudEnabled, deleteMeal, loadCheckinHistory, loadMeals, loadMeasurements, loadProfile, loadToday, requestMagicLink, saveBodyWeight, saveCheckin, saveManualMeal, saveMeal, saveProfile, subscribeToUserData, supabase, updateMeal } from './lib/supabase'
import { trendDelta, trendPoints } from './lib/trends'
import type { MeasurementPoint } from './lib/trends'
import type { HistoryDay } from './lib/history'

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
const localKey = `fitness-checkin:${today}`
const dateFromKey = (value: string) => new Date(`${value}T12:00:00`)
const dateKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`

function readLocalDraft() {
  try { return JSON.parse(localStorage.getItem(localKey) || '') as CheckinDraft }
  catch { return emptyCheckinDraft() }
}

function App() {
  const requestedPage = new URLSearchParams(location.search).get('page')
  const [page, setPage] = useState<'today' | 'data' | 'checkin' | 'nutrition' | 'reminders' | 'profile'>(requestedPage === 'checkin' ? 'checkin' : 'today')
  const [draft, setDraft] = useState<CheckinDraft>(readLocalDraft)
  const [checkinDate, setCheckinDate] = useState(today)
  const [saved, setSaved] = useState(() => Boolean(localStorage.getItem(localKey)))
  const [errors, setErrors] = useState<string[]>([])
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(!cloudEnabled)
  const [saving, setSaving] = useState(false)
  const [syncMessage, setSyncMessage] = useState(cloudEnabled ? '正在连接云端…' : '本地模式 · 配置 Supabase 后启用跨设备同步')
  const [profile, setProfile] = useState<ProfileDraft>(emptyProfile)
  const [profileReady, setProfileReady] = useState(!cloudEnabled)
  const [profileSaved, setProfileSaved] = useState(!cloudEnabled)
  const lastUserId = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!supabase) return
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (nextSession?.user.id !== lastUserId.current) {
        setDraft(emptyCheckinDraft())
        setSaved(false)
        setErrors([])
        setProfile(emptyProfile())
        setProfileReady(!nextSession)
        setProfileSaved(!nextSession)
        setSyncMessage(nextSession ? '正在同步你的数据…' : '正在连接云端…')
      }
      lastUserId.current = nextSession?.user.id
      setSession(nextSession)
      setAuthReady(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!supabase || !session) return
    let active = true
    const refresh = async () => {
      try {
        const [{ checkin, measurement, latestMeasurement }, nextProfile] = await Promise.all([loadToday(session.user.id, checkinDate), loadProfile(session.user.id)])
        if (!active) return
        const empty = emptyCheckinDraft()
        const currentWeight = measurement?.weight_kg == null ? latestMeasurement?.weight_kg == null ? empty.weightKg : String(latestMeasurement.weight_kg) : String(measurement.weight_kg)
        setDraft({
          ...empty,
          status: (checkin?.status || empty.status) as CheckinDraft['status'],
          durationMinutes: checkin?.duration_minutes == null ? empty.durationMinutes : String(checkin.duration_minutes),
          weightKg: currentWeight,
          waistCm: measurement?.waist_cm == null ? empty.waistCm : String(measurement.waist_cm),
          sleepHours: checkin?.sleep_minutes == null ? empty.sleepHours : String(Number((checkin.sleep_minutes / 60).toFixed(2))),
          energy: checkin?.energy_rating == null ? empty.energy : String(checkin.energy_rating),
          soreness: checkin?.soreness_rating == null ? empty.soreness : String(checkin.soreness_rating),
          notes: checkin?.notes || '',
        })
        setProfile(nextProfile)
        setProfileReady(true)
        const completeProfile = !validateProfile(nextProfile).length && isValidWeight(currentWeight)
        setProfileSaved(completeProfile)
        if (!completeProfile) setPage('profile')
        setSaved(Boolean(checkin || measurement))
        setSyncMessage('云端已同步')
      } catch (error) {
        if (active) { setProfileReady(true); setSyncMessage(`同步失败：${error instanceof Error ? error.message : '请稍后重试'}`) }
      }
    }
    void refresh()
    const unsubscribe = subscribeToUserData(session.user.id, () => { void refresh() })
    return () => { active = false; unsubscribe() }
  }, [session, checkinDate])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextErrors = validateCheckin(draft)
    setErrors(nextErrors)
    if (nextErrors.length > 0) return
    setSaving(true)
    try {
      if (supabase && session) {
        await saveCheckin(checkinDate, draft)
        setSyncMessage('云端已同步')
      } else {
        localStorage.setItem(localKey, JSON.stringify(draft))
      }
      setSaved(checkinDate === today)
      setPage(checkinDate === today ? 'today' : 'data')
    } catch (error) {
      setErrors([`保存失败：${error instanceof Error ? error.message : '请稍后重试'}`])
    } finally {
      setSaving(false)
    }
  }

  if (!authReady) return <CenteredMessage text="正在恢复登录状态…" />
  if (cloudEnabled && !session) return <Login />
  if (session && !profileReady) return <CenteredMessage text="正在读取你的资料…" />

  const stat = { weight: draft.weightKg, waist: draft.waistCm, sleep: draft.sleepHours }
  const profileIncomplete = Boolean(session && !profileSaved)
  const navItems = profileIncomplete ? ['profile'] as const : ['today', 'data', 'checkin', 'nutrition', 'reminders', 'profile'] as const

  return <div className="min-h-screen bg-[#f4f7f4] text-[#17211a]">
    <header className="border-b border-[#dce6dd] bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4">
        <div className="flex items-center gap-3 font-bold tracking-tight"><span className="grid size-8 place-items-center rounded-xl bg-[#256a49] text-white">✓</span>燃动</div>
        <div className="flex items-center gap-3 text-sm text-[#5e6c62]"><span className="hidden sm:inline">{session?.user.email || 'ZY · 本地演示'}</span>{session && <button className="font-semibold text-[#256a49]" onClick={() => { void supabase?.auth.signOut() }} type="button">退出</button>}</div>
      </div>
    </header>
    <main className="mx-auto max-w-5xl px-5 py-8">
      <p className={`mb-5 rounded-xl px-4 py-3 text-sm ${syncMessage.startsWith('同步失败') ? 'bg-[#fff1ef] text-[#a13d2e]' : 'bg-[#e7f2e9] text-[#346748]'}`}>{syncMessage}</p>
      <nav className="mb-8 flex gap-2 overflow-x-auto" aria-label="主导航">{navItems.map((item) => <button className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold ${page === item ? 'bg-[#dff1e4] text-[#1e6743]' : 'bg-white text-[#617065]'}`} key={item} onClick={() => { if (item === 'today' || item === 'checkin') setCheckinDate(today); setPage(item) }} type="button">{{ today: '今日', data: '数据中心', checkin: '每日打卡', nutrition: '饮食账本', reminders: '提醒', profile: '我的资料' }[item]}</button>)}</nav>
      {page === 'today' && <Today saved={saved} stat={stat} targetWeightKg={profile.targetWeightKg} onCheckin={() => { setCheckinDate(today); setPage('checkin') }} />}
      {page === 'data' && <DataCenter userId={session?.user.id} targetWeightKg={profile.targetWeightKg} onOpenDate={(date) => { setCheckinDate(date); setPage('checkin') }} />}
      {page === 'checkin' && <Checkin date={checkinDate} draft={draft} errors={errors} saving={saving} setDraft={setDraft} submit={submit} />}
      {page === 'nutrition' && <Nutrition key={session?.user.id} userId={session?.user.id} stat={stat} profile={profile} />}
      {page === 'reminders' && <Reminders key={session?.user.id} userId={session?.user.id} />}
      {page === 'profile' && <Profile key={session?.user.id} userId={session?.user.id} profile={profile} weightKg={draft.weightKg} setProfile={setProfile} setWeightKg={(weightKg) => setDraft({ ...draft, weightKg })} onSaved={() => setProfileSaved(true)} />}
    </main>
  </div>
}

function Login() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSending(true); setMessage('')
    try { await requestMagicLink(email); setMessage('登录链接已发送，请打开邮箱完成登录。') }
    catch (error) { setMessage(error instanceof Error ? error.message : '发送失败，请稍后重试。') }
    finally { setSending(false) }
  }
  return <div className="grid min-h-screen place-items-center bg-[#f4f7f4] px-5"><form className="w-full max-w-md rounded-3xl border border-[#dfe9e0] bg-white p-7 shadow-sm" onSubmit={send}><div className="flex items-center gap-3 text-xl font-bold"><span className="grid size-9 place-items-center rounded-xl bg-[#256a49] text-white">✓</span>登录燃动</div><p className="mt-4 text-sm text-[#647268]">输入邮箱，我们会发送免密码登录链接。登录后手机和电脑使用同一份数据。</p><label className="mt-6 block"><span className="text-sm font-semibold">邮箱</span><input className="mt-2 w-full rounded-xl border border-[#d6e2d8] px-3 py-3 outline-none focus:border-[#438263]" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label>{message && <p className="mt-4 text-sm text-[#346748]" role="status">{message}</p>}<button className="mt-6 w-full rounded-xl bg-[#256a49] px-5 py-3 text-sm font-bold text-white disabled:opacity-60" disabled={sending} type="submit">{sending ? '发送中…' : '发送登录链接'}</button></form></div>
}

function Today({ saved, stat, targetWeightKg, onCheckin }: { saved: boolean; stat: { weight: string; waist: string; sleep: string }; targetWeightKg: string; onCheckin: () => void }) {
  return <section><p className="text-sm font-semibold text-[#438263]">今天 · 减脂计划</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{targetWeightKg ? `今天，为 ${targetWeightKg} kg 前进一步` : '今天，为自己前进一步'}</h1><p className="mt-3 text-[#647268]">完成训练后打卡，身体数据会自动更新。</p>{saved && <p className="mt-5 rounded-xl bg-[#dff1e4] px-4 py-3 text-sm font-semibold text-[#1e6743]">今天的打卡已保存。</p>}<div className="mt-7 grid gap-4 lg:grid-cols-[1.45fr_1fr]"><article className="rounded-3xl bg-[#256a49] p-6 text-white shadow-sm"><h2 className="text-xl font-bold">今晚训练：力量 A</h2><p className="mt-3 max-w-xl text-[#d9f2e1]">深蹲、俯卧撑、划船、臀桥、平板支撑 · 预计 40 分钟</p><button className="mt-6 rounded-xl bg-[#cef1d9] px-4 py-2.5 text-sm font-bold text-[#17452e]" onClick={onCheckin} type="button">开始打卡</button></article><article className="rounded-3xl border border-[#dfe9e0] bg-white p-6 shadow-sm"><h2 className="text-lg font-bold">身体状态</h2><div className="mt-2 divide-y divide-[#edf2ed]"><SummaryRow label="体重" detail="今日记录" value={stat.weight ? `${stat.weight} kg` : '未记录'} /><SummaryRow label="腰围" detail="今日记录" value={stat.waist ? `${stat.waist} cm` : '未记录'} /><SummaryRow label="睡眠" detail="今日记录" value={stat.sleep ? `${stat.sleep} h` : '未记录'} /></div></article></div></section>
}

function DataCenter({ userId, targetWeightKg, onOpenDate }: { userId?: string; targetWeightKg: string; onOpenDate: (date: string) => void }) {
  const [days, setDays] = useState<7 | 30 | 90>(30)
  const [points, setPoints] = useState<MeasurementPoint[]>([])
  const [history, setHistory] = useState<HistoryDay[]>([])
  const [historyDate, setHistoryDate] = useState(today)
  const [calendarMonth, setCalendarMonth] = useState(today.slice(0, 7))
  const [calendarHistory, setCalendarHistory] = useState<HistoryDay[]>([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(Boolean(userId))

  useEffect(() => {
    if (!userId) return
    let active = true
    const since = new Date(`${today}T00:00:00Z`)
    since.setUTCDate(since.getUTCDate() - days + 1)
    const rangeStart = since.toISOString().slice(0, 10)
    Promise.all([loadMeasurements(userId, rangeStart), loadCheckinHistory(userId, rangeStart)]).then(([nextPoints, nextHistory]) => {
      if (active) { setPoints(nextPoints); setHistory(nextHistory) }
    }).catch((error) => {
      if (active) setMessage(error instanceof Error ? error.message : '趋势读取失败')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [days, userId])

  useEffect(() => {
    if (!userId) return
    const [year, month] = calendarMonth.split('-').map(Number)
    const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
    void loadCheckinHistory(userId, `${calendarMonth}-01`, monthEnd).then(setCalendarHistory).catch((error) => setMessage(error instanceof Error ? error.message : '日历读取失败'))
  }, [calendarMonth, userId])

  const latest = points.at(-1)
  const weightDelta = trendDelta(points, 'weightKg')
  const waistDelta = trendDelta(points, 'waistCm')
  const calendarModifiers = {
    completed: calendarHistory.filter((entry) => entry.status === 'completed').map((entry) => dateFromKey(entry.date)),
    backfill: calendarHistory.filter((entry) => entry.status === 'backfill').map((entry) => dateFromKey(entry.date)),
    skipped: calendarHistory.filter((entry) => entry.status === 'skipped').map((entry) => dateFromKey(entry.date)),
  }

  return <section>
    <p className="text-sm font-semibold text-[#438263]">身体数据</p>
    <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">数据中心</h1>
    <p className="mt-3 text-[#647268]">基于你已保存的测量与打卡记录计算，不会混入其他账号的数据。</p>
    <div className="mt-5 flex gap-2" aria-label="趋势时间范围">{([7, 30, 90] as const).map((value) => <button className={`rounded-xl px-4 py-2 text-sm font-semibold ${days === value ? 'bg-[#256a49] text-white' : 'bg-white text-[#617065]'}`} key={value} onClick={() => setDays(value)} type="button">{value} 天</button>)}</div>
    {message && <p className="mt-5 rounded-xl bg-[#fff1ef] px-4 py-3 text-sm text-[#a13d2e]" role="alert">{message}</p>}
    <div className="mt-7 grid gap-4 sm:grid-cols-3"><MetricCard label="当前体重" value={latest ? `${latest.weightKg.toFixed(1)} kg` : '未记录'} detail={weightDelta == null ? '再记录一次即可看趋势' : `${days} 天 ${formatDelta(weightDelta, 'kg')}`} /><MetricCard label="目标体重" value={targetWeightKg ? `${targetWeightKg} kg` : '未设置'} detail="可在我的资料中修改" /><MetricCard label="当前腰围" value={latest?.waistCm == null ? '未记录' : `${latest.waistCm.toFixed(1)} cm`} detail={waistDelta == null ? '再记录一次即可看趋势' : `${days} 天 ${formatDelta(waistDelta, 'cm')}`} /></div>
    {loading ? <p className="mt-7 text-sm text-[#647268]">正在读取你的历史记录…</p> : <>
      <div className="mt-7 grid gap-4 lg:grid-cols-2">
        {points.length < 2 ? <article className="rounded-3xl border border-dashed border-[#cbdccb] bg-white p-6"><h2 className="text-lg font-bold">还没有足够的趋势数据</h2><p className="mt-2 text-sm text-[#647268]">连续记录至少两天体重后，这里会显示你的变化曲线。</p></article> : <><TrendChart label="体重趋势" unit="kg" points={points} valueKey="weightKg" /><TrendChart label="腰围趋势" unit="cm" points={points.filter((point) => point.waistCm != null)} valueKey="waistCm" /></>}
        <article className="rounded-3xl border border-[#dfe9e0] bg-white p-6 shadow-sm"><h2 className="text-lg font-bold">查看或补录日期</h2><p className="mt-2 text-sm text-[#647268]">选择任意一天，进入原有打卡表单查看或更新数据。</p><div className="mt-5 flex flex-wrap gap-3"><input className="rounded-xl border border-[#d6e2d8] px-3 py-2.5" max={today} onChange={(event) => setHistoryDate(event.target.value)} type="date" value={historyDate} /><button className="rounded-xl bg-[#256a49] px-4 py-2.5 text-sm font-bold text-white" onClick={() => onOpenDate(historyDate)} type="button">查看这一天</button></div></article>
      </div>
      <article className="mt-4 rounded-3xl border border-[#dfe9e0] bg-white p-6 shadow-sm"><h2 className="text-lg font-bold">打卡日历</h2><p className="mt-2 text-sm text-[#647268]">点击本月日期即可查看或补录。</p><DayPicker className="fitness-calendar mt-4" disabled={{ after: dateFromKey(today) }} endMonth={dateFromKey(`${today.slice(0, 7)}-01`)} locale={zhCN} mode="single" modifiers={calendarModifiers} modifiersClassNames={{ completed: 'rdp-day_completed', backfill: 'rdp-day_backfill', skipped: 'rdp-day_skipped' }} month={dateFromKey(`${calendarMonth}-01`)} onDayClick={(date) => onOpenDate(dateKey(date))} onMonthChange={(date) => setCalendarMonth(dateKey(date).slice(0, 7))} /><p className="mt-4 text-xs text-[#758378]">深绿：已完成　浅绿：补录　浅红：跳过</p></article>
      <article className="mt-4 rounded-3xl border border-[#dfe9e0] bg-white p-6 shadow-sm"><h2 className="text-lg font-bold">最近打卡</h2>{history.length ? <div className="mt-3 divide-y divide-[#edf2ed]">{history.slice(0, 7).map((entry) => <button className="flex w-full items-center justify-between gap-3 py-3 text-left" key={entry.date} onClick={() => onOpenDate(entry.date)} type="button"><span><strong className="block">{entry.date}</strong><span className="mt-1 block text-sm text-[#647268]">{entry.status === 'completed' ? `已完成${entry.durationMinutes ? ` · ${entry.durationMinutes} 分钟` : ''}` : entry.status === 'skipped' ? '已跳过' : '补录'} · {entry.weightKg == null ? '未记录体重' : `${entry.weightKg} kg`}</span></span><span className="text-sm font-semibold text-[#438263]">查看</span></button>)}</div> : <p className="mt-3 text-sm text-[#647268]">这个区间还没有打卡记录。</p>}</article>
    </>}
  </section>
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) { return <article className="rounded-3xl border border-[#dfe9e0] bg-white p-5 shadow-sm"><p className="text-sm font-semibold text-[#647268]">{label}</p><p className="mt-2 text-2xl font-bold tracking-tight">{value}</p><p className="mt-2 text-xs text-[#758378]">{detail}</p></article> }
function TrendChart({ label, unit, points, valueKey }: { label: string; unit: string; points: MeasurementPoint[]; valueKey: 'weightKg' | 'waistCm' }) { const values = points.map((point) => point[valueKey]).filter((value): value is number => value != null); return <article className="rounded-3xl border border-[#dfe9e0] bg-white p-6 shadow-sm"><div className="flex items-baseline justify-between gap-3"><h2 className="text-lg font-bold">{label}</h2><span className="text-sm font-semibold text-[#438263]">{values.at(-1)?.toFixed(1)} {unit}</span></div><svg aria-label={label} className="mt-5 h-40 w-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100"><line stroke="#e6eee7" strokeWidth="1" x1="0" x2="100" y1="12" y2="12" /><line stroke="#e6eee7" strokeWidth="1" x1="0" x2="100" y1="50" y2="50" /><line stroke="#e6eee7" strokeWidth="1" x1="0" x2="100" y1="88" y2="88" /><polyline fill="none" points={trendPoints(points, valueKey)} stroke="#256a49" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" vectorEffect="non-scaling-stroke" /></svg><div className="mt-2 flex justify-between text-xs text-[#758378]"><span>{points[0]?.measuredOn.slice(5)}</span><span>{points.at(-1)?.measuredOn.slice(5)}</span></div></article> }
function formatDelta(value: number, unit: string) { return `${value > 0 ? '+' : ''}${value.toFixed(1)} ${unit}` }

function Checkin({ date, draft, errors, saving, setDraft, submit }: { date: string; draft: CheckinDraft; errors: string[]; saving: boolean; setDraft: (draft: CheckinDraft) => void; submit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <section className="max-w-3xl"><p className="text-sm font-semibold text-[#438263]">每日记录</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{date === today ? '完成今天的打卡' : `编辑 ${date} 的打卡`}</h1><p className="mt-3 text-[#647268]">保存后，同一账号登录的设备会自动更新。</p><form className="mt-7 rounded-3xl border border-[#dfe9e0] bg-white p-6 shadow-sm" onSubmit={submit}><div className="grid gap-4 sm:grid-cols-2"><Select label="训练状态" value={draft.status} onChange={(value) => setDraft({ ...draft, status: value as CheckinDraft['status'] })} options={[['completed', '已完成'], ['skipped', '跳过'], ['backfill', '补录']]} /><Field label="训练时长（分钟）" value={draft.durationMinutes} onChange={(value) => setDraft({ ...draft, durationMinutes: value })} /><Field label="体重（kg）" value={draft.weightKg} onChange={(value) => setDraft({ ...draft, weightKg: value })} /><Field label="腰围（cm）" value={draft.waistCm} onChange={(value) => setDraft({ ...draft, waistCm: value })} /><Field label="睡眠（小时）" value={draft.sleepHours} onChange={(value) => setDraft({ ...draft, sleepHours: value })} /><Select label="精力评分" value={draft.energy} onChange={(value) => setDraft({ ...draft, energy: value })} options={[['5', '5 · 精力充沛'], ['4', '4 · 精力不错'], ['3', '3 · 一般'], ['2', '2 · 疲惫'], ['1', '1 · 很差']]} /><Select label="酸痛程度" value={draft.soreness} onChange={(value) => setDraft({ ...draft, soreness: value })} options={[['1', '1 · 几乎没有'], ['2', '2 · 轻微'], ['3', '3 · 明显'], ['4', '4 · 较重'], ['5', '5 · 很重']]} /><label className="sm:col-span-2"><span className="text-sm font-semibold">备注</span><textarea className="mt-2 min-h-24 w-full rounded-xl border border-[#d6e2d8] px-3 py-2.5 outline-none focus:border-[#438263]" onChange={(event) => setDraft({ ...draft, notes: event.target.value })} value={draft.notes} /></label></div>{errors.length > 0 && <p className="mt-4 rounded-xl bg-[#fff1ef] px-4 py-3 text-sm text-[#a13d2e]" role="alert">{errors.join('；')}</p>}<button className="mt-6 rounded-xl bg-[#256a49] px-5 py-3 text-sm font-bold text-white disabled:opacity-60" disabled={saving} type="submit">{saving ? '保存中…' : '保存打卡'}</button></form></section>
}

function Nutrition({ userId, stat, profile }: { userId?: string; stat: { weight: string; waist: string }; profile: ProfileDraft }) {
  const [plan, setPlan] = useState<DietPlan | null>(null)
  const [analysis, setAnalysis] = useState<FoodAnalysis | null>(null)
  const [preview, setPreview] = useState('')
  const [meals, setMeals] = useState<MealEntry[]>([])
  const [ledgerDate, setLedgerDate] = useState(today)
  const [mealType, setMealType] = useState<MealType>('snack')
  const [manual, setManual] = useState<ManualMealDraft>({ mealName: '', mealType: 'breakfast', totalCalories: '', proteinGrams: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [message, setMessage] = useState(userId ? '' : '配置 Supabase 并登录后可使用饮食账本。')
  const [loading, setLoading] = useState(false)
  const refreshMeals = async () => { if (!userId) return; try { setMeals(await loadMeals(userId, ledgerDate)) } catch (error) { setMessage(error instanceof Error ? error.message : '读取饮食账本失败') } }
  useEffect(() => { if (!userId) return; void loadMeals(userId, ledgerDate).then(setMeals).catch((error) => setMessage(error instanceof Error ? error.message : '读取饮食账本失败')) }, [userId, ledgerDate])
  const totals = mealTotals(meals)

  const recommend = async () => {
    const age = ageFromBirthDate(profile.birthDate)
    if (validateProfile(profile).length || !age) { setMessage('请先在“我的资料”中完善出生日期、身高和目标体重。'); return }
    setLoading(true); setMessage('')
    try { setPlan(await askNutrition({ action: 'recommend', weightKg: Number(stat.weight), waistCm: Number(stat.waist), profile: { sex: profile.sex, age, heightCm: Number(profile.heightCm), targetWeightKg: Number(profile.targetWeightKg) } }) as DietPlan) }
    catch (error) { setMessage(error instanceof Error ? error.message : '生成失败') }
    finally { setLoading(false) }
  }

  const recognize = async (file?: File) => {
    if (!file) return
    const invalid = validateImageMeta(file)
    if (invalid) { setMessage(invalid); return }
    setLoading(true); setMessage(''); setAnalysis(null)
    try { const dataUrl = await fileToDataUrl(file); setPreview(dataUrl); setAnalysis(await askNutrition({ action: 'recognize', imageDataUrl: dataUrl }) as FoodAnalysis) }
    catch (error) { setMessage(error instanceof Error ? error.message : '识别失败') }
    finally { setLoading(false) }
  }

  const confirm = async () => {
    if (!userId || !analysis) return
    setLoading(true); setMessage('')
    try { await saveMeal(userId, ledgerDate, analysis, mealType); await refreshMeals(); setAnalysis(null); setPreview(''); setMessage('这餐已保存到饮食账本。') }
    catch (error) { setMessage(error instanceof Error ? error.message : '保存失败') }
    finally { setLoading(false) }
  }

  const saveManual = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const error = validateManualMeal(manual)
    if (error) { setMessage(error); return }
    if (!userId) return
    setLoading(true); setMessage('')
    try { if (editingId) await updateMeal(userId, editingId, manual); else await saveManualMeal(userId, ledgerDate, manual); await refreshMeals(); setManual({ mealName: '', mealType: manual.mealType, totalCalories: '', proteinGrams: '' }); setEditingId(null); setMessage(editingId ? '餐食已更新。' : '手动记录已保存。') }
    catch (error) { setMessage(error instanceof Error ? error.message : '保存失败') }
    finally { setLoading(false) }
  }

  const editMeal = (meal: MealEntry) => { setEditingId(meal.id); setManual({ mealName: meal.mealName, mealType: meal.mealType, totalCalories: String(meal.totalCalories), proteinGrams: String(meal.proteinGrams) }) }
  const removeMeal = async (id: string) => {
    if (!userId || !window.confirm('确定删除这条餐食记录吗？')) return
    setLoading(true); setMessage('')
    try { await deleteMeal(userId, id); await refreshMeals(); if (editingId === id) { setEditingId(null); setManual({ mealName: '', mealType: 'breakfast', totalCalories: '', proteinGrams: '' }) }; setMessage('餐食已删除。') }
    catch (error) { setMessage(error instanceof Error ? error.message : '删除失败') }
    finally { setLoading(false) }
  }

  return <section><p className="text-sm font-semibold text-[#438263]">{ledgerDate === today ? '今日饮食' : `${ledgerDate} 饮食`}</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">饮食账本</h1><p className="mt-3 text-[#647268]">按日期查看和补录每一餐；识图结果仍需确认后才保存。</p><label className="mt-5 block max-w-56"><span className="text-sm font-semibold">账本日期</span><input className="mt-2 w-full rounded-xl border border-[#d6e2d8] px-3 py-2.5" max={today} onChange={(event) => { setLedgerDate(event.target.value); setEditingId(null); setManual({ mealName: '', mealType: 'breakfast', totalCalories: '', proteinGrams: '' }) }} type="date" value={ledgerDate} /></label>{message && <p className="mt-5 rounded-xl bg-[#fff7df] px-4 py-3 text-sm text-[#765b18]" role="status">{message}</p>}<article className="mt-7 rounded-3xl bg-[#256a49] p-6 text-white shadow-sm"><p className="text-sm font-semibold text-[#d9f2e1]">{ledgerDate === today ? '今日' : ledgerDate} 已记录 {meals.length} 餐</p><div className="mt-3 flex flex-wrap gap-x-8 gap-y-2"><p className="text-3xl font-bold">{Math.round(totals.calories)} <span className="text-base text-[#d9f2e1]">kcal</span></p><p className="text-3xl font-bold">{totals.protein.toFixed(1)} <span className="text-base text-[#d9f2e1]">g 蛋白质</span></p></div></article><div className="mt-4 grid gap-4 lg:grid-cols-2"><article className="rounded-3xl border border-[#dfe9e0] bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">这天吃了什么</h2>{meals.length ? <div className="mt-3 divide-y divide-[#edf2ed]">{(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((type) => meals.filter((meal) => meal.mealType === type).map((meal) => <div className="flex items-center justify-between gap-3 py-3" key={meal.id}><div><p className="font-semibold">{mealTypeLabels[type]} · {meal.mealName}</p><p className="mt-1 text-xs text-[#758378]">{meal.source === 'vision' ? '拍照识别' : meal.source === 'ai_plan' ? 'AI 计划' : '手动记录'} · 蛋白质 {meal.proteinGrams} g</p><div className="mt-2 flex gap-3"><button className="text-xs font-semibold text-[#256a49]" onClick={() => editMeal(meal)} type="button">编辑</button><button className="text-xs font-semibold text-[#a13d2e]" disabled={loading} onClick={() => { void removeMeal(meal.id) }} type="button">删除</button></div></div><strong>{meal.totalCalories} kcal</strong></div>))}</div> : <p className="mt-3 text-sm text-[#647268]">这一天还没有记录餐食。</p>}</article><form className="rounded-3xl border border-[#dfe9e0] bg-white p-6 shadow-sm" onSubmit={saveManual}><h2 className="text-xl font-bold">{editingId ? '编辑餐食' : '手动添加'}</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="餐食名称" value={manual.mealName} onChange={(mealName) => setManual({ ...manual, mealName })} /><Select label="餐次" value={manual.mealType} onChange={(mealType) => setManual({ ...manual, mealType: mealType as MealType })} options={[['breakfast', '早餐'], ['lunch', '午餐'], ['dinner', '晚餐'], ['snack', '加餐']]} /><Field label="热量（kcal）" value={manual.totalCalories} onChange={(totalCalories) => setManual({ ...manual, totalCalories })} /><Field label="蛋白质（g）" value={manual.proteinGrams} onChange={(proteinGrams) => setManual({ ...manual, proteinGrams })} /></div><div className="mt-5 flex gap-3"><button className="rounded-xl bg-[#256a49] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50" disabled={!userId || loading} type="submit">{editingId ? '保存修改' : '保存餐食'}</button>{editingId && <button className="rounded-xl bg-[#edf2ed] px-4 py-2.5 text-sm font-bold text-[#526055]" onClick={() => { setEditingId(null); setManual({ mealName: '', mealType: 'breakfast', totalCalories: '', proteinGrams: '' }) }} type="button">取消</button>}</div></form><article className="rounded-3xl border border-[#dfe9e0] bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">AI 饮食建议</h2><p className="mt-2 text-sm text-[#647268]">当前 {stat.weight ? `${stat.weight} kg` : '未记录体重'} · {profile.targetWeightKg ? `目标 ${profile.targetWeightKg} kg` : '请先完善资料'}</p><button className="mt-5 rounded-xl bg-[#256a49] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50" disabled={!userId || loading} onClick={recommend} type="button">{loading ? '分析中…' : '生成今日三餐'}</button>{plan && <div className="mt-5"><p className="font-bold">目标约 {plan.targetCalories} kcal · 蛋白质 {plan.proteinGrams} g</p><div className="mt-3 divide-y divide-[#edf2ed]">{plan.meals.map((meal) => <div className="py-3" key={meal.name}><div className="flex justify-between gap-3 font-semibold"><span>{meal.name}</span><span>{meal.calories} kcal</span></div><p className="mt-1 text-sm text-[#647268]">{meal.foods} · 蛋白质 {meal.proteinGrams} g</p></div>)}</div><p className="mt-3 text-xs text-[#758378]">{plan.note}</p></div>}</article><article className="rounded-3xl border border-[#dfe9e0] bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">拍照识别食物</h2><p className="mt-2 text-sm text-[#647268]">选择餐次后拍照，图片不会保存到数据库。</p><div className="mt-4 max-w-40"><Select label="归入餐次" value={mealType} onChange={(value) => setMealType(value as MealType)} options={[['breakfast', '早餐'], ['lunch', '午餐'], ['dinner', '晚餐'], ['snack', '加餐']]} /></div><label className={`mt-5 inline-block rounded-xl px-4 py-2.5 text-sm font-bold text-white ${userId && !loading ? 'cursor-pointer bg-[#256a49]' : 'bg-[#8da398]'}`}>选择食物图片<input accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" disabled={!userId || loading} onChange={(event) => { void recognize(event.target.files?.[0]) }} type="file" /></label>{preview && <img alt="待识别食物" className="mt-5 max-h-56 w-full rounded-2xl object-cover" src={preview} />}{analysis && <div className="mt-5"><div className="flex justify-between gap-3 font-bold"><span>{analysis.mealName}</span><span>约 {analysis.totalCalories} kcal</span></div><ul className="mt-3 space-y-2 text-sm">{analysis.items.map((item, index) => <li className="rounded-xl bg-[#f4f7f4] p-3" key={`${item.name}-${index}`}>{item.name} · {item.portion} · {item.calories} kcal · 蛋白质 {item.proteinGrams} g</li>)}</ul><p className="mt-3 text-xs text-[#758378]">{analysis.note}</p><button className="mt-4 rounded-xl bg-[#256a49] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50" disabled={loading} onClick={confirm} type="button">确认并保存</button></div>}</article></div><p className="mt-5 text-xs text-[#758378]">AI 只能估算食物与份量，不能替代称重、营养数据库或医疗建议。</p></section>
}

function Profile({ userId, profile, weightKg, setProfile, setWeightKg, onSaved }: { userId?: string; profile: ProfileDraft; weightKg: string; setProfile: (profile: ProfileDraft) => void; setWeightKg: (weightKg: string) => void; onSaved: () => void }) {
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const errors = validateProfile(profile)
    if (errors.length) { setMessage(errors.join('；')); return }
    if (!isValidWeight(weightKg)) { setMessage('请输入合理的当前体重'); return }
    if (!userId) return
    setSaving(true); setMessage('')
    try { await saveProfile(userId, profile); await saveBodyWeight(userId, today, weightKg); onSaved(); setMessage('资料已保存，当前体重已同步。') }
    catch (error) { setMessage(error instanceof Error ? error.message : '保存失败') }
    finally { setSaving(false) }
  }
  return <section className="max-w-2xl"><p className="text-sm font-semibold text-[#438263]">个人设置</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">先完善你的资料</h1><p className="mt-3 text-[#647268]">首次使用需要填写资料，用于生成适合你的目标和 AI 饮食建议。出生日期会自动计算年龄。</p>{message && <p className="mt-5 rounded-xl bg-[#fff7df] px-4 py-3 text-sm text-[#765b18]" role="status">{message}</p>}<form className="mt-7 rounded-3xl border border-[#dfe9e0] bg-white p-6 shadow-sm" onSubmit={submit}><div className="grid gap-4 sm:grid-cols-2"><Select label="性别" value={profile.sex} onChange={(sex) => setProfile({ ...profile, sex: sex as ProfileDraft['sex'] })} options={[['unspecified', '暂不透露'], ['male', '男'], ['female', '女']]} /><label><span className="text-sm font-semibold">出生日期</span><input className="mt-2 w-full rounded-xl border border-[#d6e2d8] px-3 py-2.5 outline-none focus:border-[#438263]" max={new Date().toISOString().slice(0, 10)} onChange={(event) => setProfile({ ...profile, birthDate: event.target.value })} required type="date" value={profile.birthDate} /></label><Field label="当前体重（kg）" value={weightKg} onChange={setWeightKg} /><Field label="身高（cm）" value={profile.heightCm} onChange={(heightCm) => setProfile({ ...profile, heightCm })} /><Field label="目标体重（kg）" value={profile.targetWeightKg} onChange={(targetWeightKg) => setProfile({ ...profile, targetWeightKg })} /></div><button className="mt-6 rounded-xl bg-[#256a49] px-5 py-3 text-sm font-bold text-white disabled:opacity-60" disabled={!userId || saving} type="submit">{saving ? '保存中…' : '保存资料，开始使用'}</button></form></section>
}

function Reminders({ userId }: { userId?: string }) {
  const [settings, setSettings] = useState<ReminderSettings>({ enabled: false, reminderTime: '19:30', weekdays: [1, 3, 5, 6] })
  const [message, setMessage] = useState(userId ? '' : '配置 Supabase 并登录后可启用手机推送。')
  const [saving, setSaving] = useState(false)
  const days = [['日', 0], ['一', 1], ['二', 2], ['三', 3], ['四', 4], ['五', 5], ['六', 6]] as const

  useEffect(() => {
    if (!userId) return
    loadReminder(userId).then(setSettings).catch((error) => setMessage(error instanceof Error ? error.message : '读取提醒失败'))
  }, [userId])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!settings.weekdays.length) { setMessage('请至少选择一天'); return }
    setSaving(true); setMessage('')
    try { await saveReminder(settings); setMessage(settings.enabled ? '提醒已启用，将在所选日期推送。' : '提醒已关闭。') }
    catch (error) { setMessage(error instanceof Error ? error.message : '保存失败') }
    finally { setSaving(false) }
  }

  return <section className="max-w-2xl"><p className="text-sm font-semibold text-[#438263]">训练提醒</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">别让忙碌跳过今天</h1><p className="mt-3 text-[#647268]">安装到手机桌面并允许通知后，即使网页关闭也能收到提醒。</p>{message && <p className="mt-5 rounded-xl bg-[#fff7df] px-4 py-3 text-sm text-[#765b18]" role="status">{message}</p>}<form className="mt-7 rounded-3xl border border-[#dfe9e0] bg-white p-6 shadow-sm" onSubmit={submit}><label className="flex items-center justify-between gap-4"><span><strong className="block">锻炼提醒</strong><span className="mt-1 block text-sm text-[#647268]">按你的本地时区发送</span></span><input checked={settings.enabled} className="size-5 accent-[#256a49]" disabled={!userId} onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })} type="checkbox" /></label><label className="mt-6 block"><span className="text-sm font-semibold">提醒时间</span><input className="mt-2 w-full rounded-xl border border-[#d6e2d8] px-3 py-2.5 outline-none focus:border-[#438263]" disabled={!settings.enabled || !userId} onChange={(event) => setSettings({ ...settings, reminderTime: event.target.value })} required type="time" value={settings.reminderTime} /></label><fieldset className="mt-6" disabled={!settings.enabled || !userId}><legend className="text-sm font-semibold">训练日</legend><div className="mt-3 flex flex-wrap gap-2">{days.map(([label, value]) => <label className={`grid size-10 cursor-pointer place-items-center rounded-full text-sm font-bold ${settings.weekdays.includes(value) ? 'bg-[#256a49] text-white' : 'bg-[#edf2ed] text-[#607065]'}`} key={value}>周{label}<input checked={settings.weekdays.includes(value)} className="sr-only" onChange={(event) => setSettings({ ...settings, weekdays: event.target.checked ? [...settings.weekdays, value].sort() : settings.weekdays.filter((day) => day !== value) })} type="checkbox" /></label>)}</div></fieldset><button className="mt-7 rounded-xl bg-[#256a49] px-5 py-3 text-sm font-bold text-white disabled:opacity-50" disabled={!userId || saving} type="submit">{saving ? '保存中…' : '保存提醒'}</button></form><p className="mt-5 text-xs text-[#758378]">iPhone 需先将 PWA 添加到主屏幕，再允许通知。系统省电或通知设置可能影响送达。</p></section>
}

function CenteredMessage({ text }: { text: string }) { return <div className="grid min-h-screen place-items-center bg-[#f4f7f4] text-[#526055]">{text}</div> }
function SummaryRow({ label, detail, value }: { label: string; detail: string; value: string }) { return <div className="flex items-center justify-between gap-3 py-4"><div><p className="font-semibold">{label}</p><p className="mt-1 text-xs text-[#758378]">{detail}</p></div><span className="rounded-full bg-[#e4f3e8] px-3 py-1.5 text-sm font-bold text-[#236843]">{value}</span></div> }
function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label><span className="text-sm font-semibold">{label}</span><input className="mt-2 w-full rounded-xl border border-[#d6e2d8] px-3 py-2.5 outline-none focus:border-[#438263]" inputMode="decimal" onChange={(event) => onChange(event.target.value)} value={value} /></label> }
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) { return <label><span className="text-sm font-semibold">{label}</span><select className="mt-2 w-full rounded-xl border border-[#d6e2d8] bg-white px-3 py-2.5 outline-none focus:border-[#438263]" onChange={(event) => onChange(event.target.value)} value={value}>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label> }

export default App
