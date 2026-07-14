# MetricsDock

MetricsDock is a standalone analytics application for Shopify app developers. It imports Shopify Partner API data and turns it into auditable revenue, customer, churn, shop, and App Store performance reports.

The project is under active development and is not affiliated with or endorsed by Shopify.

## What it includes

- Organization-scoped workspaces, members, invitations, passkeys, and password authentication with Better Auth.
- Shopify Partner app-event and transaction syncs with raw source payload retention.
- Revenue, customer, churn, shop, and app-level reports.
- Optional Google Analytics 4 mapping for Shopify App Store listing analytics.
- BullMQ workers, scheduled syncs, and a protected Workbench queue dashboard.
- PostgreSQL persistence and Valkey-backed queues and production query caching.

## Requirements

- Node.js 22.12 or newer.
- pnpm 11 (Corepack uses the version pinned in `package.json`).
- Docker with Compose for local PostgreSQL and Valkey, or equivalent services you manage yourself.
- OpenSSL for generating local secrets.

## Local setup

1. Install dependencies and create your local environment file:

   ```bash
   corepack enable
   pnpm install
   cp .env.example .env.local
   ```

2. Replace the secret placeholders in `.env.local`:

   ```bash
   openssl rand -base64 32 # ENCRYPTION_KEY
   openssl rand -base64 32 # BETTER_AUTH_SECRET
   openssl rand -hex 32    # CRON_SECRET
   ```

   Keep `ENCRYPTION_KEY` stable. Changing it makes stored Partner and Google tokens unreadable. Google OAuth and Plunk can use placeholders for basic local UI work, but their related sign-in, analytics, and email flows will not work until valid credentials are configured.

3. Start PostgreSQL and Valkey, then apply the schema:

   ```bash
   pnpm docker:up
   pnpm db:migrate
   ```

4. Run the web app and worker in separate terminals:

   ```bash
   pnpm dev
   ```

   ```bash
   pnpm worker
   ```

5. Open [http://localhost:3000](http://localhost:3000). The queue dashboard is available at [http://localhost:3000/jobs](http://localhost:3000/jobs).

See [configuration](docs/configuration.md) for every environment variable and connector callback.

## Shopify Partner setup

Create a Shopify Partner API client with:

- `Manage apps` for app and app-event access.
- `View financials` for transactions and financial reports.

After signing in, open `/settings/connections` and provide the Partner organization ID, organization-scoped access token, and Partner app ID. The Partner API does not expose a top-level app list, so app IDs are entered manually and normalized to Partner API GIDs by the server.

MetricsDock currently targets Shopify Partner API `2026-04`.

## Run the complete stack with Docker

The same image can run the web process, worker, or migrations. The Compose `app` profile wires it to the local PostgreSQL and Valkey services:

```bash
docker compose --profile app build
docker compose --profile app run --rm web pnpm db:migrate
docker compose --profile app up
```

Build the image directly with:

```bash
docker build -f docker/Dockerfile -t metricsdock .
```

Production and Railway guidance is in [deployment](docs/deployment.md).

## Project structure

```text
src/routes/          TanStack Router pages and HTTP endpoints
src/server/          Authenticated server functions and service logic
src/db/              Drizzle schema, migrations, and database setup
src/emails/          jsx-email transactional templates
src/worker.ts        BullMQ worker and scheduler process
compose.yaml         Local dependencies and optional full app stack
docker/Dockerfile    Production web/worker image
```

## Useful scripts

| Command                | Purpose                                |
| ---------------------- | -------------------------------------- |
| `pnpm dev`             | Start the local web server             |
| `pnpm worker`          | Start the queue worker                 |
| `pnpm build`           | Build the production server            |
| `pnpm start`           | Run the built web server               |
| `pnpm docker:up`       | Start local PostgreSQL and Valkey      |
| `pnpm docker:down`     | Stop local services                    |
| `pnpm docker:destroy`  | Stop services and delete local volumes |
| `pnpm db:generate`     | Generate a Drizzle migration           |
| `pnpm db:migrate`      | Apply committed migrations             |
| `pnpm typecheck`       | Run TypeScript checks                  |
| `pnpm lint`            | Run ESLint                             |
| `pnpm check`           | Check formatting                       |
| `pnpm check:generated` | Check route-tree and migration drift   |

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Please report vulnerabilities using the private process in [SECURITY.md](SECURITY.md), not a public issue.

## License

MetricsDock is available under the [MIT License](LICENSE).
