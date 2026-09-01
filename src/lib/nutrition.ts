export type FoodAnalysis = {
  mealName: string
  items: { name: string; portion: string; calories: number; proteinGrams: number; confidence: number }[]
  totalCalories: number
  totalProteinGrams: number
  note: string
}

export type DietPlan = {
  targetCalories: number
  proteinGrams: number
  meals: { name: string; foods: string; calories: number; proteinGrams: number }[]
  note: string
}

export type DailyNutritionTarget = DietPlan & { trainingDay: boolean }

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'
export type MealEntry = { id: string; mealName: string; mealType: MealType; totalCalories: number; proteinGrams: number; source: 'manual' | 'vision' | 'ai_plan' }
export type ManualMealDraft = { mealName: string; mealType: MealType; totalCalories: string; proteinGrams: string }

export const mealTypeLabels: Record<MealType, string> = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' }

export function validateManualMeal(draft: ManualMealDraft) {
  const calories = Number(draft.totalCalories)
  const protein = Number(draft.proteinGrams)
  if (!draft.mealName.trim() || draft.mealName.trim().length > 80) return '请输入 1–80 字的餐食名称'
  if (!Number.isFinite(calories) || calories < 0 || calories > 5000) return '热量应在 0–5000 kcal 之间'
  if (!Number.isFinite(protein) || protein < 0 || protein > 500) return '蛋白质应在 0–500 g 之间'
  return ''
}

export function mealTotals(meals: MealEntry[]) {
  return meals.reduce((total, meal) => ({ calories: total.calories + meal.totalCalories, protein: total.protein + meal.proteinGrams }), { calories: 0, protein: 0 })
}

export function validateImageMeta(file: { type: string; size: number }) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return '仅支持 JPG、PNG 或 WebP 图片'
  if (file.size > 5 * 1024 * 1024) return '图片不能超过 5 MB'
  return ''
}

export function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}
