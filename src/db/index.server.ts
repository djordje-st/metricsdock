import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { UnstorageDrizzleCache } from './cache.server.ts'
import * as schema from './schema.ts'

const poolMax = Number(process.env.PG_POOL_MAX ?? 5)

if (!Number.isInteger(poolMax) || poolMax < 1) {
  throw new Error('PG_POOL_MAX must be a positive integer')
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  max: poolMax,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
})

export const db = drizzle(pool, {
  schema,
  cache:
    process.env.NODE_ENV === 'production'
      ? new UnstorageDrizzleCache({
          ttlMs: 10_000,
          url: process.env.VALKEY_URL!,
          base: 'metricsdock:drizzle-cache',
        })
      : undefined,
})
