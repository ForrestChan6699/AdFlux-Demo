# AdFlux 广告引擎 Demo：代码结构说明

## 1. 项目概览

AdFlux 是一个基于 React 19、TypeScript、vinext 和 Cloudflare Worker 构建的广告平台沙盘。项目把广告请求的在线决策链路与投放运营能力集中在一个控制台中。

当前包含以下能力：

- 广告召回、过滤、粗排、精排和计费
- CPM、CPC、CPA、oCPM 多计费模式
- 广告主和投放计划管理
- 预算 Pacing
- 曝光、点击、转化事件模拟
- 多模型转化归因
- 反作弊规则和风险事件
- A/B 实验及数据监控
- 一价/GSP 竞价、动态底价与统一 eCPM 清算
- 预算预占、事件扣费、超时释放与资金账本
- 曝光、点击、转化事件幂等采集

## 2. 目录结构

```text
engine/
├── app/
│   ├── page.tsx              # 根页面，挂载广告平台控制台
│   ├── layout.tsx            # HTML 根布局、字体和页面元数据
│   ├── AdWorkbench.tsx       # 在线决策、策略配置、监控和顶层导航
│   ├── PlatformModules.tsx   # 投放、归因、风控和实验模块
│   ├── ad-engine.ts          # 广告引擎兼容导出入口
│   ├── engine/
│   │   ├── index.ts          # 五阶段统一编排和公共导出
│   │   ├── types.ts          # 请求、策略、广告及结果类型
│   │   ├── config.ts         # 默认策略和兴趣配置
│   │   ├── data.ts           # 240 条演示广告生成
│   │   ├── recall.ts         # 多路召回
│   │   ├── filter.ts         # 定向、预算和频控过滤
│   │   ├── rank.ts           # 粗排、精排及 eCPM 换算
│   │   ├── billing.ts        # 多计费模式兼容入口
│   │   └── auction.ts        # 一价/GSP、底价和计费事件
│   ├── globals.css           # 全局基础样式
│   ├── workbench.css         # 决策台、策略页和监控页样式
│   ├── modules.css           # 商业化扩展模块样式
│   ├── billing.css           # 计费模式标签和出价单位样式
│   └── chatgpt-auth.ts       # 可选的 ChatGPT 登录辅助函数
├── db/
│   ├── index.ts              # Drizzle 数据库入口
│   └── schema.ts             # 广告主、计划、广告和请求日志表
├── app/api/ad/request/
│   └── route.ts              # 服务端广告请求与历史查询接口
├── app/api/events/[type]/
│   └── route.ts              # 曝光、点击、转化采集与幂等扣费
├── app/api/billing/ledger/
│   └── route.ts              # 预算预占及资金账本查询
├── app/server/
│   └── budget.ts             # 预算原子预占、确认和超时释放
├── worker/
│   └── index.ts              # Cloudflare Worker 运行入口
├── tests/
│   └── rendered-html.test.mjs # 服务端渲染与核心能力检查
├── docs/
│   └── code-structure.md     # 本文档
├── .openai/hosting.json      # Sites 项目及资源绑定配置
├── vite.config.ts            # vinext、Vite、Sites 构建配置
├── next.config.ts            # Next 兼容层配置
├── drizzle.config.ts         # Drizzle 迁移配置
└── package.json              # 依赖和开发命令
```

## 3. 页面组件关系

```text
page.tsx
└── AdWorkbench
    ├── Header
    ├── Lab                     请求实验室
    │   ├── Profile             用户及请求画像
    │   ├── AdTable             各阶段候选明细
    │   └── Billing             胜出广告和计费结果
    ├── Strategy                策略配置
    ├── Monitor                 数据监控
    ├── CampaignManager         广告主、计划、Pacing
    ├── EventAttribution        事件模拟和转化归因
    ├── RiskCenter              反作弊与风险告警
    └── ExperimentCenter        A/B 实验
```

`AdWorkbench.tsx` 保存全局演示状态，并通过顶部导航选择模块。`PlatformModules.tsx` 放置相对独立的商业化功能，避免主工作台文件继续膨胀。

## 4. 核心广告引擎

核心逻辑位于 `app/engine/`。`app/ad-engine.ts` 仅作为兼容入口统一转发公共导出，现有页面无需感知内部模块拆分。

### 4.1 数据模型

- `RequestProfile`：城市、设备、广告场景和用户 ID。
- `StrategyConfig`：热门召回阈值、频控上限、粗排/精排 Top K 及特征权重。
- `BillingMode`：`CPM | CPC | CPA | oCPM`。
- `Ad`：广告基础信息、定向条件、计费模式、出价、CTR、CVR、质量分、预算和频次。
- `RankedAd`：在 `Ad` 基础上追加召回通道、排序分、eCPM、计费价格及过滤原因。

Demo 使用确定性规则生成 50 条标准广告，不依赖随机数。前端候选池与服务端 `cmp_demo` 库存使用同一数据源，因此相同请求和策略会得到一致结果，便于测试与演示。

### 4.2 决策链路

`runEngine(request, strategy)` 是统一入口，返回每个阶段的候选集合：

```text
广告池
  ↓
recalled   地域、兴趣、热门三路召回并去重
  ↓
rejected   逐条记录过滤原因
  ↓
filtered   保留通过状态、设备、场景、地域、预算和频控的广告
  ↓
coarse     根据 CTR、质量、出价、兴趣权重计算粗排分
  ↓
fine       将不同计费模式换算为统一 eCPM 后精排
  ↓
billing    对胜出广告计算实际价格
```

### 4.3 多计费模式归一化

精排需要把不同计费口径换算成可比较的 eCPM：

```text
CPM  eCPM = 出价
CPC  eCPM = CPC 出价 × pCTR × 1000
CPA  eCPM = CPA 出价 × pCTR × pCVR × 1000
oCPM eCPM = 目标转化出价 × pCTR × pCVR × 1000
```

精排分在 eCPM 基础上结合广告质量分。最终计费时，会依据胜出广告的计费模式选择相应分母，将第二名 eCPM 还原成 CPM、CPC 或转化价格，并且不会超过广告主出价。

## 5. 前端状态与交互

项目目前是无后端持久化的交互 Demo，状态保存在 React 组件中：

- `request`：请求画像。
- `strategy`：当前策略参数。
- `active`：正在查看的决策阶段。
- `runId`：每次运行请求时更新请求编号。
- `events`：曝光、点击和转化计数。
- `paused`：被暂停的投放计划。
- `rules`：反作弊规则开关。
- `allocation`：A/B 实验流量比例。

请求画像或策略发生变化后，`useMemo` 会重新执行 `runEngine`，因此策略配置页、请求实验室和监控页共享同一份计算结果。

## 6. 商业化模块

### 投放管理与 Pacing

`CampaignManager` 展示广告主余额、计划预算、消耗进度、计费模式和启停状态。Pacing 图将小时级理想消耗与实际消耗进行比较。

### 事件模拟与归因

`EventAttribution` 可以触发可见曝光、有效点击和购买转化，并维护近期事件日志。归因区域对比末次点击、首次触点、线性归因和时间衰减模型。

### 反作弊

`RiskCenter` 包含设备指纹、点击频率、IP 信誉和异常转化规则。当前规则开关只影响界面状态，风险数据为固定演示数据。

### A/B 实验

`ExperimentCenter` 支持调整对照组和实验组流量，展示 eCPM、CTR、CVR、留存和统计显著性结果。

### 数据监控

`Monitor` 展示 QPS、填充率、平均 eCPM、P99 延迟、实时漏斗、阶段耗时及近期请求流。

## 7. 样式组织

- `globals.css`：全局变量、字体和页面基础颜色。
- `workbench.css`：公共框架、导航、决策流水线、表格、策略和监控页面。
- `modules.css`：投放、归因、风控及实验模块。
- `billing.css`：CPM、CPC、CPA、oCPM 标签颜色及计费字段。

样式目前采用普通 CSS，并通过响应式媒体查询适配窄屏。

## 8. 测试与运行

```bash
npm install
npm run dev
npm test
npm run build
```

- `npm run dev`：启动本地开发服务。
- `npm test`：先执行生产构建，再检查服务端渲染、五阶段引擎和商业化模块。
- `npm run build`：生成 Cloudflare Worker 兼容的部署产物。

## 9. 后续扩展建议

广告库存与请求日志已经接入 D1；其他运营页面的交互状态仍保存在前端。若要继续向真实系统靠近，建议按以下边界拆分：

### 服务端广告请求

```http
POST /api/ad/request
Content-Type: application/json

{
  "userId": "u_90382",
  "placementId": "feed_home",
  "city": "上海",
  "device": "iOS",
  "scene": "信息流"
}
```

接口运行时会确保数据库存在同一批 50 条标准演示广告，随后从 D1 加载该标准库存，在服务端执行完整决策链路，并保存请求、候选数量、胜出广告和计费结果。旧 `local_ad` 仅为历史流水保留并暂停，不再进入新请求。`GET /api/ad/request` 返回最近 20 条请求。

### 预算、事件与竞价闭环

广告请求按广告位配置执行一价或 GSP 竞价。所有计费模式先换算为 eCPM 并应用底价；胜出候选必须成功预占广告主余额和 Campaign 日预算，否则自动尝试下一候选。

```text
胜出 → reserved / reserve 账本
计费事件到达 → charged / charge 账本
15 分钟超时 → released / 返还余额和预算
```

`feed_home` 使用 GSP，`video_recommend` 使用一价。CPM 和 oCPM 在有效曝光时确认，CPC 在点击时确认，CPA 在转化时确认。

事件写入接口为 `GET/POST /api/events/{impression|click|conversion}?token=...`，查询接口为 `GET /api/events`，并可用 `requestId` 过滤。写入接口校验 tracking token、胜出广告、请求后 7 天归因窗口以及“曝光 → 点击 → 转化”的顺序。`Idempotency-Key` 在请求和事件类型内隔离，重复上报不会重复记录或扣费。

每次成功拍卖都会写入 `auction_logs`，保存竞价类型、胜出者、第二名、底价、清算 eCPM、计费事件和候选数量。`GET /api/billing/ledger` 同时返回账户、预算预占、资金流水和拍卖审计。

数据库迁移为 `billing_ledger`、`auction_logs` 和 `ad_events` 建立禁止 `UPDATE/DELETE` 的触发器。资金或审计修正只能追加退款/调账记录，不能覆盖历史；预算预占也只能从 `reserved` 单向进入 `charged` 或 `released`。

1. 增加退款、人工调账审批和日终对账任务。
2. 对事件加入可见性验证、签名、风险评分和归因窗口计算。
3. 为每个策略版本保存配置快照，支持灰度、回滚和审计。
4. 将固定监控数据替换为事件聚合指标和告警规则。

为了保持现有页面稳定，新增领域逻辑应优先放到独立模块中，再由 `AdWorkbench` 负责组合，避免把算法、数据和展示继续集中在单一组件。
