import { createHash, randomUUID } from 'node:crypto'
import { and, desc, eq, isNotNull, isNull, lte, or, sql } from 'drizzle-orm'
import { db, pool } from '#/db/index.server.ts'
import {
  appEvents,
  appSubscriptions,
  financialTransactions,
  partnerApps,
  partnerConnections,
  shopAppRelationships,
  shops,
  syncRuns,
  uninstallFeedback,
} from '#/db/schema.ts'
import { decryptSecret, encryptSecret } from '#/lib/crypto.ts'
import { addWideLogContext } from '#/lib/logging.server.ts'
import {
  fetchPartnerApp,
  fetchPartnerAppEvents,
  fetchPartnerTransactions,
  normalizeStoredPartnerAppEventPayload,
  normalizeStoredPartnerTransactionPayload,
  validatePartnerCredentials,
} from '#/server/shopify-partner.server.ts'
import {
  classifyRelationshipEvent,
  classifySubscriptionEvent,
  isPartnerUninstallEvent,
  normalizePartnerAppEventType,
  normalizePartnerAppPricingInterval,
  normalizePartnerTransactionType,
  SHOPIFY_PARTNER_APP_EVENT,
  SHOPIFY_PARTNER_TRANSACTION_TYPE,
} from '#/server/partner-event-classification.server.ts'
import type {
  PartnerAppNode,
  PartnerAppEventNode,
  PartnerShop,
  PartnerTransactionNode,
} from '#/server/shopify-partner.server.ts'
import {
  enqueueSyncBatch,
  SYNC_INTERVAL_MINUTES,
} from '#/server/queue.server.ts'
import type { SyncJobData } from '#/server/queue.server.ts'

const DAY = 24 * 60 * 60 * 1000
const SYNC_LEASE_TTL_MS = 6 * 60 * 60 * 1000

function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
}

function hash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function eventKey(appId: string, event: PartnerAppEventNode) {
  return hash({
    appId,
    type: normalizePartnerAppEventType(event.type) ?? event.type,
    occurredAt: event.occurredAt,
    shop: event.shop?.myshopifyDomain ?? event.shop?.id ?? null,
    charge: event.charge?.id ?? null,
    amount: event.charge?.amount?.amount ?? null,
  })
}

function tenantAppId(connectionId: number, partnerAppId: string) {
  const digest = createHash('sha256')
    .update(partnerAppId)
    .digest('hex')
    .slice(0, 16)

  return `app_${connectionId}_${digest}`
}

function windowStart(lastSyncedAt: Date | null) {
  if (lastSyncedAt) return new Date(lastSyncedAt.getTime() - DAY)
  return new Date(Date.now() - 365 * DAY)
}

async function acquireAppSyncLease(appId: string, owner: string) {
  const key = `sync-app:${appId}`
  const expiresAt = new Date(Date.now() + SYNC_LEASE_TTL_MS)
  const result = await pool.query<{ key: string }>(
    `
      insert into sync_leases (key, owner, expires_at, created_at, updated_at)
      values ($1, $2, $3, now(), now())
      on conflict (key) do update set
        owner = excluded.owner,
        expires_at = excluded.expires_at,
        updated_at = now()
      where sync_leases.expires_at <= now()
      returning key
    `,
    [key, owner, expiresAt],
  )

  if (!result.rows.length) return null

  return {
    release: async () => {
      await pool.query(
        'delete from sync_leases where key = $1 and owner = $2',
        [key, owner],
      )
    },
  }
}

function latestDate(...values: Array<Date | null | undefined>) {
  return values.reduce<Date | null>((latest, value) => {
    if (!value) return latest
    if (!latest || value > latest) return value
    return latest
  }, null)
}

function shouldApplyState(occurredAt: Date, currentLatestAt: Date | null) {
  return !currentLatestAt || occurredAt >= currentLatestAt
}

function amountsMatch(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  const leftAmount = Number(left ?? 0)
  const rightAmount = Number(right ?? 0)

  return Math.abs(leftAmount - rightAmount) < 0.01
}

async function upsertPartnerShops(
  partnerShops: Array<PartnerShop | null | undefined>,
) {
  const uniqueShops = [
    ...new Map(
      partnerShops
        .filter((shop): shop is PartnerShop => Boolean(shop?.myshopifyDomain))
        .map((shop) => [shop.myshopifyDomain, shop]),
    ).values(),
  ]

  if (!uniqueShops.length) return new Map<string, typeof shops.$inferSelect>()

  const rows = await db
    .insert(shops)
    .values(
      uniqueShops.map((shop) => ({
        shopifyShopId: shop.id,
        myshopifyDomain: shop.myshopifyDomain,
        name: shop.name,
      })),
    )
    .onConflictDoUpdate({
      target: shops.myshopifyDomain,
      set: {
        shopifyShopId: sql.raw(`excluded.${shops.shopifyShopId.name}`),
        name: sql.raw(`excluded.${shops.name.name}`),
        updatedAt: new Date(),
      },
    })
    .returning()

  return new Map(rows.map((row) => [row.myshopifyDomain, row]))
}

function findSavedShop(
  savedShops: Map<string, typeof shops.$inferSelect>,
  partnerShop: PartnerShop | null | undefined,
) {
  if (!partnerShop?.myshopifyDomain) return null

  return savedShops.get(partnerShop.myshopifyDomain) ?? null
}

async function updateRelationship(
  appId: string,
  shopId: number,
  event: PartnerAppEventNode,
) {
  const classification = classifyRelationshipEvent(event.type)
  const occurredAt = new Date(event.occurredAt)

  if (!classification) return

  const existing = (
    await db
      .select({
        id: shopAppRelationships.id,
        installedAt: shopAppRelationships.installedAt,
        uninstalledAt: shopAppRelationships.uninstalledAt,
        reactivatedAt: shopAppRelationships.reactivatedAt,
        deactivatedAt: shopAppRelationships.deactivatedAt,
      })
      .from(shopAppRelationships)
      .where(
        and(
          eq(shopAppRelationships.appId, appId),
          eq(shopAppRelationships.shopId, shopId),
        ),
      )
      .limit(1)
  ).at(0)

  if (!existing) {
    await db
      .insert(shopAppRelationships)
      .values({
        appId,
        shopId,
        status: classification.status,
        installedAt: classification.isInstalled ? occurredAt : null,
        uninstalledAt: classification.isUninstalled ? occurredAt : null,
        reactivatedAt: classification.isReactivated ? occurredAt : null,
        deactivatedAt: classification.isDeactivated ? occurredAt : null,
      })
      .onConflictDoNothing()

    return
  }

  const set: Partial<typeof shopAppRelationships.$inferInsert> = {
    updatedAt: new Date(),
  }

  if (
    shouldApplyState(
      occurredAt,
      latestDate(
        existing.installedAt,
        existing.uninstalledAt,
        existing.reactivatedAt,
        existing.deactivatedAt,
      ),
    )
  ) {
    set.status = classification.status
  }

  if (
    classification.isInstalled &&
    (!existing.installedAt || occurredAt > existing.installedAt)
  ) {
    set.installedAt = occurredAt
  }

  if (
    classification.isUninstalled &&
    (!existing.uninstalledAt || occurredAt > existing.uninstalledAt)
  ) {
    set.uninstalledAt = occurredAt
  }

  if (
    classification.isReactivated &&
    (!existing.reactivatedAt || occurredAt > existing.reactivatedAt)
  ) {
    set.reactivatedAt = occurredAt
  }

  if (
    classification.isDeactivated &&
    (!existing.deactivatedAt || occurredAt > existing.deactivatedAt)
  ) {
    set.deactivatedAt = occurredAt
  }

  await db
    .update(shopAppRelationships)
    .set(set)
    .where(eq(shopAppRelationships.id, existing.id))
}

async function updateSubscription(
  appId: string,
  shopId: number,
  event: PartnerAppEventNode,
) {
  if (!event.charge?.id) return

  const status = classifySubscriptionEvent(event.type)

  if (!status) return

  const occurredAt = new Date(event.occurredAt)
  const amount = event.charge.amount?.amount ?? '0'
  const isTest = event.charge.test ?? false

  const existing = (
    await db
      .select({
        id: appSubscriptions.id,
        acceptedAt: appSubscriptions.acceptedAt,
        activatedAt: appSubscriptions.activatedAt,
        canceledAt: appSubscriptions.canceledAt,
      })
      .from(appSubscriptions)
      .where(
        and(
          eq(appSubscriptions.appId, appId),
          eq(appSubscriptions.shopId, shopId),
          eq(appSubscriptions.chargeId, event.charge.id),
        ),
      )
      .limit(1)
  ).at(0)

  if (!existing) {
    await db
      .insert(appSubscriptions)
      .values({
        appId,
        shopId,
        chargeId: event.charge.id,
        name: event.charge.name,
        status,
        isTest,
        mrrAmount: amount,
        currencyCode: event.charge.amount?.currencyCode,
        acceptedAt: status === 'accepted' ? occurredAt : null,
        activatedAt: status === 'active' ? occurredAt : null,
        canceledAt: status === 'canceled' ? occurredAt : null,
      })
      .onConflictDoNothing()

    return
  }

  const set: Partial<typeof appSubscriptions.$inferInsert> = {
    name: event.charge.name,
    isTest,
    mrrAmount: amount,
    currencyCode: event.charge.amount?.currencyCode,
    updatedAt: new Date(),
  }

  if (
    shouldApplyState(
      occurredAt,
      latestDate(
        existing.acceptedAt,
        existing.activatedAt,
        existing.canceledAt,
      ),
    )
  ) {
    set.status = status
  }

  if (
    status === 'accepted' &&
    (!existing.acceptedAt || occurredAt > existing.acceptedAt)
  ) {
    set.acceptedAt = occurredAt
  }

  if (
    status === 'active' &&
    (!existing.activatedAt || occurredAt > existing.activatedAt)
  ) {
    set.activatedAt = occurredAt
  }

  if (
    status === 'canceled' &&
    (!existing.canceledAt || occurredAt > existing.canceledAt)
  ) {
    set.canceledAt = occurredAt
  }

  await db
    .update(appSubscriptions)
    .set(set)
    .where(eq(appSubscriptions.id, existing.id))
}

async function updateSubscriptionIntervalFromTransaction(args: {
  appId: string
  shopId: number | null | undefined
  transaction: PartnerTransactionNode
}) {
  if (
    normalizePartnerTransactionType(args.transaction.__typename) !==
      SHOPIFY_PARTNER_TRANSACTION_TYPE.APP_SUBSCRIPTION_SALE ||
    !args.transaction.chargeId ||
    !args.transaction.billingInterval ||
    !args.shopId
  ) {
    return
  }

  const interval = normalizePartnerAppPricingInterval(
    args.transaction.billingInterval,
  )

  if (!interval) return

  await db
    .update(appSubscriptions)
    .set({
      interval,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(appSubscriptions.appId, args.appId),
        eq(appSubscriptions.shopId, args.shopId),
        eq(appSubscriptions.chargeId, args.transaction.chargeId),
      ),
    )
}

export async function rebuildAppStateFromRawData(appId: string) {
  const eventRows = await db
    .select({
      shopId: appEvents.shopId,
      type: appEvents.type,
      occurredAt: appEvents.occurredAt,
      rawPayload: appEvents.rawPayload,
    })
    .from(appEvents)
    .where(eq(appEvents.appId, appId))
    .orderBy(appEvents.occurredAt)

  const relationshipState = new Map<
    number,
    {
      status: string
      installedAt: Date | null
      uninstalledAt: Date | null
      reactivatedAt: Date | null
      deactivatedAt: Date | null
    }
  >()

  const subscriptionState = new Map<
    string,
    {
      shopId: number
      chargeId: string
      name: string | null | undefined
      interval: string | null
      status: string
      isTest: boolean
      mrrAmount: string
      currencyCode: string | null | undefined
      acceptedAt: Date | null
      activatedAt: Date | null
      canceledAt: Date | null
    }
  >()

  for (const row of eventRows) {
    if (!row.shopId) continue

    const occurredAt = row.occurredAt
    const nextRelationship = classifyRelationshipEvent(row.type)

    if (nextRelationship) {
      const current = relationshipState.get(row.shopId) ?? {
        status: nextRelationship.status,
        installedAt: null,
        uninstalledAt: null,
        reactivatedAt: null,
        deactivatedAt: null,
      }

      current.status = nextRelationship.status

      if (nextRelationship.isInstalled) current.installedAt = occurredAt
      if (nextRelationship.isUninstalled) current.uninstalledAt = occurredAt
      if (nextRelationship.isReactivated) current.reactivatedAt = occurredAt
      if (nextRelationship.isDeactivated) current.deactivatedAt = occurredAt

      relationshipState.set(row.shopId, current)
    }

    const nextSubscriptionStatus = classifySubscriptionEvent(row.type)

    if (!nextSubscriptionStatus) continue

    const rawEvent = normalizeStoredPartnerAppEventPayload(row.rawPayload)
    const charge = rawEvent.charge
    if (!charge?.id) continue

    const key = `${row.shopId}\0${charge.id}`
    const current = subscriptionState.get(key) ?? {
      shopId: row.shopId,
      chargeId: charge.id,
      name: charge.name,
      interval: null,
      status: nextSubscriptionStatus,
      isTest: charge.test ?? false,
      mrrAmount: charge.amount?.amount ?? '0',
      currencyCode: charge.amount?.currencyCode,
      acceptedAt: null,
      activatedAt: null,
      canceledAt: null,
    }

    current.name = charge.name
    current.status = nextSubscriptionStatus
    current.isTest = charge.test ?? current.isTest
    current.mrrAmount = charge.amount?.amount ?? current.mrrAmount
    current.currencyCode = charge.amount?.currencyCode ?? current.currencyCode

    if (nextSubscriptionStatus === 'accepted') current.acceptedAt = occurredAt
    if (nextSubscriptionStatus === 'active') current.activatedAt = occurredAt
    if (nextSubscriptionStatus === 'canceled') current.canceledAt = occurredAt

    subscriptionState.set(key, current)
  }

  const transactionRows = await db
    .select({
      shopId: financialTransactions.shopId,
      chargeId: financialTransactions.chargeId,
      transactionType: financialTransactions.transactionType,
      rawPayload: financialTransactions.rawPayload,
      grossAmount: financialTransactions.grossAmount,
      createdAt: financialTransactions.createdAt,
    })
    .from(financialTransactions)
    .where(eq(financialTransactions.appId, appId))
    .orderBy(financialTransactions.createdAt)

  for (const row of transactionRows) {
    if (
      normalizePartnerTransactionType(row.transactionType) !==
        SHOPIFY_PARTNER_TRANSACTION_TYPE.APP_SUBSCRIPTION_SALE ||
      !row.shopId ||
      !row.chargeId
    ) {
      continue
    }

    const rawTransaction = normalizeStoredPartnerTransactionPayload(
      row.rawPayload,
    )
    const interval = normalizePartnerAppPricingInterval(
      rawTransaction.billingInterval,
    )
    if (!interval) continue

    const subscription = subscriptionState.get(`${row.shopId}\0${row.chargeId}`)
    if (!subscription) continue

    subscription.interval = interval

    const hasFullSaleAfterCancellation =
      subscription.status === 'canceled' &&
      subscription.canceledAt !== null &&
      row.createdAt > subscription.canceledAt &&
      amountsMatch(row.grossAmount, subscription.mrrAmount)

    // A full subscription sale after a cancel event is stronger billing
    // evidence than event order; prorated sales are not recurring amount.
    if (hasFullSaleAfterCancellation) subscription.status = 'active'
  }

  for (const [shopId, state] of relationshipState) {
    await db
      .insert(shopAppRelationships)
      .values({ appId, shopId, ...state })
      .onConflictDoUpdate({
        target: [shopAppRelationships.appId, shopAppRelationships.shopId],
        set: { ...state, updatedAt: new Date() },
      })
  }

  for (const subscription of subscriptionState.values()) {
    await db
      .insert(appSubscriptions)
      .values({
        appId,
        shopId: subscription.shopId,
        chargeId: subscription.chargeId,
        name: subscription.name,
        interval: subscription.interval,
        status: subscription.status,
        isTest: subscription.isTest,
        mrrAmount: subscription.mrrAmount,
        currencyCode: subscription.currencyCode,
        acceptedAt: subscription.acceptedAt,
        activatedAt: subscription.activatedAt,
        canceledAt: subscription.canceledAt,
      })
      .onConflictDoUpdate({
        target: [
          appSubscriptions.appId,
          appSubscriptions.shopId,
          appSubscriptions.chargeId,
        ],
        set: {
          name: subscription.name,
          interval: subscription.interval,
          status: subscription.status,
          isTest: subscription.isTest,
          mrrAmount: subscription.mrrAmount,
          currencyCode: subscription.currencyCode,
          acceptedAt: subscription.acceptedAt,
          activatedAt: subscription.activatedAt,
          canceledAt: subscription.canceledAt,
          updatedAt: new Date(),
        },
      })
  }
}

async function recordPartnerUninstallFeedback(
  appId: string,
  shopId: number,
  event: Pick<
    PartnerAppEventNode,
    'type' | 'occurredAt' | 'reason' | 'description'
  >,
) {
  if (!isPartnerUninstallEvent(event.type)) return

  const reason = event.reason?.trim()
  const description = event.description?.trim()

  if (!reason && !description) return

  const occurredAt = new Date(event.occurredAt)

  await db
    .insert(uninstallFeedback)
    .values({
      appId,
      shopId,
      reason: reason ?? 'Unspecified',
      description,
      occurredAt,
    })
    .onConflictDoNothing({
      target: [
        uninstallFeedback.appId,
        uninstallFeedback.shopId,
        uninstallFeedback.occurredAt,
        uninstallFeedback.reason,
      ],
      where: sql`${uninstallFeedback.shopId} is not null`,
    })
}

async function backfillPartnerUninstallFeedback(appId: string) {
  const rows = await db
    .select({
      shopId: appEvents.shopId,
      type: appEvents.type,
      occurredAt: appEvents.occurredAt,
      rawPayload: appEvents.rawPayload,
    })
    .from(appEvents)
    .where(
      and(
        eq(appEvents.appId, appId),
        eq(appEvents.type, SHOPIFY_PARTNER_APP_EVENT.RELATIONSHIP_UNINSTALLED),
      ),
    )

  for (const row of rows) {
    if (!row.shopId) continue

    const raw = normalizeStoredPartnerAppEventPayload(row.rawPayload)

    await recordPartnerUninstallFeedback(appId, row.shopId, {
      type: raw.type ?? row.type,
      occurredAt: raw.occurredAt ?? row.occurredAt.toISOString(),
      reason: raw.reason,
      description: raw.description,
    })
  }
}

export async function repairAppStateFromRawData(appId: string) {
  await backfillPartnerUninstallFeedback(appId)
  await rebuildAppStateFromRawData(appId)
}

async function insertEventPage(args: {
  connectionId: number
  appId: string
  events: PartnerAppEventNode[]
}) {
  const savedShops = await upsertPartnerShops(
    args.events.map((event) => event.shop),
  )
  const eventValues = args.events.map((event) => {
    const shop = findSavedShop(savedShops, event.shop)
    const type = normalizePartnerAppEventType(event.type) ?? event.type

    return {
      connectionId: args.connectionId,
      appId: args.appId,
      shopId: shop?.id,
      partnerEventId: eventKey(args.appId, event),
      type,
      occurredAt: new Date(event.occurredAt),
      amount: event.charge?.amount?.amount,
      currencyCode: event.charge?.amount?.currencyCode,
      rawPayload: toJson(event),
    }
  })

  if (eventValues.length) {
    await db.insert(appEvents).values(eventValues).onConflictDoNothing()
  }

  for (const event of args.events) {
    const shop = findSavedShop(savedShops, event.shop)

    if (shop) {
      await updateRelationship(args.appId, shop.id, event)
      await updateSubscription(args.appId, shop.id, event)
      await recordPartnerUninstallFeedback(args.appId, shop.id, event)
    }
  }
}

async function insertTransactionPage(args: {
  connectionId: number
  appId: string
  transactions: PartnerTransactionNode[]
}) {
  const savedShops = await upsertPartnerShops(
    args.transactions.map((transaction) => transaction.shop),
  )
  const transactionValues = args.transactions.map((transaction) => {
    const shop = findSavedShop(savedShops, transaction.shop)

    return {
      connectionId: args.connectionId,
      appId: args.appId,
      shopId: shop?.id,
      partnerTransactionId: transaction.id,
      transactionType:
        normalizePartnerTransactionType(transaction.__typename) ??
        transaction.__typename,
      chargeId: transaction.chargeId,
      createdAt: new Date(transaction.createdAt),
      grossAmount: transaction.grossAmount?.amount,
      netAmount: transaction.netAmount?.amount,
      currencyCode:
        transaction.netAmount?.currencyCode ??
        transaction.grossAmount?.currencyCode,
      rawPayload: toJson(transaction),
    }
  })

  if (transactionValues.length) {
    await db
      .insert(financialTransactions)
      .values(transactionValues)
      .onConflictDoNothing()
  }

  for (const transaction of args.transactions) {
    const shop = findSavedShop(savedShops, transaction.shop)

    await updateSubscriptionIntervalFromTransaction({
      appId: args.appId,
      shopId: shop?.id,
      transaction,
    })
  }
}

export async function savePartnerConnection(args: {
  userId: string
  authOrganizationId: string
  organizationId: string
  token: string
  name: string
}) {
  await validatePartnerCredentials({
    organizationId: args.organizationId,
    token: args.token,
  })

  return upsertPartnerConnection(args)
}

async function upsertPartnerConnection(args: {
  userId: string
  authOrganizationId: string
  organizationId: string
  token: string
  name: string
}) {
  const name = args.name.trim() || `Partner org ${args.organizationId}`

  const [connection] = await db
    .insert(partnerConnections)
    .values({
      userId: args.userId,
      authOrganizationId: args.authOrganizationId,
      organizationId: args.organizationId,
      name,
      encryptedToken: encryptSecret(args.token),
    })
    .onConflictDoUpdate({
      target: [
        partnerConnections.authOrganizationId,
        partnerConnections.organizationId,
      ],
      set: {
        userId: args.userId,
        name,
        encryptedToken: encryptSecret(args.token),
        updatedAt: new Date(),
      },
    })
    .returning()

  return connection
}

async function savePartnerAppForConnection(args: {
  connection: typeof partnerConnections.$inferSelect
  app: PartnerAppNode
}) {
  const [savedApp] = await db
    .insert(partnerApps)
    .values({
      id: tenantAppId(args.connection.id, args.app.id),
      connectionId: args.connection.id,
      partnerAppId: args.app.id,
      apiKey: args.app.apiKey,
      name: args.app.name,
    })
    .onConflictDoUpdate({
      target: [partnerApps.connectionId, partnerApps.partnerAppId],
      set: {
        apiKey: args.app.apiKey,
        name: args.app.name,
        updatedAt: new Date(),
      },
    })
    .returning()

  await db
    .update(partnerConnections)
    .set({ hasManageApps: true, updatedAt: new Date() })
    .where(eq(partnerConnections.id, args.connection.id))

  return { connection: args.connection, app: savedApp }
}

export async function addAppToConnection(args: {
  userId: string
  authOrganizationId: string
  connectionId: number
  partnerAppId: string
}) {
  const connection = (
    await db
      .select()
      .from(partnerConnections)
      .where(
        and(
          eq(partnerConnections.authOrganizationId, args.authOrganizationId),
          eq(partnerConnections.id, args.connectionId),
        ),
      )
      .limit(1)
  ).at(0)

  if (!connection) throw new Error('Connection not found')

  const token = decryptSecret(connection.encryptedToken)
  const app = await fetchPartnerApp({
    organizationId: connection.organizationId,
    token,
    appId: args.partnerAppId,
  })

  return savePartnerAppForConnection({ connection, app })
}

export async function saveConnectionWithApp(args: {
  userId: string
  authOrganizationId: string
  organizationId: string
  token: string
  partnerAppId: string
  name: string
}) {
  const app = await fetchPartnerApp({
    organizationId: args.organizationId,
    token: args.token,
    appId: args.partnerAppId,
  })
  const connection = await upsertPartnerConnection(args)

  return savePartnerAppForConnection({ connection, app })
}

export async function syncApp(args: {
  connection: typeof partnerConnections.$inferSelect
  app: typeof partnerApps.$inferSelect
  jobId?: string
}) {
  const lease = await acquireAppSyncLease(
    args.app.id,
    `${args.jobId ?? 'sync'}:${randomUUID()}`,
  )
  const start = windowStart(args.app.lastSyncedAt)
  const end = new Date()

  if (!lease) {
    await db.insert(syncRuns).values({
      connectionId: args.connection.id,
      appId: args.app.id,
      jobId: args.jobId,
      jobType: 'partner_sync',
      status: 'skipped',
      windowStart: start,
      windowEnd: end,
      error: 'Sync already running for this app',
      finishedAt: new Date(),
    })

    return {
      status: 'skipped' as const,
      eventsCount: 0,
      transactionsCount: 0,
    }
  }

  let run: typeof syncRuns.$inferSelect | undefined
  let eventsCount = 0
  let transactionsCount = 0

  try {
    const token = decryptSecret(args.connection.encryptedToken)
    ;[run] = await db
      .insert(syncRuns)
      .values({
        connectionId: args.connection.id,
        appId: args.app.id,
        jobId: args.jobId,
        jobType: 'partner_sync',
        status: 'running',
        windowStart: start,
        windowEnd: end,
      })
      .returning()

    let eventsCursor: string | null = null
    do {
      const page = await fetchPartnerAppEvents({
        organizationId: args.connection.organizationId,
        token,
        appId: args.app.partnerAppId,
        after: eventsCursor,
        occurredAtMin: start.toISOString(),
        occurredAtMax: end.toISOString(),
      })

      await insertEventPage({
        connectionId: args.connection.id,
        appId: args.app.id,
        events: page.edges.map((edge) => edge.node),
      })

      eventsCount += page.edges.length
      eventsCursor = page.pageInfo.hasNextPage
        ? (page.edges.at(-1)?.cursor ?? null)
        : null
    } while (eventsCursor)

    let transactionsCursor: string | null = null
    do {
      const page = await fetchPartnerTransactions({
        organizationId: args.connection.organizationId,
        token,
        appId: args.app.partnerAppId,
        after: transactionsCursor,
        createdAtMin: start.toISOString(),
        createdAtMax: end.toISOString(),
      })

      await insertTransactionPage({
        connectionId: args.connection.id,
        appId: args.app.id,
        transactions: page.edges.map((edge) => edge.node),
      })

      transactionsCount += page.edges.length
      transactionsCursor = page.pageInfo.hasNextPage
        ? (page.edges.at(-1)?.cursor ?? null)
        : null
    } while (transactionsCursor)

    await db
      .update(syncRuns)
      .set({
        status: 'success',
        eventsCount,
        transactionsCount,
        finishedAt: new Date(),
      })
      .where(eq(syncRuns.id, run.id))

    await db
      .update(partnerApps)
      .set({
        lastSyncedAt: end,
        updatedAt: new Date(),
      })
      .where(eq(partnerApps.id, args.app.id))

    await db
      .update(partnerConnections)
      .set({
        hasViewFinancials: true,
        updatedAt: new Date(),
      })
      .where(eq(partnerConnections.id, args.connection.id))

    return {
      status: 'success' as const,
      eventsCount,
      transactionsCount,
    }
  } catch (error) {
    if (run) {
      await db
        .update(syncRuns)
        .set({
          status: 'failed',
          eventsCount,
          transactionsCount,
          error: error instanceof Error ? error.message : 'Unknown sync error',
          finishedAt: new Date(),
        })
        .where(eq(syncRuns.id, run.id))
    }

    throw error
  } finally {
    await lease.release()
  }
}

export async function runSyncJob(data: SyncJobData, jobId?: string) {
  let syncConnectionsCount = 0
  let syncAppsCount = 0
  let syncAppsSyncedCount = 0
  let syncAppsSkippedCount = 0
  let partnerEventsCount = 0
  let financialTransactionsCount = 0

  function updateSyncLogContext() {
    addWideLogContext({
      sync_connections_count: syncConnectionsCount,
      sync_apps_count: syncAppsCount,
      sync_apps_synced_count: syncAppsSyncedCount,
      sync_apps_skipped_count: syncAppsSkippedCount,
      partner_events_count: partnerEventsCount,
      financial_transactions_count: financialTransactionsCount,
    })
  }

  addWideLogContext({
    sync_reason: data.reason,
    sync_target_user_id: data.userId,
    sync_target_organization_id: data.authOrganizationId,
    sync_target_connection_id: data.connectionId,
    sync_target_app_id: data.appId,
  })

  const connectionConditions = []
  if (data.authOrganizationId) {
    connectionConditions.push(
      eq(partnerConnections.authOrganizationId, data.authOrganizationId),
    )
  } else if (data.userId) {
    connectionConditions.push(eq(partnerConnections.userId, data.userId))
  }
  if (data.connectionId) {
    connectionConditions.push(eq(partnerConnections.id, data.connectionId))
  }

  const connections = await db
    .select()
    .from(partnerConnections)
    .where(
      connectionConditions.length === 1
        ? connectionConditions[0]
        : connectionConditions.length > 1
          ? and(...connectionConditions)
          : undefined,
    )

  syncConnectionsCount = connections.length
  updateSyncLogContext()

  for (const connection of connections) {
    const appConditions = [eq(partnerApps.connectionId, connection.id)]
    if (data.appId) appConditions.push(eq(partnerApps.id, data.appId))

    const apps = await db
      .select()
      .from(partnerApps)
      .where(and(...appConditions))
      .orderBy(desc(partnerApps.createdAt))

    syncAppsCount += apps.length
    updateSyncLogContext()

    for (const app of apps) {
      const result = await syncApp({ connection, app, jobId })

      if (result.status === 'success') {
        syncAppsSyncedCount += 1
      } else {
        syncAppsSkippedCount += 1
      }

      partnerEventsCount += result.eventsCount
      financialTransactionsCount += result.transactionsCount
      updateSyncLogContext()
    }

    const latestAppSync = (
      await db
        .select({ lastSyncedAt: partnerApps.lastSyncedAt })
        .from(partnerApps)
        .where(
          and(
            eq(partnerApps.connectionId, connection.id),
            isNotNull(partnerApps.lastSyncedAt),
          ),
        )
        .orderBy(desc(partnerApps.lastSyncedAt))
        .limit(1)
    ).at(0)

    if (latestAppSync) {
      await db
        .update(partnerConnections)
        .set({
          lastSyncedAt: latestAppSync.lastSyncedAt,
          updatedAt: new Date(),
        })
        .where(eq(partnerConnections.id, connection.id))
    }
  }
}

export async function enqueueDueScheduledSyncs() {
  const cutoff = new Date(Date.now() - SYNC_INTERVAL_MINUTES * 60 * 1000)
  const dueApps = await db
    .select({
      authOrganizationId: partnerConnections.authOrganizationId,
      connectionId: partnerConnections.id,
      appId: partnerApps.id,
    })
    .from(partnerApps)
    .innerJoin(
      partnerConnections,
      eq(partnerApps.connectionId, partnerConnections.id),
    )
    .where(
      or(
        isNull(partnerApps.lastSyncedAt),
        lte(partnerApps.lastSyncedAt, cutoff),
      ),
    )
    .orderBy(desc(partnerApps.lastSyncedAt))

  return enqueueSyncBatch(
    dueApps.map((app) => ({
      authOrganizationId: app.authOrganizationId,
      connectionId: app.connectionId,
      appId: app.appId,
      reason: 'scheduled',
    })),
  )
}
