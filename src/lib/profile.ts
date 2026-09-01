export type ProfileDraft = { sex: 'male' | 'female' | 'unspecified'; birthDate: string; heightCm: string; targetWeightKg: string; dietPreferences: string; allergens: string; foodBudget: '' | 'low' | 'medium' | 'high' }

export function emptyProfile(): ProfileDraft {
  return { sex: 'unspecified', birthDate: '', heightCm: '', targetWeightKg: '', dietPreferences: '', allergens: '', foodBudget: '' }
}

export function textList(value: string) {
  return [...new Set(value.split(/[，,、]/).map((item) => item.trim()).filter(Boolean))].slice(0, 10)
}

export function ageFromBirthDate(birthDate: string, now = new Date()) {
  const birth = new Date(`${birthDate}T00:00:00`)
  if (Number.isNaN(birth.getTime())) return null
  let age = now.getFullYear() - birth.getFullYear()
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age -= 1
  return age
}

export function validateProfile(profile: ProfileDraft) {
  const errors: string[] = []
  const age = ageFromBirthDate(profile.birthDate)
  const height = Number(profile.heightCm)
  const targetWeight = Number(profile.targetWeightKg)
  if (!age || age < 14 || age > 100) errors.push('请输入 14–100 岁范围内的出生日期')
  if (!Number.isFinite(height) || height < 100 || height > 250) errors.push('请输入合理的身高')
  if (!Number.isFinite(targetWeight) || targetWeight < 25 || targetWeight > 300) errors.push('请输入合理的目标体重')
  return errors
}

export function isValidWeight(value: string) {
  const weight = Number(value)
  return Number.isFinite(weight) && weight >= 25 && weight <= 300
}
