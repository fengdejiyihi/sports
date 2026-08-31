import { createClient } from '@supabase/supabase-js'
import { checkinValues } from './checkin'
import type { CheckinDraft } from './checkin'
import type { DietPlan, FoodAnalysis } from './nutrition'
import { emptyProfile } from './profile'
import type { ProfileDraft } from './profile'
import type { MeasurementPoint } from './trends'
import { mergeHistory } from './history'
import type { HistoryDay } from './history'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY
const nutritionFunction = import.meta.env.VITE_NUTRITION_FUNCTION || 'nutrition'

export const cloudEnabled = Boolean(url && key)
export const supabase = cloudEnabled ? createClient(url, key) : null

export async function requestMagicLink(email: string) {
  if (!supabase) throw new Error('Supabase 尚未配置')
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })
  if (error) throw error
}

export async function loadToday(userId: string, date: string) {
  if (!supabase) return { checkin: null, measurement: null, latestMeasurement: null }
  const [checkinResult, measurementResult, latestMeasurementResult] = await Promise.all([
    supabase.from('daily_checkins').select('status,duration_minutes,sleep_minutes,energy_rating,soreness_rating,notes').eq('user_id', userId).eq('checkin_date', date).maybeSingle(),
    supabase.from('body_measurements').select('weight_kg,waist_cm').eq('user_id', userId).eq('measured_on', date).maybeSingle(),
    supabase.from('body_measurements').select('weight_kg').eq('user_id', userId).order('measured_on', { ascending: false }).limit(1).maybeSingle(),
  ])
  if (checkinResult.error) throw checkinResult.error
  if (measurementResult.error) throw measurementResult.error
  if (latestMeasurementResult.error) throw latestMeasurementResult.error
  return { checkin: checkinResult.data, measurement: measurementResult.data, latestMeasurement: latestMeasurementResult.data }
}

export async function loadMeasurements(userId: string, since: string): Promise<MeasurementPoint[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('body_measurements').select('measured_on,weight_kg,waist_cm').eq('user_id', userId).gte('measured_on', since).order('measured_on')
  if (error) throw error
  return (data || []).map((point) => ({ measuredOn: point.measured_on, weightKg: Number(point.weight_kg), waistCm: point.waist_cm == null ? null : Number(point.waist_cm) }))
}

export async function loadCheckinHistory(userId: string, since: string): Promise<HistoryDay[]> {
  if (!supabase) return []
  const [checkins, measurements] = await Promise.all([
    supabase.from('daily_checkins').select('checkin_date,status,duration_minutes,sleep_minutes').eq('user_id', userId).gte('checkin_date', since),
    supabase.from('body_measurements').select('measured_on,weight_kg,waist_cm').eq('user_id', userId).gte('measured_on', since),
  ])
  if (checkins.error) throw checkins.error
  if (measurements.error) throw measurements.error
  return mergeHistory(checkins.data.map((item) => ({ date: item.checkin_date, status: item.status as 'completed' | 'skipped' | 'backfill', durationMinutes: item.duration_minutes, sleepMinutes: item.sleep_minutes })), measurements.data.map((item) => ({ date: item.measured_on, weightKg: Number(item.weight_kg), waistCm: item.waist_cm == null ? null : Number(item.waist_cm) })))
}

export async function loadProfile(userId: string): Promise<ProfileDraft> {
  if (!supabase) return emptyProfile()
  const { data, error } = await supabase.from('profiles').select('sex,birth_date,height_cm,target_weight_kg').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return {
    sex: data?.sex === 'male' || data?.sex === 'female' ? data.sex : 'unspecified',
    birthDate: data?.birth_date || '',
    heightCm: data?.height_cm == null ? '' : String(data.height_cm),
    targetWeightKg: data?.target_weight_kg == null ? '' : String(data.target_weight_kg),
  }
}

export async function saveProfile(userId: string, profile: ProfileDraft) {
  if (!supabase) throw new Error('Supabase 尚未配置')
  const { error } = await supabase.from('profiles').upsert({
    user_id: userId,
    sex: profile.sex,
    birth_date: profile.birthDate,
    height_cm: Number(profile.heightCm),
    target_weight_kg: Number(profile.targetWeightKg),
  })
  if (error) throw error
}

export async function saveBodyWeight(userId: string, date: string, weightKg: string) {
  if (!supabase) throw new Error('Supabase 尚未配置')
  const { error } = await supabase.from('body_measurements').upsert({ user_id: userId, measured_on: date, weight_kg: Number(weightKg) }, { onConflict: 'user_id,measured_on' })
  if (error) throw error
}

export async function saveCheckin(date: string, draft: CheckinDraft) {
  if (!supabase) throw new Error('Supabase 尚未配置')
  const values = checkinValues(draft)
  const { error } = await supabase.rpc('save_daily_checkin', {
    p_checkin_date: date,
    p_status: values.status,
    p_duration_minutes: values.durationMinutes,
    p_weight_kg: values.weightKg,
    p_waist_cm: values.waistCm,
    p_sleep_minutes: values.sleepMinutes,
    p_energy_rating: values.energyRating,
    p_soreness_rating: values.sorenessRating,
    p_notes: values.notes,
  })
  if (error) throw error
}

export function subscribeToUserData(userId: string, onChange: () => void) {
  if (!supabase) return () => undefined
  const client = supabase
  const channel = client.channel(`fitness-sync:${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_checkins', filter: `user_id=eq.${userId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'body_measurements', filter: `user_id=eq.${userId}` }, onChange)
    .subscribe()
  return () => { void client.removeChannel(channel) }
}

export async function askNutrition(body: { action: 'recommend'; weightKg: number; waistCm: number; profile: { sex: ProfileDraft['sex']; age: number; heightCm: number; targetWeightKg: number } } | { action: 'recognize'; imageDataUrl: string }) {
  if (!supabase) throw new Error('请先配置 Supabase 并登录')
  const { data, error } = await supabase.functions.invoke<FoodAnalysis | DietPlan>(nutritionFunction, { body })
  if (error) {
    const context = error.context
    if (context instanceof Response) {
      const payload = await context.clone().json().catch(() => null)
      if (payload && typeof payload === 'object' && 'error' in payload) throw new Error(String(payload.error))
    }
    throw error
  }
  if (!data) throw new Error('AI 未返回结果')
  if ('error' in data) throw new Error(String(data.error))
  return data
}

export async function saveMeal(userId: string, date: string, analysis: FoodAnalysis) {
  if (!supabase) throw new Error('Supabase 尚未配置')
  const { error } = await supabase.from('meal_entries').insert({ user_id: userId, eaten_on: date, meal_name: analysis.mealName, items: analysis.items, total_calories: Math.round(analysis.totalCalories), protein_grams: analysis.totalProteinGrams })
  if (error) throw error
}
