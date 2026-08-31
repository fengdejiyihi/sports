# 燃动健身打卡

当前闭环：今日页、每日打卡、邮箱免密码登录、云端同步、Terra 饮食推荐、食物图片识别和手机锻炼提醒。未配置 Supabase 时打卡自动使用浏览器本地存储，云端功能保持关闭。

## 本地运行

```bash
npm run dev
```

## 启用云同步

1. 创建 Supabase 项目并依次执行 `supabase/migrations` 中的 SQL 文件。
2. 复制 `.env.example` 为 `.env.local`，填写项目 URL 和 Publishable key。
3. 在 Supabase Authentication 的 Redirect URLs 中加入本地地址和正式域名。

重启开发服务后，页面会显示邮箱登录入口。

## 启用 AI 饮食

```bash
supabase secrets set OPENAI_API_KEY=你的密钥
supabase functions deploy nutrition
```

模型固定为 `gpt-5.6-terra`，密钥仅保存在 Supabase 服务端。

### 改用 DeepSeek

保留原 `nutrition` 函数不变，部署 `nutrition-deepseek`，并在 Supabase Secrets 中设置 `DEEPSEEK_API_KEY`。本地 `.env.local` 填入 `VITE_NUTRITION_FUNCTION=nutrition-deepseek` 后重启前端；恢复 Terra 时将其改回 `nutrition`。

DeepSeek 使用 `deepseek-v4-flash-vision-exp`，可同时处理文字饮食建议和食物图片识别。

## 启用锻炼提醒

1. 生成一对 VAPID 密钥，将公钥同时填入 `.env.local` 的 `VITE_VAPID_PUBLIC_KEY`。
2. 配置并部署发送函数：

```bash
supabase secrets set VAPID_PUBLIC_KEY=公钥 VAPID_PRIVATE_KEY=私钥 VAPID_SUBJECT=mailto:你的邮箱 CRON_SECRET=随机长字符串
supabase functions deploy send-reminders --no-verify-jwt
```

3. 在 Supabase Cron 中每分钟调用一次 `send-reminders`，请求头加入 `x-cron-secret: 与上面相同的随机长字符串`。

Cron 密钥必须保存在 Supabase Vault；不要写进迁移或前端代码。

## 检查

```bash
npm run test
npm run lint
npm run build
```
