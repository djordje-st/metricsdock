import { and, desc, eq, or, sql } from 'drizzle-orm'
import { db } from '#/db/index.server.ts'
import {
  partnerApps,
  partnerConnections,
  shopAppRelationships,
  shops,
  syncRuns,
  testShops,
} from '#/db/schema.ts'
import { toPartnerAppGid } from '#/lib/shopify-id.ts'
import {
  getAppDetailAnalyticsForUser,
  getAnalyticsForUser,
  getChurnReportForUser,
  getCustomerReportForUser,
  getDashboardAnalyticsForUser,
  getRevenueReportForUser,
  getShopDetailForUser,
} from '#/server/analytics.server.ts'
import { requireOrganizationContext } from '#/server/auth.server.ts'
import {
  deleteGoogleAnalyticsAppMapping,
  deleteGoogleAnalyticsConnection,
  getGoogleAnalyticsAppStoreReport,
  getGoogleAnalyticsSettings,
  saveGoogleAnalyticsAppMapping,
} from '#/server/google-analytics.server.ts'
import { enqueueSync } from '#/server/queue.server.ts'
import {
  addAppToConnection,
  saveConnectionWithApp,
  savePartnerConnection,
} from '#/server/sync.server.ts'

export function getCurrentUser() {
  return requireOrganizationContext().then((context) => context.user)
}

export function getCurrentOrganizationContext() {
  return requireOrganizationContext()
}

export function getUserAnalytics(args: {
  authOrganizationId: string
  appId?: string
  appIds?: string[]
  startDate?: string
  endDate?: string
}) {
  return getAnalyticsForUser(args)
}

export function getUserDashboardAnalytics(args: {
  authOrganizationId: string
  appIds?: string[]
  startDate?: string
  endDate?: string
}) {
  return getDashboardAnalyticsForUser(args)
}

export function getUserRevenueReport(args: {
  authOrganizationId: string
  appIds?: string[]
  startDate?: string
  endDate?: string
}) {
  return getRevenueReportForUser(args)
}

export function getUserCustomerReport(args: {
  authOrganizationId: string
  appIds?: string[]
  startDate?: string
  endDate?: string
}) {
  return getCustomerReportForUser(args)
}

export function getUserChurnReport(args: {
  authOrganizationId: string
  appIds?: string[]
  startDate?: string
  endDate?: string
  reason?: string
}) {
  return getChurnReportForUser(args)
}

export function getUserAppStoreAnalyticsReport(args: {
  authOrganizationId: string
  appIds?: string[]
  startDate?: string
  endDate?: string
}) {
  return getGoogleAnalyticsAppStoreReport(args)
}

export function getUserAppDetailAnalytics(args: {
  authOrganizationId: string
  appId: string
  startDate?: string
  endDate?: string
}) {
  return getAppDetailAnalyticsForUser(args)
}

export function getUserShopDetail(args: {
  authOrganizationId: string
  shopId: number
  startDate?: string
  endDate?: string
}) {
  return getShopDetailForUser(args)
}

export async function searchUserShops(args: {
  authOrganizationId: string
  query: string
}) {
  const query = args.query.trim().slice(0, 100)

  if (!query) return []

  const likeQuery = `%${query}%`
  const prefixQuery = `${query}%`
  const searchDocument = sql`to_tsvector('simple', concat_ws(' ', ${shops.myshopifyDomain}, coalesce(${shops.name}, ''), coalesce(${shops.shopifyShopId}, '')))`
  const searchQuery = sql`websearch_to_tsquery('simple', ${query})`
  const rank = sql<number>`
    case
      when lower(${shops.myshopifyDomain}) = lower(${query}) then 100
      when lower(coalesce(${shops.shopifyShopId}, '')) = lower(${query}) then 90
      when lower(coalesce(${shops.name}, '')) = lower(${query}) then 80
      when ${shops.myshopifyDomain} ilike ${prefixQuery} then 70
      when coalesce(${shops.name}, '') ilike ${prefixQuery} then 60
      when coalesce(${shops.shopifyShopId}, '') ilike ${prefixQuery} then 50
      else ts_rank_cd(${searchDocument}, ${searchQuery})
    end
  `

  const rows = await db
    .select({
      id: shops.id,
      shopDomain: shops.myshopifyDomain,
      shopName: shops.name,
      shopifyShopId: shops.shopifyShopId,
      rank,
    })
    .from(shops)
    .innerJoin(shopAppRelationships, eq(shopAppRelationships.shopId, shops.id))
    .innerJoin(partnerApps, eq(shopAppRelationships.appId, partnerApps.id))
    .innerJoin(
      partnerConnections,
      eq(partnerApps.connectionId, partnerConnections.id),
    )
    .where(
      and(
        eq(partnerConnections.authOrganizationId, args.authOrganizationId),
        sql`(
          ${searchDocument} @@ ${searchQuery}
          or ${shops.myshopifyDomain} ilike ${likeQuery}
          or coalesce(${shops.name}, '') ilike ${likeQuery}
          or coalesce(${shops.shopifyShopId}, '') ilike ${likeQuery}
        )`,
      ),
    )
    .orderBy(desc(rank), shops.myshopifyDomain)
    .limit(10)

  const seenShopIds = new Set<number>()

  return rows
    .filter((shop) => {
      if (seenShopIds.has(shop.id)) return false

      seenShopIds.add(shop.id)
      return true
    })
    .slice(0, 3)
    .map(({ rank: _rank, ...shop }) => shop)
}

export async function getUserSettings(args: { authOrganizationId: string }) {
  const connectionsQuery = db
    .select({
      id: partnerConnections.id,
      organizationId: partnerConnections.organizationId,
      name: partnerConnections.name,
      hasManageApps: partnerConnections.hasManageApps,
      hasViewFinancials: partnerConnections.hasViewFinancials,
      lastSyncedAt: partnerConnections.lastSyncedAt,
    })
    .from(partnerConnections)
    .where(eq(partnerConnections.authOrganizationId, args.authOrganizationId))
    .orderBy(desc(partnerConnections.createdAt))

  const appsQuery = db
    .select({
      id: partnerApps.id,
      name: partnerApps.name,
      partnerAppId: partnerApps.partnerAppId,
      apiKey: partnerApps.apiKey,
      isTest: partnerApps.isTest,
      connectionId: partnerApps.connectionId,
      connectionName: partnerConnections.name,
      organizationId: partnerConnections.organizationId,
      lastSyncedAt: partnerApps.lastSyncedAt,
    })
    .from(partnerApps)
    .innerJoin(
      partnerConnections,
      eq(partnerApps.connectionId, partnerConnections.id),
    )
    .where(eq(partnerConnections.authOrganizationId, args.authOrganizationId))
    .orderBy(desc(partnerApps.createdAt))

  const [connections, apps, googleAnalyticsSettings] = await Promise.all([
    connectionsQuery,
    appsQuery,
    getGoogleAnalyticsSettings({
      authOrganizationId: args.authOrganizationId,
    }),
  ])

  return {
    activeOrganizationId: args.authOrganizationId,
    connections: connections.map((connection) => ({
      ...connection,
      lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
    })),
    apps: apps.map((app) => ({
      ...app,
      lastSyncedAt: app.lastSyncedAt?.toISOString() ?? null,
    })),
    ...googleAnalyticsSettings,
  }
}

export async function setUserPartnerAppTestMode(args: {
  authOrganizationId: string
  appId: string
  isTest: boolean
}) {
  const app = (
    await db
      .select({ id: partnerApps.id })
      .from(partnerApps)
      .innerJoin(
        partnerConnections,
        eq(partnerApps.connectionId, partnerConnections.id),
      )
      .where(
        and(
          eq(partnerConnections.authOrganizationId, args.authOrganizationId),
          or(
            eq(partnerApps.id, args.appId),
            eq(partnerApps.partnerAppId, toPartnerAppGid(args.appId)),
          ),
        ),
      )
      .limit(1)
  ).at(0)

  if (!app) return null

  await db
    .update(partnerApps)
    .set({ isTest: args.isTest, updatedAt: new Date() })
    .where(eq(partnerApps.id, app.id))

  return { id: app.id, isTest: args.isTest }
}

export async function setUserShopTestMode(args: {
  authOrganizationId: string
  shopId: number
  isTest: boolean
}) {
  const shop = (
    await db
      .select({ id: shops.id })
      .from(shops)
      .innerJoin(
        shopAppRelationships,
        eq(shopAppRelationships.shopId, shops.id),
      )
      .innerJoin(partnerApps, eq(shopAppRelationships.appId, partnerApps.id))
      .innerJoin(
        partnerConnections,
        eq(partnerApps.connectionId, partnerConnections.id),
      )
      .where(
        and(
          eq(partnerConnections.authOrganizationId, args.authOrganizationId),
          eq(shops.id, args.shopId),
        ),
      )
      .limit(1)
  ).at(0)

  if (!shop) return null

  if (args.isTest) {
    await db
      .insert(testShops)
      .values({ authOrganizationId: args.authOrganizationId, shopId: shop.id })
      .onConflictDoUpdate({
        target: [testShops.authOrganizationId, testShops.shopId],
        set: { updatedAt: new Date() },
      })
  } else {
    await db
      .delete(testShops)
      .where(
        and(
          eq(testShops.authOrganizationId, args.authOrganizationId),
          eq(testShops.shopId, shop.id),
        ),
      )
  }

  return { shopId: shop.id, isTest: args.isTest }
}

export async function deleteUserPartnerApp(args: {
  authOrganizationId: string
  appId: string
}) {
  const app = (
    await db
      .select({ id: partnerApps.id, name: partnerApps.name })
      .from(partnerApps)
      .innerJoin(
        partnerConnections,
        eq(partnerApps.connectionId, partnerConnections.id),
      )
      .where(
        and(
          eq(partnerConnections.authOrganizationId, args.authOrganizationId),
          eq(partnerApps.id, args.appId),
        ),
      )
      .limit(1)
  ).at(0)

  if (!app) return null

  await db.transaction(async (tx) => {
    await tx.delete(syncRuns).where(eq(syncRuns.appId, app.id))
    await tx.delete(partnerApps).where(eq(partnerApps.id, app.id))
  })

  return app
}

export async function deleteUserPartnerConnection(args: {
  authOrganizationId: string
  connectionId: number
}) {
  const connection = (
    await db
      .select({ id: partnerConnections.id, name: partnerConnections.name })
      .from(partnerConnections)
      .where(
        and(
          eq(partnerConnections.authOrganizationId, args.authOrganizationId),
          eq(partnerConnections.id, args.connectionId),
        ),
      )
      .limit(1)
  ).at(0)

  if (!connection) return null

  await db.transaction(async (tx) => {
    await tx.delete(syncRuns).where(eq(syncRuns.connectionId, connection.id))
    await tx
      .delete(partnerConnections)
      .where(eq(partnerConnections.id, connection.id))
  })

  return connection
}

export function saveUserPartnerConnection(args: {
  userId: string
  authOrganizationId: string
  organizationId: string
  token: string
  name: string
}) {
  return savePartnerConnection(args)
}

export async function saveUserPartnerApp(
  args:
    | {
        mode: 'existing'
        userId: string
        authOrganizationId: string
        connectionId: number
        partnerAppId: string
      }
    | {
        mode: 'new'
        userId: string
        authOrganizationId: string
        organizationId: string
        token: string
        partnerAppId: string
        name: string
      },
) {
  const partnerAppId = toPartnerAppGid(args.partnerAppId)
  const result =
    args.mode === 'existing'
      ? await addAppToConnection({ ...args, partnerAppId })
      : await saveConnectionWithApp({ ...args, partnerAppId })

  await enqueueSync({
    userId: args.userId,
    authOrganizationId: args.authOrganizationId,
    appId: result.app.id,
    reason: 'connection',
  })

  return result
}

export function enqueueUserSyncJob(args: {
  userId: string
  authOrganizationId: string
  appId?: string
}) {
  return enqueueSync({ ...args, reason: 'manual' })
}

export function saveUserGoogleAnalyticsAppMapping(args: {
  authOrganizationId: string
  connectionId: number
  appId: string
  apiKey: string
}) {
  return saveGoogleAnalyticsAppMapping(args)
}

export function deleteUserGoogleAnalyticsAppMapping(args: {
  authOrganizationId: string
  mappingId: number
}) {
  return deleteGoogleAnalyticsAppMapping(args)
}

export function deleteUserGoogleAnalyticsConnection(args: {
  authOrganizationId: string
  connectionId: number
}) {
  return deleteGoogleAnalyticsConnection(args)
}
