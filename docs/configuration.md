# Configuration

Copy `.env.example` to `.env.local` for local development. `.env.local` and other local environment files are ignored by Git; never commit real credentials.

## Application variables

| Variable               | Required               | Description                                                                                          |
| ---------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`         | Yes                    | PostgreSQL connection string.                                                                        |
| `PG_POOL_MAX`          | No                     | Maximum database connections per process. Defaults to `5`; budget for both web and worker processes. |
| `BETTER_AUTH_URL`      | Yes                    | Public application origin, without a trailing path. Use `http://localhost:3000` locally.             |
| `BETTER_AUTH_SECRET`   | Yes                    | Better Auth signing secret with at least 32 characters.                                              |
| `ENCRYPTION_KEY`       | Yes                    | Base64-encoded 32-byte key used to encrypt Partner and Google tokens.                                |
| `VALKEY_URL`           | Production and workers | Valkey connection string for BullMQ and the production query cache.                                  |
| `CRON_SECRET`          | Yes                    | Secret accepted by the fallback `POST /api/sync` cron endpoint.                                      |
| `GOOGLE_CLIENT_ID`     | Yes                    | Google OAuth client ID for Google sign-in and Analytics authorization.                               |
| `GOOGLE_CLIENT_SECRET` | Yes                    | Google OAuth client secret.                                                                          |
| `PLUNK_API_KEY`        | Email flows            | Plunk transactional API key.                                                                         |
| `PLUNK_FROM_EMAIL`     | Email flows            | Verified sender email address.                                                                       |
| `PLUNK_FROM_NAME`      | No                     | Sender display name. Defaults to `MetricsDock`.                                                      |
| `WORKBENCH_USERNAME`   | Production             | Basic Auth username for `/jobs`.                                                                     |
| `WORKBENCH_PASSWORD`   | Production             | Basic Auth password for `/jobs`.                                                                     |

Generate local secrets with:

```bash
openssl rand -base64 32
```

Use a different generated value for `BETTER_AUTH_SECRET` and `ENCRYPTION_KEY`. Generate `CRON_SECRET` and the Workbench password independently as well. Store production secrets in the deployment platform's secret manager, not in an environment file committed to the repository.

## Google OAuth callbacks

Register these exact redirect URIs in the Google Cloud Console, replacing the origin for each environment:

```text
https://your-domain.example/api/auth/callback/google
https://your-domain.example/api/google-analytics/oauth/callback
```

The OAuth client needs the Google Analytics read-only scope for App Store analytics:

```text
https://www.googleapis.com/auth/analytics.readonly
```

Google Analytics connections are mapped to a Partner app during setup. Tokens are encrypted at rest and scoped to the active Better Auth organization.

## Shopify Partner credentials

Shopify Partner organization IDs, access tokens, and app IDs are entered through `/settings/connections`; they are not environment variables. Access tokens are encrypted before storage.

The Partner API client needs `Manage apps` for apps and events and `View financials` for transactions.

## Platform-provided variables

MetricsDock reads common Railway and source-revision variables when present to enrich structured logs. You do not need to define `RAILWAY_*`, `GIT_COMMIT_SHA`, or `SOURCE_VERSION` locally.
