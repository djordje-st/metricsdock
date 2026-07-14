# Deployment

MetricsDock runs as two long-lived processes backed by the same PostgreSQL database and Valkey instance:

- Web: `pnpm start`
- Worker: `pnpm worker`

Apply migrations from exactly one deployment step or one-off job. Do not run migrations in both process start commands.

## Container image

Build the shared image from the repository root:

```bash
docker build -f docker/Dockerfile -t metricsdock .
```

Run the web process with the image's default command, or override it for the worker and migrations:

```bash
docker run --rm --env-file .env.production -p 3000:3000 metricsdock
docker run --rm --env-file .env.production metricsdock pnpm worker
docker run --rm --env-file .env.production metricsdock pnpm db:migrate
```

The database and Valkey URLs must be reachable from inside the container. The image contains only committed source and production dependencies; environment files are excluded from the build context.

## Railway

Provision PostgreSQL and Valkey, then create two services from the same repository:

| Service | Start command | Health check  |
| ------- | ------------- | ------------- |
| Web     | `pnpm start`  | `/api/health` |
| Worker  | `pnpm worker` | None          |

`nixpacks.toml` installs with the frozen lockfile, runs the repository checks, and builds the app. Set each service's `PG_POOL_MAX` so their combined connection budgets stay within the PostgreSQL plan limit.

Run `pnpm db:migrate` as a web pre-deploy command or a dedicated one-off migration job. Do not configure it on the worker as well.

The worker installs the BullMQ scheduler on startup. `POST /api/sync` with `x-cron-secret` remains available as a fallback external trigger:

```bash
curl -X POST "https://your-domain.example/api/sync" \
  -H "x-cron-secret: $CRON_SECRET"
```

## Production checklist

- Use unique production values for every secret in `.env.example`.
- Keep `ENCRYPTION_KEY` stable and backed up securely.
- Register the exact production Google callback URLs.
- Protect `/jobs` with `WORKBENCH_USERNAME` and `WORKBENCH_PASSWORD`.
- Run the worker; queued syncs do not process in the web service.
- Apply database migrations from one owner only.
- Replace and legally review the publication-draft privacy policy in `src/routes/privacy.tsx` before serving a public instance.
- Review retention, backup, email-sender, and data-processing policies for your jurisdiction.
