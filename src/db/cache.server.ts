import { Cache } from 'drizzle-orm/cache/core'
import type { MutationOption } from 'drizzle-orm/cache/core'
import type { CacheConfig } from 'drizzle-orm/cache/core/types'
import { getTableName, isTable } from 'drizzle-orm/table'
import { createStorage } from 'unstorage'
import type { Storage } from 'unstorage'
import redisDriver from 'unstorage/drivers/redis'

type DrizzleCacheEntry = {
  response: any[]
  tables: string[]
}

type UnstorageDrizzleCacheOptions = {
  base: string
  ttlMs: number
  url: string
}

export class UnstorageDrizzleCache extends Cache {
  private readonly defaultTtlMs: number
  private readonly storage: Storage<DrizzleCacheEntry>

  constructor(options: UnstorageDrizzleCacheOptions) {
    super()

    this.defaultTtlMs = options.ttlMs
    this.storage = createStorage<DrizzleCacheEntry>({
      driver: redisDriver({
        url: options.url,
        base: options.base,
        ttl: Math.ceil(options.ttlMs / 1000),
      }),
    })
  }

  override strategy() {
    return 'all' as const
  }

  override async get(key: string): Promise<any[] | undefined> {
    try {
      const entry = await this.storage.getItem<DrizzleCacheEntry>(
        toStorageKey(key),
      )

      return entry?.response
    } catch {
      return undefined
    }
  }

  override async put(
    key: string,
    response: any,
    tables: string[],
    _isTag: boolean,
    config?: CacheConfig,
  ) {
    try {
      const ttlSeconds = resolveTtlSeconds(config, this.defaultTtlMs)
      if (ttlSeconds <= 0) return

      await this.storage.setItem(
        toStorageKey(key),
        {
          response,
          tables,
        },
        { ttl: ttlSeconds },
      )
    } catch {
      return
    }
  }

  override async onMutate(params: MutationOption) {
    try {
      const tags = toList(params.tags)
      const mutatedTables = new Set(toTableNames(params.tables))

      await Promise.all(
        tags.map((tag) => this.storage.removeItem(toStorageKey(tag))),
      )

      if (!mutatedTables.size) return

      const keys = await this.storage.getKeys('query')

      await Promise.all(
        keys.map(async (key) => {
          const entry = await this.storage.getItem<DrizzleCacheEntry>(key)

          if (
            !entry ||
            entry.tables.some((table) => mutatedTables.has(table))
          ) {
            await this.storage.removeItem(key)
          }
        }),
      )
    } catch {
      return
    }
  }
}

function toStorageKey(key: string) {
  return `query:${encodeURIComponent(key)}`
}

function resolveTtlSeconds(
  config: CacheConfig | undefined,
  fallbackMs: number,
) {
  const now = Date.now()

  if (typeof config?.ex === 'number') return config.ex
  if (typeof config?.px === 'number') return Math.ceil(config.px / 1000)
  if (typeof config?.exat === 'number')
    return config.exat - Math.ceil(now / 1000)
  if (typeof config?.pxat === 'number') {
    return Math.ceil((config.pxat - now) / 1000)
  }

  return Math.ceil(fallbackMs / 1000)
}

function toTableNames(tables: MutationOption['tables']) {
  return toList(tables).map((table) =>
    isTable(table) ? getTableName(table) : table,
  )
}

function toList<T>(value: T | T[] | undefined) {
  return Array.isArray(value) ? value : value ? [value] : []
}
