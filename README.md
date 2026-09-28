# AdFlux Ad Engine Demo

An advertising platform sandbox built with [vinext](https://github.com/cloudflare/vinext), Cloudflare Workers, and D1. A single console brings together multi-channel candidate retrieval, filtering, coarse and fine ranking, first-price and generalized second-price (GSP) auctions, settlement across multiple billing models, budget reservation and event-based charging, immutable audit logs, A/B experiments, server-side retrieval replay, and time-based budget pacing.

See the [code structure guide](docs/code-structure.md) for the architecture, core data flows, and extension points; the [operator guide](docs/operator-guide.md) for local operation and acceptance checks; and the [production gap analysis](docs/production-gap-analysis.md) for remaining work toward commercial deployment. These supporting documents are currently in Chinese.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev      # Start the local dev server with simulated D1 bindings via the Cloudflare Vite plugin
npm test         # Build for production and run rendering checks and behavioral integration tests
npm run build    # Generate Cloudflare Worker deployment artifacts
```

## Testing

`npm test` builds the application and runs two test suites:

- `tests/rendered-html.test.mjs`: checks server-rendered HTML and the presence of core capabilities.
- `tests/api-behavior.test.mjs`: uses a module loader to replace `cloudflare:workers` with a test shim and injects an in-memory D1-compatible database with all migrations applied, including immutability triggers. It sends HTTP requests to the built Worker to verify ad decisions, event ordering, idempotent charging, ledger reconciliation, expired reservation release, frequency capping, audit idempotency, time-based pacing, and server-side retrieval replay.

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

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs optional or required ChatGPT sign-in (not yet integrated into the management APIs; see the next-phase plan in the [production gap analysis](docs/production-gap-analysis.md)):

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
