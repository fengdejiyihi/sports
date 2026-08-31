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
