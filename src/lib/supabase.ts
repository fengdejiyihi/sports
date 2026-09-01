import { createClient } from '@supabase/supabase-js'
import { checkinValues } from './checkin'
import type { CheckinDraft } from './checkin'
import type { DailyNutritionTarget, DietPlan, FoodAnalysis, ManualMealDraft, MealEntry, MealType } from './nutrition'
import { emptyProfile, textList } from './profile'
import type { ProfileDraft } from './profile'
import type { MeasurementPoint } from './trends'
import { mergeHistory } from './history'
import type { HistoryDay } from './history'
import { weekdayOrder } from './workouts'
import type { WorkoutPlan, WorkoutPlanDraft } from './workouts'

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
    supabase.from('daily_checkins').select('plan_id,status,duration_minutes,sleep_minutes,energy_rating,soreness_rating,notes').eq('user_id', userId).eq('checkin_date', date).maybeSingle(),
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

export async function loadCheckinHistory(userId: string, since: string, until?: string): Promise<HistoryDay[]> {
  if (!supabase) return []
  const checkinQuery = until ? supabase.from('daily_checkins').select('checkin_date,status,duration_minutes,sleep_minutes').eq('user_id', userId).gte('checkin_date', since).lte('checkin_date', until) : supabase.from('daily_checkins').select('checkin_date,status,duration_minutes,sleep_minutes').eq('user_id', userId).gte('checkin_date', since)
  const measurementQuery = until ? supabase.from('body_measurements').select('measured_on,weight_kg,waist_cm').eq('user_id', userId).gte('measured_on', since).lte('measured_on', until) : supabase.from('body_measurements').select('measured_on,weight_kg,waist_cm').eq('user_id', userId).gte('measured_on', since)
  const [checkins, measurements] = await Promise.all([
    checkinQuery,
    measurementQuery,
  ])
  if (checkins.error) throw checkins.error
  if (measurements.error) throw measurements.error
  return mergeHistory(checkins.data.map((item) => ({ date: item.checkin_date, status: item.status as 'completed' | 'skipped' | 'backfill', durationMinutes: item.duration_minutes, sleepMinutes: item.sleep_minutes })), measurements.data.map((item) => ({ date: item.measured_on, weightKg: Number(item.weight_kg), waistCm: item.waist_cm == null ? null : Number(item.waist_cm) })))
}

export async function loadProfile(userId: string): Promise<ProfileDraft> {
  if (!supabase) return emptyProfile()
  const { data, error } = await supabase.from('profiles').select('sex,birth_date,height_cm,target_weight_kg,diet_preferences,allergens,food_budget').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return {
    sex: data?.sex === 'male' || data?.sex === 'female' ? data.sex : 'unspecified',
    birthDate: data?.birth_date || '',
    heightCm: data?.height_cm == null ? '' : String(data.height_cm),
    targetWeightKg: data?.target_weight_kg == null ? '' : String(data.target_weight_kg),
    dietPreferences: Array.isArray(data?.diet_preferences) ? data.diet_preferences.join('、') : '',
    allergens: Array.isArray(data?.allergens) ? data.allergens.join('、') : '',
    foodBudget: data?.food_budget === 'low' || data?.food_budget === 'medium' || data?.food_budget === 'high' ? data.food_budget : '',
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
    diet_preferences: textList(profile.dietPreferences),
    allergens: textList(profile.allergens),
    food_budget: profile.foodBudget || null,
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
    p_plan_id: values.planId,
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

export async function askNutrition(body: { action: 'recommend'; weightKg: number; waistCm: number; trainingDay: boolean; profile: { sex: ProfileDraft['sex']; age: number; heightCm: number; targetWeightKg: number; dietPreferences: string[]; allergens: string[]; foodBudget: ProfileDraft['foodBudget'] } } | { action: 'recognize'; imageDataUrl: string }) {
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

export async function loadNutritionTarget(userId: string, date: string): Promise<DailyNutritionTarget | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('nutrition_daily_targets').select('training_day,target_calories,protein_grams,plan,note').eq('user_id', userId).eq('target_date', date).maybeSingle()
  if (error) throw error
  if (!data) return null
  const plan = data.plan as DietPlan
  return { ...plan, trainingDay: data.training_day, targetCalories: Number(data.target_calories), proteinGrams: Number(data.protein_grams), note: data.note || plan.note || '' }
}

export async function saveNutritionTarget(userId: string, date: string, target: DailyNutritionTarget) {
  if (!supabase) throw new Error('Supabase 尚未配置')
  const { error } = await supabase.from('nutrition_daily_targets').upsert({ user_id: userId, target_date: date, training_day: target.trainingDay, target_calories: Math.round(target.targetCalories), protein_grams: target.proteinGrams, plan: { targetCalories: target.targetCalories, proteinGrams: target.proteinGrams, meals: target.meals, note: target.note }, note: target.note }, { onConflict: 'user_id,target_date' })
  if (error) throw error
}

export async function loadMeals(userId: string, date: string): Promise<MealEntry[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('meal_entries').select('id,meal_name,meal_type,total_calories,protein_grams,source').eq('user_id', userId).eq('eaten_on', date).order('created_at')
  if (error) throw error
  return (data || []).map((meal) => ({ id: meal.id, mealName: meal.meal_name, mealType: meal.meal_type as MealType, totalCalories: Number(meal.total_calories), proteinGrams: Number(meal.protein_grams), source: meal.source as MealEntry['source'] }))
}

export async function saveMeal(userId: string, date: string, analysis: FoodAnalysis, mealType: MealType) {
  if (!supabase) throw new Error('Supabase 尚未配置')
  const { error } = await supabase.from('meal_entries').insert({ user_id: userId, eaten_on: date, meal_name: analysis.mealName, items: analysis.items, total_calories: Math.round(analysis.totalCalories), protein_grams: analysis.totalProteinGrams, meal_type: mealType, source: 'vision' })
  if (error) throw error
}

export async function saveManualMeal(userId: string, date: string, draft: ManualMealDraft) {
  if (!supabase) throw new Error('Supabase 尚未配置')
  const { error } = await supabase.from('meal_entries').insert({ user_id: userId, eaten_on: date, meal_name: draft.mealName.trim(), items: [], total_calories: Math.round(Number(draft.totalCalories)), protein_grams: Number(draft.proteinGrams), meal_type: draft.mealType, source: 'manual' })
  if (error) throw error
}

export async function updateMeal(userId: string, id: string, draft: ManualMealDraft) {
  if (!supabase) throw new Error('Supabase 尚未配置')
  const { error } = await supabase.from('meal_entries').update({ meal_name: draft.mealName.trim(), total_calories: Math.round(Number(draft.totalCalories)), protein_grams: Number(draft.proteinGrams), meal_type: draft.mealType }).eq('id', id).eq('user_id', userId)
  if (error) throw error
}

export async function deleteMeal(userId: string, id: string) {
  if (!supabase) throw new Error('Supabase 尚未配置')
  const { error } = await supabase.from('meal_entries').delete().eq('id', id).eq('user_id', userId)
  if (error) throw error
}

export async function loadWorkoutPlans(userId: string): Promise<WorkoutPlan[]> {
  if (!supabase) return []
  const { data: plans, error } = await supabase.from('workout_plans').select('id,name,weekday,duration_minutes,is_active').eq('user_id', userId).order('weekday').order('created_at')
  if (error) throw error
  if (!plans?.length) return []
  const { data: items, error: itemsError } = await supabase.from('workout_plan_items').select('plan_id,exercise_name,sets,reps_min,reps_max,sort_order').in('plan_id', plans.map((plan) => plan.id)).order('sort_order')
  if (itemsError) throw itemsError
  return plans.map((plan) => ({ id: plan.id, name: plan.name, weekday: String(plan.weekday), durationMinutes: String(plan.duration_minutes), isActive: plan.is_active, items: (items || []).filter((item) => item.plan_id === plan.id).map((item) => ({ exerciseName: item.exercise_name, sets: String(item.sets), repsMin: String(item.reps_min), repsMax: String(item.reps_max) })) })).sort((left, right) => weekdayOrder.indexOf(Number(left.weekday)) - weekdayOrder.indexOf(Number(right.weekday)))
}

export async function saveWorkoutPlan(plan: WorkoutPlanDraft, id?: string) {
  if (!supabase) throw new Error('Supabase 尚未配置')
  const { error } = await supabase.rpc('save_workout_plan', { p_plan_id: id || null, p_name: plan.name.trim(), p_weekday: Number(plan.weekday), p_duration_minutes: Number(plan.durationMinutes), p_is_active: plan.isActive, p_items: plan.items })
  if (error) throw error
}

export async function deleteWorkoutPlan(userId: string, id: string) {
  if (!supabase) throw new Error('Supabase 尚未配置')
  const { error } = await supabase.from('workout_plans').delete().eq('id', id).eq('user_id', userId)
  if (error) throw error
}
