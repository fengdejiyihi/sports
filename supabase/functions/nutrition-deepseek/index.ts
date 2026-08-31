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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers })
  try {
    if (!request.headers.get('Authorization')) throw new Error('请先登录')
    const key = Deno.env.get('DEEPSEEK_API_KEY')
    if (!key) throw new Error('服务端尚未配置 DEEPSEEK_API_KEY')
    const body = await request.json()
    if (!['recommend', 'recognize'].includes(body.action)) throw new Error('请求类型无效')
    const recognition = body.action === 'recognize'
    if (recognition && (!body.imageDataUrl || body.imageDataUrl.length > 7_000_000)) throw new Error('图片无效或过大')
    if (!recognition && (!Number.isFinite(body.weightKg) || body.weightKg < 25 || body.weightKg > 300 || !Number.isFinite(body.waistCm) || body.waistCm < 30 || body.waistCm > 200 || !['male', 'female', 'unspecified'].includes(body.profile?.sex) || !Number.isFinite(body.profile?.age) || body.profile.age < 14 || body.profile.age > 100 || !Number.isFinite(body.profile?.heightCm) || body.profile.heightCm < 100 || body.profile.heightCm > 250 || !Number.isFinite(body.profile?.targetWeightKg) || body.profile.targetWeightKg < 25 || body.profile.targetWeightKg > 300)) throw new Error('身体或个人资料无效')

    const schema = recognition ? foodSchema : planSchema
    const promptText = recognition
      ? '识别图片中的食物并估算份量、热量和蛋白质。无法确定时降低 confidence；中文输出；提醒结果为估算值。'
      : `为${body.profile.sex === 'male' ? '男性' : body.profile.sex === 'female' ? '女性' : '未提供性别的用户'}，${body.profile.age}岁，${body.profile.heightCm}cm，当前${body.weightKg}kg，腰围${body.waistCm}cm，目标${body.profile.targetWeightKg}kg制定今天三餐减脂饮食。食材要常见、可执行，蛋白质充足，不使用极端热量缺口。中文输出。`
    const content = recognition
      ? [{ type: 'text', text: `${promptText} 只返回 JSON，必须符合：${JSON.stringify(schema)}` }, { type: 'image_url', image_url: { url: body.imageDataUrl, detail: 'low' } }]
      : `${promptText} 只返回 JSON，必须符合：${JSON.stringify(schema)}`

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'deepseek-v4-flash-vision-exp', messages: [{ role: 'user', content }], thinking: { type: 'disabled' }, response_format: { type: 'json_object' }, max_tokens: 1400 }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error?.message || 'DeepSeek 服务调用失败')
    const text = data.choices?.[0]?.message?.content
    if (!text) throw new Error('DeepSeek 未返回可用结果')
    return new Response(text, { headers })
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : '请求失败' }), { status: 400, headers })
  }
})
