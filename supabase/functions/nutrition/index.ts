const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }

const foodSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    mealName: { type: 'string' },
    items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, portion: { type: 'string' }, calories: { type: 'number', minimum: 0, maximum: 5000 }, proteinGrams: { type: 'number', minimum: 0, maximum: 500 }, confidence: { type: 'number', minimum: 0, maximum: 1 } }, required: ['name', 'portion', 'calories', 'proteinGrams', 'confidence'] } },
    totalCalories: { type: 'number', minimum: 0, maximum: 5000 }, totalProteinGrams: { type: 'number', minimum: 0, maximum: 500 }, note: { type: 'string' },
  }, required: ['mealName', 'items', 'totalCalories', 'totalProteinGrams', 'note'],
}

const planSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    targetCalories: { type: 'number' }, proteinGrams: { type: 'number' },
    meals: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, foods: { type: 'string' }, calories: { type: 'number' }, proteinGrams: { type: 'number' } }, required: ['name', 'foods', 'calories', 'proteinGrams'] } },
    note: { type: 'string' },
  }, required: ['targetCalories', 'proteinGrams', 'meals', 'note'],
}

const safeList = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length <= 40).slice(0, 10) : []

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers })
  try {
    if (!request.headers.get('Authorization')) throw new Error('请先登录')
    const key = Deno.env.get('OPENAI_API_KEY')
    if (!key) throw new Error('服务端尚未配置 OPENAI_API_KEY')
    const body = await request.json()
    if (!['recommend', 'recognize'].includes(body.action)) throw new Error('请求类型无效')
    const recognition = body.action === 'recognize'
    if (recognition && (!body.imageDataUrl || body.imageDataUrl.length > 7_000_000)) throw new Error('图片无效或过大')
    if (!recognition && (!Number.isFinite(body.weightKg) || body.weightKg < 25 || body.weightKg > 300 || !Number.isFinite(body.waistCm) || body.waistCm < 30 || body.waistCm > 200 || !['male', 'female', 'unspecified'].includes(body.profile?.sex) || !Number.isFinite(body.profile?.age) || body.profile.age < 14 || body.profile.age > 100 || !Number.isFinite(body.profile?.heightCm) || body.profile.heightCm < 100 || body.profile.heightCm > 250 || !Number.isFinite(body.profile?.targetWeightKg) || body.profile.targetWeightKg < 25 || body.profile.targetWeightKg > 300)) throw new Error('身体或个人资料无效')

    const dietPreferences = safeList(body.profile?.dietPreferences)
    const allergens = safeList(body.profile?.allergens)
    const foodBudget = ['low', 'medium', 'high'].includes(body.profile?.foodBudget) ? body.profile.foodBudget : ''
    const prompt = recognition
      ? [{ type: 'input_text', text: '识别图片中的食物并估算份量、热量和蛋白质。无法确定时降低 confidence；中文输出；提醒结果为估算值。' }, { type: 'input_image', image_url: body.imageDataUrl, detail: 'low' }]
      : [{ type: 'input_text', text: `为${body.profile.sex === 'male' ? '男性' : body.profile.sex === 'female' ? '女性' : '未提供性别的用户'}，${body.profile.age}岁，${body.profile.heightCm}cm，当前${body.weightKg}kg，腰围${body.waistCm}cm，目标${body.profile.targetWeightKg}kg制定${body.trainingDay ? '训练日' : '休息日'}三餐减脂饮食。饮食偏好：${dietPreferences.join('、') || '无'}；需避开：${allergens.join('、') || '无'}；食材预算：${foodBudget === 'low' ? '经济' : foodBudget === 'medium' ? '适中' : foodBudget === 'high' ? '宽裕' : '不限定'}。食材要常见、可执行，蛋白质充足，不使用极端热量缺口。中文输出。` }]

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-5.6-terra', reasoning: { effort: 'low' }, input: [{ role: 'user', content: prompt }], text: { format: { type: 'json_schema', name: recognition ? 'food_analysis' : 'diet_plan', strict: true, schema: recognition ? foodSchema : planSchema } }, max_output_tokens: 1400, store: false }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error?.message || 'AI 服务调用失败')
    const text = data.output?.flatMap((item: { content?: unknown[] }) => item.content || []).find((item: { type?: string }) => item.type === 'output_text')?.text
    if (!text) throw new Error('AI 未返回可用结果')
    return new Response(text, { headers })
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : '请求失败' }), { status: 400, headers })
  }
})
