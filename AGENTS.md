<!-- intent-skills:start -->

## Skill Loading

Before editing files for a substantial task:

- Run `pnpm dlx @tanstack/intent@latest list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `pnpm dlx @tanstack/intent@latest load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
<!-- intent-skills:end -->

## Project Context

- This app is MetricsDock, a standalone SaaS for Shopify app developers to analyze Shopify Partner app data. It is not an embedded Shopify Admin app or Shopify extension.
- The core data source is the Shopify Partner API. The current default/stable version is `2026-04`; use `SHOPIFY_PARTNER_API_VERSION=2026-04` unless explicitly changing versions.
- Partner API auth uses the organization-scoped endpoint and `X-Shopify-Access-Token`. `Manage apps` is required for apps/events, and `View financials` is required for transactions.
- The Partner API does not expose a top-level app listing for this version. Users manually provide Partner app IDs in the UI; server code normalizes them to Partner API GIDs.

## Authentication And Organizations

- Better Auth is the auth source of truth. Verify package exports and plugin docs before changing Better Auth imports; this repo uses imports from `better-auth/plugins` and `better-auth/client/plugins`.
- Better Auth organizations are the app's tenant boundary. Every user gets a personal organization when their account is created, users can create more organizations, and users can join other organizations by invitation.
- The active organization must always be one the signed-in user belongs to. If a session has no valid active organization, set it to the user's first organization or create their personal organization.
- Partner connections, Partner apps, sync runs, reports, shop search, and settings are scoped to the active Better Auth organization via `authOrganizationId`. Do not scope these workflows by user alone.
- Organization slugs are internal and generated from the name plus a random suffix. Do not add UI that lets users set or edit slugs directly.
- Enforce organization member permissions server-side in `*.functions.ts`/`*.server.ts`, not only in the UI. Owners can manage admins and members; admins can manage members only. Keep Better Auth's last-owner protections intact by using Better Auth organization APIs for role updates and removals after app-level checks.

## TanStack Start

- Use `*.functions.ts` for client-importable `createServerFn` wrappers.
- Use `*.server.ts` for server-only DB, auth, env, Shopify, queue, and worker logic.
- Do not use dynamic imports to hide server code. Keep static imports and rely on TanStack's `.server.ts` and `.functions.ts` boundaries.
- Server functions must authenticate inside the endpoint handler. Route guards alone do not protect server data.
- Use TanStack Router `Link` for app navigation. For dynamic routes, pass params with `to="/shops/$shopId"` and `params={{ shopId }}`; do not interpolate path strings.
- Use serializable search params only. Keep dates as `YYYY-MM-DD` strings, and use `loaderDeps` so unrelated params like table sort do not refetch route data.
- Regenerate routes with `pnpm generate-routes` after adding, moving, or deleting route files.

## TanStack DB Loading

- TanStack DB collections are client-side only. Routes that use them must set `ssr: false`.
- Use singleton collections in shared modules, call `collection.preload()` from route loaders, and consume data with `useLiveQuery`.
- For server-backed reads, use `queryCollectionOptions`. A collection query should return the complete server state for that collection, not a filtered partial subset unless an on-demand merge pattern is intentionally implemented.
- Do not use TanStack DB collections for partial typeahead/search suggestions. Use authenticated server functions for on-demand searches.
- Refetch collections after mutations and clear collection data on sign out to avoid stale same-browser user data.

## Forms And UI

- App forms should use TanStack Form with Zod: `useForm`, `validators: { onSubmit: schema }`, `form.Field`, and `form.Subscribe`.
- Compose forms with shadcn `Field`, `FieldLabel`, `FieldError`, `FieldGroup`, and inputs. Do not use raw `FormData` for app forms.
- Use shadcn components and charts already installed in `src/components/ui`. Run shadcn CLI docs/search before adding new components.
- Preserve the existing `src/components/ui/button.tsx`; do not overwrite it via the shadcn CLI.
- Use shadcn/Base UI dialogs for confirmations and destructive actions; do not use `window.alert` or `window.confirm` in app UI.
- Prefer native browser controls, like date inputs, unless a richer component is actually needed.
- Use the shared `DataTable` component for tables. It handles shadcn table markup, sorting, shallow URL sort params, and 30-row pagination.
- Report date ranges use `YYYY-MM-DD` search params, default to the last 30 days, and should not allow future dates.
- Use shared date formatting helpers in `src/lib/format.ts`; avoid ad hoc `toLocaleString()` calls in route components.

## Search

- Global shop search should be an authenticated server function, not a collection.
- Search only shops owned by the signed-in user by joining through `shop_app_relationships`, `partner_apps`, and `partner_connections`.
- Searchable shop fields are `myshopify_domain`, shop `name`, and `shopify_shop_id`; cap suggestions at 3.
- Prefer Postgres search/ranking plus `ilike` fallback. Avoid `SELECT DISTINCT` with computed `ORDER BY` rank expressions; Postgres rejects that shape. Fetch a small ranked set and dedupe in app code if needed.
- Do not swallow search errors as empty results in the UI; show a small retry/failure state.

## Shopify GraphQL

- Search Shopify Partner API docs before adding or changing Partner GraphQL operations.
- Validate every generated or changed Partner GraphQL operation against Shopify Partner API `2026-04` before merging.
- Store raw Partner API payloads where available so analytics can be rebuilt later.

## Google Analytics And App Store Analytics

- Google Analytics is a secondary connector for Shopify App Store listing analytics, not the app's core data source. Keep the product surface framed as App Store performance, conversion, sources, markets, and actions; avoid making users understand GA event/dimension names unless they open raw event details.
- GA OAuth uses `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY`, the `https://www.googleapis.com/auth/analytics.readonly` scope, and the callback path `/api/google-analytics/oauth/callback`. The exact redirect URI derived from `BETTER_AUTH_URL` must be registered in Google Cloud Console.
- GA connections and app mappings are scoped to the active Better Auth organization through `authOrganizationId`. Do not scope GA connections or reports by user alone.
- The GA connect flow should map a Partner app while connecting the GA4 property. Keep refresh tokens encrypted, keep app API keys out of browser URLs/logs, and encrypt any API key carried through OAuth state.
- Shopify App Store GA custom dimensions such as `customEvent:api_key`, `customEvent:surface_type`, and `customEvent:surface_detail` may be missing or `(not set)`. If an app API-key-filtered query returns no rows but property-level App Store events exist, fall back to property-level events with a visible setup warning rather than silently rendering zero metrics.
- App Store reporting should compare the selected range to the previous matching range and surface plain-English insights and recommendations before raw GA rows.
- For visible App Store analytics bugs, validate the full path: settings mapping -> encrypted GA token -> GA Data API response -> server aggregation -> rendered report. Do not treat zero metrics as a display-only issue.

## Env And Secrets

- Reference `process.env` directly where variables are used. Do not reintroduce a central env helper file.
- Use `VALKEY_URL` only for queues. Do not add `REDIS_URL` aliases.
- `.env.example` should contain placeholders or safe defaults only. Never print, log, or expose secret values.

## Emails

- Build email templates with `jsx-email` in `src/emails`. Template files should export a named `Template` function and `previewProps` so `pnpm exec email build ... --use-preview-props` works.
- Send transactional email only from server-only code, currently `src/server/email.server.ts`, through Plunk's transactional API. Keep `PLUNK_API_KEY`, `PLUNK_FROM_EMAIL`, and `PLUNK_FROM_NAME` server-side only.
- Use Better Auth email hooks such as `sendResetPassword` from `src/lib/auth.server.ts` for auth emails. Preserve Better Auth's enumeration-safe responses and never expose reset tokens outside the email link.
- Email styling should use inline, email-safe CSS and hex colors derived from the shadcn theme tokens in `src/styles.css`; do not rely on Tailwind classes, CSS variables, or OKLCH values inside rendered email HTML.
- Use absolute image URLs for email assets. The app logo lives at `public/logo.png`; derive an absolute `/logo.png` URL from the app/reset URL instead of using relative paths.
- Verify email template changes with `pnpm exec email build src/emails/<template>.tsx --out /tmp/metricsdock-email-build --silent --use-preview-props`, plus the normal project checks when TypeScript changes.

## Logging

- Use LogTape through `src/lib/logging.server.ts`; do not create extra logger instances or write runtime `console.*` calls.
- Runtime logs go to Railway stdout/stderr as flattened JSON Lines. Keep fields structured and queryable rather than embedding data in message strings.
- Prefer one wide event per service hop: HTTP requests are emitted from `src/start.ts`, and worker sync jobs are emitted from `src/worker.ts`.
- Add request or job context with `addWideLogContext()` from code that already knows business identifiers such as `user_id`, `auth_organization_id`, app IDs, job IDs, counts, and outcomes.
- Never log Partner API tokens, encrypted secrets, OAuth tokens, raw authorization headers, cookies, or full request bodies. Log safe IDs, counts, status, durations, and serialized error metadata instead.

## Railway

- Deploy as two Railway services from the same repo: web runs `pnpm run start`, worker runs `pnpm run worker`.
- Web health check path is `/api/health`.
- Keep build behavior in `nixpacks.toml`.
- Avoid a root `railway.json` unless intentionally pinning one service's config; it can accidentally apply web start/health settings to the worker.

## Local Dev And Queues

- `compose.yaml` is only for local Postgres and Valkey. Use `pnpm docker:up`, `pnpm docker:down`, and `pnpm docker:destroy`.
- Queued syncs require the worker process. Run `pnpm run worker` alongside `pnpm dev` when testing sync locally.
- Workbench is mounted at `/jobs` for BullMQ visibility. Keep it protected with `WORKBENCH_USERNAME` and `WORKBENCH_PASSWORD` in production.

## Verification

- Tests were intentionally removed and should not be re-added or treated as required verification.
- Use `pnpm typecheck`, `pnpm check`, `pnpm lint` for verification.
- Run `pnpm generate-routes` before verification when route files changed.
