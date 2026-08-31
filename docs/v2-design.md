# 燃动 V2 页面原型与数据库详细设计

## 1. 设计原则

- 复用 V1 的 `profiles`、`daily_checkins`、`body_measurements`、`workout_plans`、`workout_plan_items`、`meal_entries` 和提醒表。
- 趋势、周/月统计均由已有历史记录计算，不建立重复汇总表。
- 每张用户数据表继续使用 `user_id` 与 `auth.uid() = user_id` 的 RLS 模式。
- AI 只负责饮食建议和食物判断；日期、热量汇总、提醒是否到期等逻辑由确定性代码处理。

### 1.1 已确认的视觉与导航规范

- 视觉继续沿用 V1：浅灰绿色页面背景、深松绿色主卡、圆角白色内容卡、浅绿色状态条和大留白。
- **桌面端与手机端使用同一套顶部横向 Tab 导航，不使用左侧侧边栏。**
- 一级导航固定为：`今日`、`数据中心`、`训练`、`饮食`、`更多`；`更多`收纳 AI 饮食、提醒和我的资料等低频页面。
- 手机端 Tab 可横向滑动，不换行；桌面端保持同样的位置与顺序，仅完整展示所有 Tab。
- 内容保持单一主栏；桌面端允许同层卡片在宽屏时两列展示，手机端自动变为单列。导航结构和页面层级不因屏幕尺寸改变。

### 1.2 断点规则

| 区域 | 手机（小于 640px） | 桌面（640px 及以上） |
|---|---|---|
| 页面内边距 | 20px | 20px，内容最大宽度 1024px |
| 顶部 Tab | 横向可滑动 | 原顺序完整展示 |
| 内容卡片 | 单列、全宽 | 信息关联较弱的卡片可两列 |
| 标题 | 30px 左右 | 36px 左右 |
| 操作按钮 | 不小于 44px 高，便于触控 | 保持同样尺寸与样式 |

## 2. 页面原型

### 2.1 今日页（升级）

```text
┌──────────────────────────────────────┐
│ 今天，为 65 kg 前进一步                │
│ 当前 70.7 kg  ·  已减 0.3 kg  ·  进度 5%│
├──────────────────────────────────────┤
│ 今日训练：力量 A                [打卡] │
│ 深蹲、俯卧撑、划船 · 预计 40 分钟       │
├──────────────────────────────────────┤
│ 今日饮食                              │
│ 1,080 / 1,800 kcal   蛋白质 72 / 120 g │
│ [记录一餐] [AI 生成三餐]               │
├──────────────────────────────────────┤
│ 身体状态                              │
│ 体重 70.7 kg | 腰围 83.5 cm | 睡眠 7.2 h│
└──────────────────────────────────────┘
```

- 顶部只展示本账号的当前/目标数据。
- 饮食进度由当天 `meal_entries` 与 `nutrition_daily_targets` 比较得出。
- 未填写资料、当前体重时继续跳转到“我的资料”。

### 2.2 数据中心（新增）

```text
┌──────────────────────────────────────┐
│ 数据中心              [7天] [30天] [90天]│
├──────────────────────────────────────┤
│ 当前 70.7 kg        目标 65.0 kg       │
│ 已减 0.3 kg         本周 -0.2 kg       │
├──────────────────────────────────────┤
│ 体重趋势折线图                         │
│  71.0 ─╮                               │
│  70.5  ├─╮                             │
│  70.0    ╰─╮                           │
├──────────────────────────────────────┤
│ 腰围趋势折线图                         │
├──────────────────────────────────────┤
│ 打卡日历：完成 / 跳过 / 未记录           │
└──────────────────────────────────────┘
```

- 图表读取 `body_measurements`，不写入计算结果。
- 点击日期进入历史打卡详情，可编辑或补录。
- 减脂速度：比较区间首尾体重后展示“偏快、合适、偏慢”，不由 AI 决定。

### 2.3 训练计划页（升级）

```text
┌──────────────────────────────────────┐
│ 我的训练计划                    [+ 新建]│
├──────────────────────────────────────┤
│ 力量 A · 周一 / 周四 · 40 分钟    [编辑]│
│ 深蹲 3×12 · 俯卧撑 3×10 · 平板支撑      │
├──────────────────────────────────────┤
│ 居家有氧 · 周六 · 30 分钟        [编辑]│
└──────────────────────────────────────┘

计划编辑：
名称｜训练日｜预计时长｜是否启用
动作名称｜组数｜最少次数｜最多次数｜排序
```

- 直接复用 `workout_plans` 与 `workout_plan_items`。
- 每日打卡增加“本次训练计划”选择，写入已有 `daily_checkins.plan_id`。
- 不新增训练 session 表；V2 保持“一天一条主要打卡”的 V1 约束。

### 2.4 饮食账本页（新增）

```text
┌──────────────────────────────────────┐
│ 饮食账本 · 今天                         │
│ 1,080 / 1,800 kcal   蛋白质 72 / 120 g │
├──────────────────────────────────────┤
│ 早餐  燕麦、鸡蛋、牛奶        450 kcal  │
│ 午餐  鸡胸肉、糙米饭          600 kcal  │
│ 加餐  希腊酸奶                 200 kcal  │
├──────────────────────────────────────┤
│ [拍照识别] [手动添加] [AI 三餐建议]     │
├──────────────────────────────────────┤
│ 历史日期 [‹] 2026-08-31 [›]            │
└──────────────────────────────────────┘
```

- 每餐可编辑、删除、补录。
- 手动添加与识图添加统一写入 `meal_entries`。
- 本页每天的合计值由查询计算；不持久化“当天已摄入”字段。

### 2.5 AI 饮食页（升级）

```text
┌──────────────────────────────────────┐
│ AI 饮食                                │
│ 训练日 / 休息日：[训练日]               │
│ 当前 70.7 kg · 目标 65 kg               │
│ [生成今日三餐]                          │
├──────────────────────────────────────┤
│ 今日目标：1,800 kcal · 蛋白质 120 g     │
│ 早餐 / 午餐 / 晚餐 / 加餐                │
│ [保存为今日目标]                         │
├──────────────────────────────────────┤
│ 近 7 天体重趋势：稳定下降，保持当前计划   │
└──────────────────────────────────────┘
```

- AI 接收：个人资料、当前体重/腰围、目标体重、当天是否训练。
- AI 不直接写库；前端确认后保存每日目标和餐食。
- 图像识别继续要求用户确认后才保存。

### 2.6 提醒页（升级）

```text
┌──────────────────────────────────────┐
│ 提醒                                   │
│ 通知权限：已允许 · 设备订阅：正常         │
│ [发送测试通知]                          │
├──────────────────────────────────────┤
│ 训练提醒   周一/三/五 19:30      [开关] │
│ 体重记录   每周一 07:30          [开关] │
│ 未打卡提醒 每日 21:00            [开关] │
└──────────────────────────────────────┘
```

## 3. 数据库设计

### 3.1 复用的 V1 表

| 表 | V2 用途 | 变化 |
|---|---|---|
| `profiles` | 目标、身高、活动等级、饮食偏好 | 增加偏好字段 |
| `body_measurements` | 体重/腰围趋势与当前体重预填 | 无结构变化 |
| `daily_checkins` | 打卡历史、日历、训练计划关联 | 使用已有 `plan_id` |
| `workout_plans` | 自定义计划 | 无结构变化 |
| `workout_plan_items` | 计划动作 | 无结构变化 |
| `meal_entries` | 餐食列表、热量/蛋白质汇总 | 增加来源和餐次字段 |
| `reminder_settings` | 保留原训练提醒兼容性 | 新规则逐步迁移到新表 |
| `push_subscriptions` | Web Push 设备订阅 | 无结构变化 |

### 3.2 `profiles` 增量字段

```text
diet_preferences text[]  not null default '{}'
allergens         text[] not null default '{}'
food_budget       text   check (food_budget in ('low','medium','high'))
```

- `diet_preferences`：如“少油、低碳、素食”。
- `allergens`：过敏和明确忌口；AI 提示词必须排除。
- `food_budget`：控制建议食材的价格区间。

### 3.3 `meal_entries` 增量字段

```text
meal_type text not null default 'snack'
  check (meal_type in ('breakfast','lunch','dinner','snack'))
source text not null default 'manual'
  check (source in ('manual','vision','ai_plan'))
updated_at timestamptz not null default timezone('utc', now())
```

- `meal_name` 继续保留为用户可读名称。
- `items` 继续保存食物明细 JSON，不拆成多张表，满足当前识图和手动录入。
- 索引：`(user_id, eaten_on, meal_type)`，用于当天账本查询。

### 3.4 `nutrition_daily_targets`（新增）

```text
id uuid primary key default gen_random_uuid()
user_id uuid not null references auth.users(id) on delete cascade
target_date date not null
training_day boolean not null default false
target_calories smallint not null check (target_calories between 800 and 5000)
protein_grams numeric(6,2) not null check (protein_grams between 20 and 500)
plan jsonb not null check (jsonb_typeof(plan) = 'object')
note text
created_at timestamptz not null default timezone('utc', now())
updated_at timestamptz not null default timezone('utc', now())
unique (user_id, target_date)
```

- 保存用户确认后的当天 AI 目标与三餐建议。
- 账本用此表比较“目标摄入”和“实际摄入”。
- 只保留每天一份目标，重新生成即更新，不保留无价值的多版本历史。

### 3.5 `reminder_rules`（新增）

```text
id uuid primary key default gen_random_uuid()
user_id uuid not null references auth.users(id) on delete cascade
kind text not null check (kind in ('workout','weight','checkin'))
enabled boolean not null default true
reminder_time time not null
weekdays smallint[] not null
timezone text not null default 'Asia/Shanghai'
last_sent_on date
created_at timestamptz not null default timezone('utc', now())
updated_at timestamptz not null default timezone('utc', now())
unique (user_id, kind)
```

- `workout`：训练提醒。
- `weight`：体重记录提醒。
- `checkin`：未打卡提醒。
- `send-reminders` 读取新表；旧 `reminder_settings` 在迁移完成前继续兼容。

### 3.6 权限、触发器与实时同步

- 新表均启用 RLS，统一策略：`auth.uid() = user_id`。
- 新增/更新的用户表使用已有 `set_updated_at()` 触发器。
- 为 `nutrition_daily_targets` 和 `reminder_rules` 建立 `(user_id, target_date)`、`(user_id, kind)` 索引。
- 只将需要跨设备即时更新的表加入 Realtime：`meal_entries`、`nutrition_daily_targets`、`reminder_rules`。

## 4. 查询与接口约定

| 能力 | 数据来源 | 写入方式 |
|---|---|---|
| 体重/腰围趋势 | `body_measurements` 区间查询 | 编辑后 upsert 日期记录 |
| 打卡日历 | `daily_checkins` 区间查询 | 复用 `save_daily_checkin` RPC |
| 训练计划 | `workout_plans` + `workout_plan_items` | 前端 CRUD，RLS 限制归属 |
| 当天饮食汇总 | `meal_entries` 按日期 sum | 餐食确认/手动录入写入 |
| 每日营养目标 | `nutrition_daily_targets` | AI 结果确认后 upsert |
| 多类提醒 | `reminder_rules` | 保存规则 + VAPID 订阅 |

AI Edge Function 的请求扩展为：

```text
action: recommend | recognize
recommend: profile + 当前体重/腰围 + targetWeight + trainingDay + dietPreferences
recognize: imageDataUrl
```

服务端确定性校验所有数值范围、枚举和图片大小；AI 只返回计划或食物估算 JSON。

## 5. 迁移顺序

1. `20260831_v2_meals_profiles.sql`：扩展 `profiles`、`meal_entries`，添加索引与触发器。
2. `20260831_v2_nutrition_targets.sql`：创建 `nutrition_daily_targets`、RLS、Realtime。
3. `20260831_v2_reminder_rules.sql`：创建 `reminder_rules`、RLS、Realtime，并调整提醒函数。

先上线迁移，再上线使用新字段的前端和 Edge Function，避免前端查询不存在的表/列。

## 6. 开发顺序与验收

### 阶段一：数据中心、历史与饮食账本

- 完成趋势图、打卡日历、历史编辑。
- 完成餐次分类、手动录入、每日热量/蛋白质汇总。
- 验收：用户能查看 7/30/90 天趋势和任意日期的训练、饮食记录。

### 阶段二：训练计划与 AI 目标

- 完成计划 CRUD、计划选择打卡。
- 完成训练日/休息日 AI 建议、每日目标确认。
- 验收：不同训练日与不同用户资料得到不同目标，目标与实际摄入可比较。

### 阶段三：提醒与收尾

- 完成三类提醒、测试通知、订阅状态。
- 完成移动端适配、数据删除/导出入口。
- 验收：用户能验证通知状态；所有新增数据继续按账号隔离。
