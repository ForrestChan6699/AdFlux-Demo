# AdFlux 广告引擎 Demo

一个运行在 [vinext](https://github.com/cloudflare/vinext) + Cloudflare Worker + D1 上的广告平台沙盘：多路召回、过滤、粗排、精排、一价/GSP 拍卖、多计费模式清算、预算预占与事件扣费、不可变审计、A/B 实验、召回服务端回放和分时 Pacing 集中在一个控制台中。

代码结构、核心数据流和扩展说明请参阅 [docs/code-structure.md](docs/code-structure.md)，本地验收手册见 [docs/operator-guide.md](docs/operator-guide.md)，商用化剩余差距见 [docs/production-gap-analysis.md](docs/production-gap-analysis.md)。

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev      # 本地开发服务（Cloudflare Vite 插件模拟 D1 绑定）
npm test         # 生产构建 + 渲染检查 + 行为级集成测试
npm run build    # 生成 Cloudflare Worker 部署产物
```

## Testing

`npm test` 执行两组测试：

- `tests/rendered-html.test.mjs`：服务端渲染与核心能力声明检查。
- `tests/api-behavior.test.mjs`：通过 module loader 把 `cloudflare:workers` 替换为测试 shim，注入应用了全部迁移（含不可变触发器）的内存 D1，对构建产物发起真实 HTTP 调用，覆盖广告决策、事件顺序与幂等扣费、账本对账、过期预占释放、频控、操作审计幂等、分时 Pacing 和召回服务端回放。

## Workspace Auth Headers

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Email and name are intended for display or contact purposes.

SIWC-authenticated workspace sites may also receive `oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty `name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by `oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs optional or required ChatGPT sign-in (尚未接入管理接口，见 production-gap-analysis 的下一阶段计划):

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the OAuth cookies, and identity header injection. Do not implement app routes for those reserved paths.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the Worker and run render + behavioral tests
- `npm run db:generate`: generate Drizzle migrations after schema changes
