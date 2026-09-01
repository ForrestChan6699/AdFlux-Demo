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
- 召回黄金场景回归、通道覆盖与空召回监控
- D1 运行健康检查、资金对账修复与请求全链路追踪
- 真实事件模拟、真实请求流和 5 秒监控刷新
- 实时库存状态/出价管理及不可变操作审计
- 单次决策阶段耗时、召回通道与过滤原因诊断

## 2. 目录结构

```text
engine/
├── app/
│   ├── page.tsx              # 根页面，挂载广告平台控制台
│   ├── layout.tsx            # HTML 根布局、字体和页面元数据
│   ├── AdWorkbench.tsx       # 在线决策、策略配置、监控和顶层导航
│   ├── RecallTestBench.tsx   # 召回黄金场景、质量断言与通道统计
│   ├── OperationsCenter.tsx  # 数据一致性、预算安全与请求追踪
│   ├── EventConsole.tsx      # 真实曝光/点击/转化上报控制台
│   ├── LiveMonitor.tsx       # 基于 D1 的真实请求与事件监控
│   ├── InventoryManager.tsx  # D1 库存搜索、启停、改价和审计查看
│   ├── DecisionLab.tsx       # 请求画像、阶段候选及真实诊断
│   ├── StrategyCenter.tsx    # 策略草稿、版本和生产激活
│   ├── CampaignPortfolio.tsx # 计划预算、状态和账户余额
│   ├── PlacementManager.tsx  # 广告位、拍卖方式和底价管理
│   ├── RiskConsole.tsx       # 基于真实请求/事件的风险扫描
│   ├── ExperimentConsole.tsx # 稳定分桶和真实实验指标
│   ├── ad-engine.ts          # 广告引擎兼容导出入口
│   ├── engine/
│   │   ├── index.ts          # 五阶段统一编排和公共导出
│   │   ├── types.ts          # 请求、策略、广告及结果类型
│   │   ├── config.ts         # 默认策略和兴趣配置
│   │   ├── data.ts           # 200 条标准演示广告生成
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
├── app/api/ops/
│   ├── health/route.ts       # 健康汇总、完整性检查与过期预占释放
│   └── request/[id]/route.ts # 请求、拍卖、事件、预算和账本全链路
├── app/api/inventory/
│   └── route.ts              # 库存查询、幂等修改与操作审计
├── app/api/{campaigns,placements,strategies,experiments}/
│   └── route.ts              # 投放、广告位、策略和实验服务接口
├── app/server/
│   └── budget.ts             # 预算原子预占、确认和超时释放
├── worker/
│   └── index.ts              # Cloudflare Worker 运行入口
├── tests/
│   └── rendered-html.test.mjs # 服务端渲染与核心能力检查
├── docs/
│   ├── code-structure.md     # 本文档
│   └── operator-guide.md     # 本地运营与验收手册
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
    ├── StrategyCenter          策略版本治理
    ├── LiveMonitor             真实数据监控
    ├── RecallTestBench         召回测试台
    ├── InventoryManager        库存、计划与广告位管理
    ├── EventConsole            真实事件闭环
    ├── RiskConsole             数据库风险扫描
    └── ExperimentConsole       稳定分桶 A/B 实验
```

`AdWorkbench.tsx` 只负责全局请求状态和顶部导航。决策实验室及各商业化模块均已拆分为独立组件，避免主工作台继续膨胀。

## 4. 核心广告引擎

核心逻辑位于 `app/engine/`。`app/ad-engine.ts` 仅作为兼容入口统一转发公共导出，现有页面无需感知内部模块拆分。

### 4.1 数据模型

- `RequestProfile`：城市、设备、广告场景和用户 ID。
- `RequestProfile.interests`：请求级用户兴趣多选；为空时仅保留地域与热门召回。
- `StrategyConfig`：热门召回阈值、频控上限、粗排/精排 Top K 及特征权重。
- `BillingMode`：`CPM | CPC | CPA | oCPM`。
- `Ad`：广告基础信息、定向条件、计费模式、出价、CTR、CVR、质量分、预算和频次。
- `RankedAd`：在 `Ad` 基础上追加召回通道、排序分、eCPM、计费价格及过滤原因。

Demo 使用确定性规则生成 200 条标准广告，不依赖随机数。前端候选池与服务端 `cmp_demo` 库存使用同一数据源，因此相同请求和策略会得到一致结果，便于测试与演示。

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

在线请求、广告库存、事件、资金流水、策略版本、操作审计和实验分桶均由服务端接口和 D1 持久化；React 只保存当前页面编辑态：

- `request`：请求画像。
- `strategy`：当前策略参数。
- `active`：正在查看的决策阶段。
- `runId`：每次运行请求时更新请求编号。

请求画像或策略发生变化后，`useMemo` 会重新执行 `runEngine`，因此策略配置页、请求实验室和监控页共享同一份计算结果。

## 6. 商业化模块

### 投放管理与 Pacing

`InventoryManager`、`CampaignPortfolio` 和 `PlacementManager` 直接管理 D1 广告、计划和广告位。启停、改价、日预算、拍卖方式和底价修改即时生效，并写入不可更新/删除的操作审计。

### 事件模拟与归因

`EventConsole` 使用胜出广告的签名追踪链接调用真实事件 API，执行曝光、点击、转化顺序校验、幂等写入和按计费模式清算，并读取数据库事件明细。

### 反作弊

`RiskConsole` 每 10 秒扫描真实请求与事件，检查事件顺序违规、点击后一秒内转化、高频请求用户和胜出后长期无曝光。

### A/B 实验

`ExperimentConsole` 按用户 ID 稳定分桶并持久化请求级实验曝光。对照/实验指标由真实拍卖、曝光、点击和转化聚合；实验分桶记录不可修改或删除。

### 数据监控

`LiveMonitor` 每 5 秒读取 D1，展示 24 小时请求、填充率、平均清算 eCPM、事件量、真实候选漏斗和最近请求流。

### 召回测试台

`RecallTestBench` 使用同一套 `runEngine` 依次执行 8 个固定黄金场景，覆盖城市、设备、广告位及零兴趣、单兴趣、多兴趣和全兴趣请求。每个场景记录召回、过滤、粗排、精排数量，以及定向、兴趣、热门三路通道命中、多通道交集和执行耗时。

当前自动断言包括：最少/最多召回量、合并结果不存在重复广告、最大执行耗时、粗排不超过 Top 30、精排不超过 Top 8。门槛可以在页面中调整并重新测试。

测试人员可以选择城市、设备、场景和多个兴趣创建临时用例，也可以删除临时用例或只查看失败结果。失败行直接列出不满足的断言；“导出 JSON”会生成包含测试环境、质量门槛、汇总指标和逐用例明细的报告，便于留档和比较版本差异。

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

### 本地实时数据库

开发服务器通过 Cloudflare Vite 插件的 `persistState` 将真实 D1 状态保存在项目内可见的 `local-data/v3/d1/miniflare-D1DatabaseObject/`。名称较长且不是 `metadata.sqlite` 的文件就是应用正在使用的 SQLite 数据库。Navicat 可直接连接该文件，修改广告、计划、广告主或广告位后，后续请求会立即读取新值，不再需要数据库镜像同步。

`local-data/` 是本地运行状态并已加入 `.gitignore`，不会进入代码仓库或线上部署包。审计表的不可变触发器仍然生效。

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

接口运行时会确保数据库存在同一批 200 条标准演示广告，随后从 D1 加载该标准库存，在服务端执行完整决策链路，并保存请求、候选数量、胜出广告和计费结果。旧 `local_ad` 仅为历史流水保留并暂停，不再进入新请求。`GET /api/ad/request` 返回最近 20 条请求。

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

数据库迁移为 `billing_ledger`、`auction_logs`、`ad_events`、`operation_audit_logs` 和 `experiment_assignments` 建立禁止 `UPDATE/DELETE` 的触发器。资金或审计修正只能追加记录，不能覆盖历史；预算预占也只能从 `reserved` 单向进入 `charged` 或 `released`。

1. 增加退款、人工调账审批和日终对账任务。
2. 对事件加入服务端可见性证明、设备指纹、IP 信誉和更完整的风险评分。
3. 为策略版本补充审批流、按百分比灰度、指标护栏和一键回滚。
4. 接入生产级指标系统、分布式追踪和主动告警通知。

为了保持现有页面稳定，新增领域逻辑应优先放到独立模块中，再由 `AdWorkbench` 负责组合，避免把算法、数据和展示继续集中在单一组件。
