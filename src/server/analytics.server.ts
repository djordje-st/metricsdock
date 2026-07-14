import { and, desc, eq, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { db } from '#/db/index.server.ts'
import {
  appEvents,
  appSubscriptions,
  financialTransactions,
  partnerApps,
  partnerConnections,
  shopAppRelationships,
  shops,
  syncRuns,
  testShops,
  uninstallFeedback,
} from '#/db/schema.ts'
import {
  getDateRangeBounds,
  normalizeDateRangeSearch,
} from '#/lib/date-range.ts'
import { countByDate, rankedByValue, sumByGroup } from '#/lib/chart-data.ts'
import { formatCurrency } from '#/lib/format.ts'
import { toPartnerAppGid } from '#/lib/shopify-id.ts'
import { normalizeUninstallReasons } from '#/lib/uninstall-reasons.ts'
import {
  buildMrrMovementBridge,
  computeChurnRates,
} from '#/server/analytics-reducers.ts'
import type { MrrBridgeEvent } from '#/server/analytics-reducers.ts'
import {
  classifyRelationshipEvent,
  intervalKind,
  isUsageTransaction,
  monthlyRecurringAmount,
  normalizePartnerAppEventType,
  normalizePartnerTransactionType,
  SHOPIFY_PARTNER_APP_EVENT,
} from '#/server/partner-event-classification.server.ts'
import { normalizeStoredPartnerAppEventPayload } from '#/server/shopify-partner.server.ts'

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function increment(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount)
}

const REPORT_MONTH_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000
type DateSeriesPoint = { date: string; value: number }

const relationshipEventTypes = [
  SHOPIFY_PARTNER_APP_EVENT.RELATIONSHIP_DEACTIVATED,
  SHOPIFY_PARTNER_APP_EVENT.RELATIONSHIP_INSTALLED,
  SHOPIFY_PARTNER_APP_EVENT.RELATIONSHIP_REACTIVATED,
  SHOPIFY_PARTNER_APP_EVENT.RELATIONSHIP_UNINSTALLED,
]
const mrrEventTypes = [
  SHOPIFY_PARTNER_APP_EVENT.SUBSCRIPTION_CHARGE_ACCEPTED,
  SHOPIFY_PARTNER_APP_EVENT.SUBSCRIPTION_CHARGE_ACTIVATED,
  SHOPIFY_PARTNER_APP_EVENT.SUBSCRIPTION_CHARGE_CANCELED,
]

function toSeries(map: Map<string, number>) {
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }))
}

function incrementField(
  map: Map<string, Record<string, number | string>>,
  date: string,
  key: string,
) {
  const row = map.get(date) ?? { date }
  row[key] = Number(row[key] ?? 0) + 1
  map.set(date, row)
}

function toFieldSeries(map: Map<string, Record<string, number | string>>) {
  return [...map.values()]
    .map((row) => ({ ...row, date: String(row.date) }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

function num(value: string | null | undefined) {
  return Number(value ?? 0)
}

function isActiveSubscription(status: string) {
  return status.toLowerCase() === 'active'
}

function isTrialSubscription(status: string) {
  return status.toLowerCase() === 'accepted'
}

function toIso(value: Date | null) {
  return value?.toISOString() ?? null
}

function amountLabel(
  amount: string | null | undefined,
  currencyCode: string | null | undefined,
) {
  if (!amount) return null

  return formatCurrency(amount, { currency: currencyCode })
}

function readCurrencyCode(value: string | null | undefined) {
  return value?.trim() || null
}

function combineCurrencyCodes(
  rows: Array<{ currencyCode: string | null | undefined }>,
) {
  const currencies = new Set(
    rows.map((row) => readCurrencyCode(row.currencyCode) ?? ''),
  )
  const onlyCurrency = currencies.size === 1 ? [...currencies][0] : null

  return {
    currencyCode: onlyCurrency || null,
    hasMixedCurrencies: currencies.size > 1,
  }
}

function dateRangeDays(start: Date, endExclusive: Date) {
  return Math.max(
    1,
    Math.round((endExclusive.getTime() - start.getTime()) / DAY_MS),
  )
}

function eachDateInRange(start: Date, endExclusive: Date) {
  const dates: Array<{ date: string; end: Date }> = []
  const current = new Date(start)

  while (current < endExclusive) {
    const end = new Date(current)
    end.setDate(end.getDate() + 1)
    dates.push({ date: dayKey(current), end })
    current.setDate(current.getDate() + 1)
  }

  return dates
}

function flatSeries(start: Date, endExclusive: Date, value: number) {
  return eachDateInRange(start, endExclusive).map(({ date }) => ({
    date,
    value,
  }))
}

type AppScope = {
  appId?: string
  appIds?: string[]
}

function scopedFilters(authOrganizationId: string, appScope: AppScope = {}) {
  const filters: SQL[] = [
    eq(partnerConnections.authOrganizationId, authOrganizationId),
  ]
  const appIds = scopedAppIds(appScope)

  if (appIds.length) {
    filters.push(
      or(
        inArray(partnerApps.id, appIds),
        inArray(
          partnerApps.partnerAppId,
          appIds.map((id) => toPartnerAppGid(id)),
        ),
      )!,
    )
  }

  return filters
}

function scopedAppIds({ appId, appIds = [] }: AppScope) {
  return [
    ...new Set(
      [...appIds, ...(appId ? [appId] : [])]
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ]
}

function reportingFilters(): SQL[] {
  return [eq(partnerApps.isTest, false), isNull(testShops.id)]
}

function buildActiveInstallSeries(
  rows: Array<{
    appId: string
    shopId: number | null
    type: string
    occurredAt: Date
  }>,
  start: Date,
  endExclusive: Date,
) {
  const active = new Set<string>()
  const sortedRows = [...rows].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
  )
  let rowIndex = 0

  return eachDateInRange(start, endExclusive).map((day) => {
    while (
      rowIndex < sortedRows.length &&
      sortedRows[rowIndex].occurredAt < day.end
    ) {
      const row = sortedRows[rowIndex]
      rowIndex += 1

      if (!row.shopId) continue

      const relationship = classifyRelationshipEvent(row.type)
      const key = `${row.appId}:${row.shopId}`

      if (relationship?.isInstalled || relationship?.isReactivated) {
        active.add(key)
      } else if (relationship?.isUninstalled || relationship?.isDeactivated) {
        active.delete(key)
      }
    }

    return { date: day.date, value: active.size }
  })
}

// Cohort logo churn: replay relationship events to find the stores installed as of
// `start`, then track how many of THOSE stores end the window uninstalled. Stores
// that left and reinstalled within the window are not counted as churned.
function buildLogoChurnCohort(
  rows: Array<{
    appId: string
    shopId: number | null
    type: string
    occurredAt: Date
  }>,
  start: Date,
  endExclusive: Date,
) {
  const active = new Set<string>()
  const sortedRows = [...rows].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
  )

  for (const row of sortedRows) {
    if (!row.shopId || row.occurredAt >= start) continue

    const relationship = classifyRelationshipEvent(row.type)
    const key = `${row.appId}:${row.shopId}`

    if (relationship?.isInstalled || relationship?.isReactivated)
      active.add(key)
    else if (relationship?.isUninstalled || relationship?.isDeactivated)
      active.delete(key)
  }

  const cohort = new Set(active)

  for (const row of sortedRows) {
    if (
      !row.shopId ||
      row.occurredAt < start ||
      row.occurredAt >= endExclusive
    ) {
      continue
    }

    const key = `${row.appId}:${row.shopId}`
    if (!cohort.has(key)) continue

    const relationship = classifyRelationshipEvent(row.type)
    if (relationship?.isInstalled || relationship?.isReactivated)
      active.add(key)
    else if (relationship?.isUninstalled || relationship?.isDeactivated)
      active.delete(key)
  }

  let churnedCount = 0
  for (const key of cohort) if (!active.has(key)) churnedCount += 1

  return { startingCount: cohort.size, churnedCount }
}

function buildSubscriptionSnapshotSeries(
  rows: Array<{
    shopId: number
    status: string
    interval: string | null
    mrrAmount: string
    activatedAt: Date | null
    acceptedAt: Date | null
    canceledAt: Date | null
  }>,
  start: Date,
  endExclusive: Date,
) {
  return eachDateInRange(start, endExclusive).map((day) => {
    const activeSubscriberShops = new Set<number>()
    let activeSubscriptions = 0
    let mrr = 0

    for (const row of rows) {
      if (!isSubscriptionActiveAt(row, day.end, start)) continue

      activeSubscriptions += 1
      activeSubscriberShops.add(row.shopId)
      mrr += monthlyRecurringAmount(row.mrrAmount, row.interval)
    }

    return {
      date: day.date,
      activeSubscribers: activeSubscriberShops.size,
      activeSubscriptions,
      mrr,
    }
  })
}

function isSubscriptionActiveAt(
  row: {
    status: string
    activatedAt: Date | null
    acceptedAt: Date | null
    canceledAt: Date | null
  },
  dayEnd: Date,
  fallbackStart: Date,
) {
  const isCurrentlyActive = isActiveSubscription(row.status)
  const activeFrom =
    row.activatedAt ??
    (isCurrentlyActive ? (row.acceptedAt ?? fallbackStart) : null)

  if (!activeFrom || activeFrom >= dayEnd) return false
  if (isCurrentlyActive) return true

  return Boolean(row.canceledAt && row.canceledAt >= dayEnd)
}

function buildRunRateSeries(
  mrrSeries: DateSeriesPoint[],
  usageRevenueSeries: DateSeriesPoint[],
  start: Date,
  endExclusive: Date,
) {
  const mrrByDate = new Map(mrrSeries.map((point) => [point.date, point.value]))
  const usageRevenueByDate = new Map(
    usageRevenueSeries.map((point) => [point.date, point.value]),
  )
  let cumulativeUsageRevenue = 0

  return eachDateInRange(start, endExclusive).map((day, index) => {
    cumulativeUsageRevenue += usageRevenueByDate.get(day.date) ?? 0

    return {
      date: day.date,
      value:
        (mrrByDate.get(day.date) ?? 0) +
        cumulativeUsageRevenue * (REPORT_MONTH_DAYS / (index + 1)),
    }
  })
}

export async function getAnalyticsForUser(args: {
  authOrganizationId: string
  appId?: string
  appIds?: string[]
  startDate?: string
  endDate?: string
}) {
  const dateRange = normalizeDateRangeSearch(args)
  const { start, endExclusive } = getDateRangeBounds(dateRange)
  const scope = scopedFilters(args.authOrganizationId, args)
  const appListScope = scopedFilters(args.authOrganizationId)

  const appsQuery = db
    .select({
      id: partnerApps.id,
      name: partnerApps.name,
      partnerAppId: partnerApps.partnerAppId,
      isTest: partnerApps.isTest,
      connectionName: partnerConnections.name,
      organizationId: partnerConnections.organizationId,
    })
    .from(partnerApps)
    .innerJoin(
      partnerConnections,
      eq(partnerApps.connectionId, partnerConnections.id),
    )
    .where(and(...appListScope))
    .orderBy(desc(partnerApps.createdAt))

  const eventRowsQuery = db
    .select({
      appId: partnerApps.id,
      appName: partnerApps.name,
      shopId: shops.id,
      shopDomain: shops.myshopifyDomain,
      shopName: shops.name,
      type: appEvents.type,
      occurredAt: appEvents.occurredAt,
      amount: appEvents.amount,
      currencyCode: appEvents.currencyCode,
    })
    .from(appEvents)
    .innerJoin(partnerApps, eq(appEvents.appId, partnerApps.id))
    .innerJoin(
      partnerConnections,
      eq(partnerApps.connectionId, partnerConnections.id),
    )
    .leftJoin(shops, eq(appEvents.shopId, shops.id))
    .leftJoin(
      testShops,
      and(
        eq(testShops.authOrganizationId, args.authOrganizationId),
        eq(testShops.shopId, appEvents.shopId),
      ),
    )
    .where(
      and(
        ...scope,
        ...reportingFilters(),
        gte(appEvents.occurredAt, start),
        lt(appEvents.occurredAt, endExclusive),
      ),
    )
    .orderBy(desc(appEvents.occurredAt))
    .then((rows) =>
      rows.map((row) => ({
        ...row,
        type: normalizePartnerAppEventType(row.type) ?? row.type,
      })),
    )

  const relationshipRowsQuery = db
    .select({
      appId: partnerApps.id,
      appName: partnerApps.name,
      partnerAppId: partnerApps.partnerAppId,
      shopId: shops.id,
      status: shopAppRelationships.status,
      shopDomain: shops.myshopifyDomain,
      shopName: shops.name,
      installedAt: shopAppRelationships.installedAt,
      uninstalledAt: shopAppRelationships.uninstalledAt,
      reactivatedAt: shopAppRelationships.reactivatedAt,
      deactivatedAt: shopAppRelationships.deactivatedAt,
    })
    .from(shopAppRelationships)
    .innerJoin(partnerApps, eq(shopAppRelationships.appId, partnerApps.id))
    .innerJoin(
      partnerConnections,
      eq(partnerApps.connectionId, partnerConnections.id),
    )
    .innerJoin(shops, eq(shopAppRelationships.shopId, shops.id))
    .leftJoin(
      testShops,
      and(
        eq(testShops.authOrganizationId, args.authOrganizationId),
        eq(testShops.shopId, shopAppRelationships.shopId),
      ),
    )
    .where(and(...scope, ...reportingFilters()))

  const relationshipEventRowsQuery = db
    .select({
      appId: partnerApps.id,
      shopId: appEvents.shopId,
      type: appEvents.type,
      occurredAt: appEvents.occurredAt,
    })
    .from(appEvents)
    .innerJoin(partnerApps, eq(appEvents.appId, partnerApps.id))
    .innerJoin(
      partnerConnections,
      eq(partnerApps.connectionId, partnerConnections.id),
    )
    .leftJoin(
      testShops,
      and(
        eq(testShops.authOrganizationId, args.authOrganizationId),
        eq(testShops.shopId, appEvents.shopId),
      ),
    )
    .where(
      and(
        ...scope,
        ...reportingFilters(),
        lt(appEvents.occurredAt, endExclusive),
        inArray(appEvents.type, relationshipEventTypes),
      ),
    )
    .orderBy(appEvents.occurredAt)
    .then((rows) =>
      rows.map((row) => ({
        ...row,
        type: normalizePartnerAppEventType(row.type) ?? row.type,
      })),
    )

  const subscriptionRowsQuery = db
    .select({
      appId: appSubscriptions.appId,
      appName: partnerApps.name,
      shopId: appSubscriptions.shopId,
      shopDomain: shops.myshopifyDomain,
      shopName: shops.name,
      chargeId: appSubscriptions.chargeId,
      planName: appSubscriptions.name,
      status: appSubscriptions.status,
      interval: appSubscriptions.interval,
      isTest: appSubscriptions.isTest,
      mrrAmount: appSubscriptions.mrrAmount,
      currencyCode: appSubscriptions.currencyCode,
      acceptedAt: appSubscriptions.acceptedAt,
      activatedAt: appSubscriptions.activatedAt,
      canceledAt: appSubscriptions.canceledAt,
    })
    .from(appSubscriptions)
    .innerJoin(partnerApps, eq(appSubscriptions.appId, partnerApps.id))
    .innerJoin(
      partnerConnections,
      eq(partnerApps.connectionId, partnerConnections.id),
    )
    .innerJoin(shops, eq(appSubscriptions.shopId, shops.id))
    .leftJoin(
      testShops,
      and(
        eq(testShops.authOrganizationId, args.authOrganizationId),
        eq(testShops.shopId, appSubscriptions.shopId),
      ),
    )
    .where(and(...scope, ...reportingFilters()))

  const mrrEventRowsQuery = db
    .select({
      appId: partnerApps.id,
      appName: partnerApps.name,
      shopId: shops.id,
      shopDomain: shops.myshopifyDomain,
      shopName: shops.name,
      type: appEvents.type,
      occurredAt: appEvents.occurredAt,
      amount: appEvents.amount,
      currencyCode: appEvents.currencyCode,
      rawPayload: appEvents.rawPayload,
    })
    .from(appEvents)
    .innerJoin(partnerApps, eq(appEvents.appId, partnerApps.id))
    .innerJoin(
      partnerConnections,
      eq(partnerApps.connectionId, partnerConnections.id),
    )
    .leftJoin(shops, eq(appEvents.shopId, shops.id))
    .leftJoin(
      testShops,
      and(
        eq(testShops.authOrganizationId, args.authOrganizationId),
        eq(testShops.shopId, appEvents.shopId),
      ),
    )
    .where(
      and(
        ...scope,
        ...reportingFilters(),
        lt(appEvents.occurredAt, endExclusive),
        inArray(appEvents.type, mrrEventTypes),
      ),
    )
    .orderBy(appEvents.occurredAt)
    .then((rows) =>
      rows.map((row) => ({
        ...row,
        type: normalizePartnerAppEventType(row.type) ?? row.type,
      })),
    )

  const transactionRowsQuery = db
    .select({
      shopId: financialTransactions.shopId,
      shopDomain: shops.myshopifyDomain,
      shopName: shops.name,
      type: financialTransactions.transactionType,
      createdAt: financialTransactions.createdAt,
      netAmount: financialTransactions.netAmount,
      grossAmount: financialTransactions.grossAmount,
      currencyCode: financialTransactions.currencyCode,
    })
    .from(financialTransactions)
    .innerJoin(partnerApps, eq(financialTransactions.appId, partnerApps.id))
    .innerJoin(
      partnerConnections,
      eq(partnerApps.connectionId, partnerConnections.id),
    )
    .leftJoin(shops, eq(financialTransactions.shopId, shops.id))
    .leftJoin(
      testShops,
      and(
        eq(testShops.authOrganizationId, args.authOrganizationId),
        eq(testShops.shopId, financialTransactions.shopId),
      ),
    )
    .where(
      and(
        ...scope,
        ...reportingFilters(),
        gte(financialTransactions.createdAt, start),
        lt(financialTransactions.createdAt, endExclusive),
      ),
    )
    .then((rows) =>
      rows.map((row) => ({
        ...row,
        type: normalizePartnerTransactionType(row.type) ?? row.type,
      })),
    )

  const feedbackRowsQuery = db
    .select({
      reason: uninstallFeedback.reason,
      description: uninstallFeedback.description,
      occurredAt: uninstallFeedback.occurredAt,
      shopDomain: shops.myshopifyDomain,
    })
    .from(uninstallFeedback)
    .innerJoin(partnerApps, eq(uninstallFeedback.appId, partnerApps.id))
    .innerJoin(
      partnerConnections,
      eq(partnerApps.connectionId, partnerConnections.id),
    )
    .leftJoin(shops, eq(uninstallFeedback.shopId, shops.id))
    .leftJoin(
      testShops,
      and(
        eq(testShops.authOrganizationId, args.authOrganizationId),
        eq(testShops.shopId, uninstallFeedback.shopId),
      ),
    )
    .where(
      and(
        ...scope,
        ...reportingFilters(),
        gte(uninstallFeedback.occurredAt, start),
        lt(uninstallFeedback.occurredAt, endExclusive),
      ),
    )
    .orderBy(desc(uninstallFeedback.occurredAt))

  const syncRowsQuery = db
    .select({
      status: syncRuns.status,
      startedAt: syncRuns.startedAt,
      finishedAt: syncRuns.finishedAt,
      eventsCount: syncRuns.eventsCount,
      transactionsCount: syncRuns.transactionsCount,
      error: syncRuns.error,
      appName: partnerApps.name,
    })
    .from(syncRuns)
    .innerJoin(
      partnerConnections,
      eq(syncRuns.connectionId, partnerConnections.id),
    )
    .leftJoin(partnerApps, eq(syncRuns.appId, partnerApps.id))
    .where(and(...scopedFilters(args.authOrganizationId, args)))
    .orderBy(desc(syncRuns.startedAt))
    .limit(10)

  const [
    apps,
    eventRows,
    relationshipRows,
    relationshipEventRows,
    subscriptionRows,
    mrrEventRows,
    transactionRows,
    feedbackRows,
    syncRows,
  ] = await Promise.all([
    appsQuery,
    eventRowsQuery,
    relationshipRowsQuery,
    relationshipEventRowsQuery,
    subscriptionRowsQuery,
    mrrEventRowsQuery,
    transactionRowsQuery,
    feedbackRowsQuery,
    syncRowsQuery,
  ])

  const eventSeries = new Map<string, number>()
  const revenueSeries = new Map<string, number>()
  const usageRevenueSeries = new Map<string, number>()
  const customerLifecycleByDate = new Map<
    string,
    Record<string, number | string>
  >()
  let installs = 0
  let uninstalls = 0
  let reactivations = 0

  for (const event of eventRows) {
    const relationship = classifyRelationshipEvent(event.type)
    const date = dayKey(event.occurredAt)

    increment(eventSeries, date)

    if (relationship?.isUninstalled) {
      uninstalls += 1
      incrementField(customerLifecycleByDate, date, 'uninstalls')
    } else if (relationship?.isReactivated) {
      reactivations += 1
      incrementField(customerLifecycleByDate, date, 'reactivations')
    } else if (relationship?.isInstalled) {
      installs += 1
      incrementField(customerLifecycleByDate, date, 'installs')
    }
  }

  for (const transaction of transactionRows) {
    const amount = num(transaction.netAmount ?? transaction.grossAmount)

    increment(revenueSeries, dayKey(transaction.createdAt), amount)

    if (isUsageTransaction(transaction.type)) {
      increment(usageRevenueSeries, dayKey(transaction.createdAt), amount)
    }
  }

  const activeInstalls = relationshipRows.filter(
    (row) => row.status === 'installed',
  ).length

  const billableSubscriptions = subscriptionRows.filter((row) => !row.isTest)
  const activeSubscriptions = billableSubscriptions.filter((row) =>
    isActiveSubscription(row.status),
  )
  const trialSubscriptions = billableSubscriptions.filter((row) =>
    isTrialSubscription(row.status),
  )

  const activeSubscriberShops = new Set(
    activeSubscriptions.map((row) => row.shopId),
  )
  const trialSubscriberShops = new Set(
    trialSubscriptions.map((row) => row.shopId),
  )
  const monthlySubscriptions = activeSubscriptions.filter(
    (row) => intervalKind(row.interval) === 'monthly',
  ).length
  const annualSubscriptions = activeSubscriptions.filter(
    (row) => intervalKind(row.interval) === 'annual',
  ).length
  const unknownIntervalSubscriptions =
    activeSubscriptions.length - monthlySubscriptions - annualSubscriptions

  const mrr = activeSubscriptions.reduce(
    (sum, row) => sum + monthlyRecurringAmount(row.mrrAmount, row.interval),
    0,
  )
  const usageTransactions = transactionRows.filter((row) =>
    isUsageTransaction(row.type),
  )
  const mrrCurrency = combineCurrencyCodes(activeSubscriptions)
  const revenueCurrency = combineCurrencyCodes(transactionRows)
  const usageRevenueCurrency = combineCurrencyCodes(usageTransactions)
  const allMoneyCurrency = combineCurrencyCodes([
    ...activeSubscriptions,
    ...transactionRows,
  ])
  const runRateCurrency = combineCurrencyCodes([
    ...activeSubscriptions,
    ...usageTransactions,
  ])

  const usageRevenue = usageTransactions.reduce(
    (sum, row) => sum + num(row.netAmount ?? row.grossAmount),
    0,
  )
  const usageRevenueRunRate =
    usageRevenue * (REPORT_MONTH_DAYS / dateRangeDays(start, endExclusive))

  const revenue = transactionRows.reduce(
    (sum, row) => sum + num(row.netAmount ?? row.grossAmount),
    0,
  )

  const activeSubscribers = activeSubscriberShops.size
  const trialUsers = trialSubscriberShops.size
  const arpu = activeSubscribers > 0 ? mrr / activeSubscribers : 0
  const churnBase = activeInstalls + uninstalls
  const monthlyChurnRate = churnBase > 0 ? uninstalls / churnBase : 0
  const ltv = monthlyChurnRate > 0 ? arpu / monthlyChurnRate : null
  const runRate = mrr + usageRevenueRunRate
  const mrrBridge = buildMrrMovementBridge({
    events: buildMrrBridgeEvents(mrrEventRows, subscriptionRows),
    startDate: start.toISOString(),
    endDate: endExclusive.toISOString(),
  })
  const mrrMovementSeries = toSeries(
    mrrBridge.rows.reduce((series, row) => {
      increment(series, dayKey(new Date(row.occurredAt)), row.delta)
      return series
    }, new Map<string, number>()),
  )
  const topPlanMap = new Map<
    string,
    {
      appName: string
      planName: string
      purchases: number
      mrr: number
      currencyCode: string | null
    }
  >()
  const activePlansByRelationship = new Map<string, string[]>()
  const topCustomerMap = new Map<
    string,
    {
      shopId: number
      shopDomain: string
      shopName: string | null
      mrr: number
      revenue: number
      currencyCode: string | null
    }
  >()
  const topReasonMap = new Map<
    string,
    {
      reason: string
      count: number
      lastSeenAt: Date
      description: string | null
    }
  >()

  for (const subscription of activeSubscriptions) {
    const planName = subscription.planName?.trim() || 'Unnamed plan'
    const currencyCode = readCurrencyCode(subscription.currencyCode)
    const planKey = `${subscription.appName}\0${planName}\0${currencyCode ?? ''}`
    const plan = topPlanMap.get(planKey) ?? {
      appName: subscription.appName,
      planName,
      purchases: 0,
      mrr: 0,
      currencyCode,
    }

    plan.purchases += 1
    plan.mrr += monthlyRecurringAmount(
      subscription.mrrAmount,
      subscription.interval,
    )
    topPlanMap.set(planKey, plan)

    const relationshipKey = `${subscription.appId}:${subscription.shopId}`
    const activePlans = activePlansByRelationship.get(relationshipKey) ?? []
    activePlans.push(planName)
    activePlansByRelationship.set(relationshipKey, activePlans)

    const customerKey = `${subscription.shopId}\0${currencyCode ?? ''}`
    const customer = topCustomerMap.get(customerKey) ?? {
      shopId: subscription.shopId,
      shopDomain: subscription.shopDomain,
      shopName: subscription.shopName,
      mrr: 0,
      revenue: 0,
      currencyCode,
    }

    customer.mrr += monthlyRecurringAmount(
      subscription.mrrAmount,
      subscription.interval,
    )
    topCustomerMap.set(customerKey, customer)
  }

  for (const transaction of transactionRows) {
    if (!transaction.shopId || !transaction.shopDomain) continue

    const currencyCode = readCurrencyCode(transaction.currencyCode)
    const customerKey = `${transaction.shopId}\0${currencyCode ?? ''}`
    const customer = topCustomerMap.get(customerKey) ?? {
      shopId: transaction.shopId,
      shopDomain: transaction.shopDomain,
      shopName: transaction.shopName,
      mrr: 0,
      revenue: 0,
      currencyCode,
    }

    customer.revenue += num(transaction.netAmount ?? transaction.grossAmount)
    topCustomerMap.set(customerKey, customer)
  }

  const normalizedFeedbackRows = feedbackRows.map((row) => ({
    ...row,
    normalizedReason: normalizeUninstallReasons(row.reason),
  }))

  for (const feedback of normalizedFeedbackRows) {
    for (const reason of feedback.normalizedReason.categories) {
      const current = topReasonMap.get(reason)

      if (!current) {
        topReasonMap.set(reason, {
          reason,
          count: 1,
          lastSeenAt: feedback.occurredAt,
          description: feedback.description,
        })
        continue
      }

      current.count += 1
      if (feedback.occurredAt > current.lastSeenAt) {
        current.lastSeenAt = feedback.occurredAt
        current.description = feedback.description ?? current.description
      }
    }
  }

  const uninstallReasons = [...topReasonMap.values()].sort(
    (a, b) => b.count - a.count || a.reason.localeCompare(b.reason),
  )
  const events = eventRows.slice(0, 100).map((row) => ({
    ...row,
    occurredAt: row.occurredAt.toISOString(),
  }))
  const topPlans = [...topPlanMap.values()]
    .sort((a, b) => b.purchases - a.purchases || b.mrr - a.mrr)
    .slice(0, 5)
  const topCustomers = [...topCustomerMap.values()]
    .map((customer) => ({
      ...customer,
      total: customer.mrr + customer.revenue,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
  const uninstallReasonRows = uninstallReasons.map(({ reason, count }) => ({
    reason,
    count,
  }))
  const topUninstallReasons = uninstallReasons.slice(0, 5).map((reason) => ({
    ...reason,
    lastSeenAt: reason.lastSeenAt.toISOString(),
  }))
  const customers = relationshipRows.map((row) => ({
    ...row,
    planName:
      activePlansByRelationship.get(`${row.appId}:${row.shopId}`)?.join(', ') ??
      null,
    installedAt: row.installedAt?.toISOString() ?? null,
    uninstalledAt: row.uninstalledAt?.toISOString() ?? null,
    reactivatedAt: row.reactivatedAt?.toISOString() ?? null,
    deactivatedAt: row.deactivatedAt?.toISOString() ?? null,
  }))
  const transactions = transactionRows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
  }))
  const uninstallFeedbackRows = normalizedFeedbackRows.map(
    ({ normalizedReason, ...row }) => ({
      ...row,
      reason: normalizedReason.reason,
      reasonCategories: normalizedReason.categories,
      rawReason: normalizedReason.rawReason,
      occurredAt: row.occurredAt.toISOString(),
    }),
  )
  const syncRunRows = syncRows.map((row) => ({
    ...row,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  }))
  const customerLifecycleSeries = toFieldSeries(customerLifecycleByDate)
  const installSeries = toValueSeries(customerLifecycleSeries, 'installs')
  const reactivationSeries = toValueSeries(
    customerLifecycleSeries,
    'reactivations',
  )
  const uninstallSeries = toValueSeries(customerLifecycleSeries, 'uninstalls')
  const uninstallFeedbackSeries = countByDate(
    uninstallFeedbackRows,
    (feedback) => feedback.occurredAt,
  )
  const revenueDateSeries = toSeries(revenueSeries)
  const usageRevenueDateSeries = toSeries(usageRevenueSeries)
  const subscriptionSnapshotSeries = buildSubscriptionSnapshotSeries(
    billableSubscriptions,
    start,
    endExclusive,
  )
  const mrrSeries = subscriptionSnapshotSeries.map((point) => ({
    date: point.date,
    value: point.mrr,
  }))
  const activeSubscriberSeries = subscriptionSnapshotSeries.map((point) => ({
    date: point.date,
    value: point.activeSubscribers,
  }))
  const activeSubscriptionSeries = subscriptionSnapshotSeries.map((point) => ({
    date: point.date,
    value: point.activeSubscriptions,
  }))
  const activeInstallSeries = relationshipEventRows.length
    ? buildActiveInstallSeries(relationshipEventRows, start, endExclusive)
    : flatSeries(start, endExclusive, activeInstalls)
  const runRateSeries = buildRunRateSeries(
    mrrSeries,
    usageRevenueDateSeries,
    start,
    endExclusive,
  )
  const churnRates = computeChurnRates({
    bridge: mrrBridge,
    logoCohort: buildLogoChurnCohort(
      relationshipEventRows,
      start,
      endExclusive,
    ),
  })
  const timeToUninstall = computeTimeToUninstallCohorts(
    relationshipRows.filter(
      (row) =>
        row.uninstalledAt &&
        row.uninstalledAt >= start &&
        row.uninstalledAt < endExclusive,
    ),
  )

  return {
    dateRange,
    apps,
    metrics: {
      installs,
      uninstalls,
      reactivations,
      activeInstalls,
      activeSubscriptions: activeSubscriptions.length,
      activeSubscribers,
      monthlySubscriptions,
      annualSubscriptions,
      unknownIntervalSubscriptions,
      trialUsers,
      mrr,
      revenue,
      usageRevenue,
      usageRevenueRunRate,
      arpu,
      ltv,
      monthlyChurnRate,
      ...churnRates,
      runRate,
      currencyCode: allMoneyCurrency.currencyCode,
      hasMixedCurrencies: allMoneyCurrency.hasMixedCurrencies,
      mrrCurrencyCode: mrrCurrency.currencyCode,
      mrrHasMixedCurrencies: mrrCurrency.hasMixedCurrencies,
      revenueCurrencyCode: revenueCurrency.currencyCode,
      revenueHasMixedCurrencies: revenueCurrency.hasMixedCurrencies,
      usageRevenueCurrencyCode: usageRevenueCurrency.currencyCode,
      usageRevenueHasMixedCurrencies: usageRevenueCurrency.hasMixedCurrencies,
      runRateCurrencyCode: runRateCurrency.currencyCode,
      runRateHasMixedCurrencies: runRateCurrency.hasMixedCurrencies,
    },
    eventSeries: toSeries(eventSeries),
    revenueSeries: revenueDateSeries,
    usageRevenueSeries: usageRevenueDateSeries,
    mrrMovementSeries,
    events,
    mrrBridge,
    topPlans,
    topCustomers,
    timeToUninstall,
    uninstallReasons: uninstallReasonRows,
    topUninstallReasons,
    customers,
    transactions,
    uninstallFeedback: uninstallFeedbackRows,
    syncRuns: syncRunRows,
    charts: {
      partnerEvents: toSeries(eventSeries).reduce(
        (sum, point) => sum + point.value,
        0,
      ),
      customerLifecycleSeries,
      activeInstallSeries,
      activeSubscriberSeries,
      activeSubscriptionSeries,
      installSeries,
      mrrSeries,
      reactivationSeries,
      runRateSeries,
      uninstallSeries,
      churnSeries: uninstallSeries,
      uninstallFeedbackSeries,
      topPlanChart: rankedByValue(
        topPlans,
        (plan) => plan.planName,
        (plan) => plan.mrr,
      ),
      topCustomerChart: rankedByValue(
        topCustomers,
        (customer) => customer.shopName ?? customer.shopDomain,
        (customer) => customer.total,
      ),
      topReasonChart: rankedByValue(
        topUninstallReasons,
        (reason) => reason.reason,
        (reason) => reason.count,
      ),
      eventTypeChart: sumByGroup(
        events,
        (event) => event.type,
        () => 1,
      ),
      transactionTypeChart: sumByGroup(
        transactions,
        (transaction) => transaction.type,
        (transaction) =>
          Number(transaction.netAmount ?? transaction.grossAmount ?? 0),
      ),
    },
  }
}

type AnalyticsPayload = Awaited<ReturnType<typeof getAnalyticsForUser>>

export async function getDashboardAnalyticsForUser(
  args: Parameters<typeof getAnalyticsForUser>[0],
) {
  const analytics = await getAnalyticsForUser(args)

  return pickAnalytics(analytics, [
    'dateRange',
    'apps',
    'metrics',
    'revenueSeries',
    'usageRevenueSeries',
    'syncRuns',
    'charts',
  ])
}

export async function getRevenueReportForUser(
  args: Parameters<typeof getAnalyticsForUser>[0],
) {
  const analytics = await getAnalyticsForUser(args)

  return {
    ...pickAnalytics(analytics, [
      'dateRange',
      'apps',
      'metrics',
      'revenueSeries',
      'usageRevenueSeries',
      'mrrMovementSeries',
      'mrrBridge',
    ]),
    activeSubscriptionSeries: analytics.charts.activeSubscriptionSeries,
    mrrSeries: analytics.charts.mrrSeries,
    runRateSeries: analytics.charts.runRateSeries,
    transactions: analytics.transactions.slice(0, 500),
    transactionsTotalCount: analytics.transactions.length,
  }
}

export async function getCustomerReportForUser(
  args: Parameters<typeof getAnalyticsForUser>[0],
) {
  const analytics = await getAnalyticsForUser(args)

  return {
    ...pickAnalytics(analytics, ['dateRange', 'apps', 'metrics', 'charts']),
    customers: analytics.customers.slice(0, 500),
    customersTotalCount: analytics.customers.length,
  }
}

export async function getChurnReportForUser(
  args: Parameters<typeof getAnalyticsForUser>[0] & { reason?: string },
) {
  const analytics = await getAnalyticsForUser(args)
  const filteredUninstallFeedback = args.reason
    ? analytics.uninstallFeedback.filter((row) =>
        row.reasonCategories.includes(args.reason!),
      )
    : analytics.uninstallFeedback
  const churnSeries = args.reason
    ? countByDate(filteredUninstallFeedback, (feedback) => feedback.occurredAt)
    : analytics.charts.uninstallSeries
  const metrics = args.reason
    ? {
        ...analytics.metrics,
        uninstalls: filteredUninstallFeedback.length,
        uninstallFeedback: filteredUninstallFeedback.length,
      }
    : analytics.metrics

  return {
    ...pickAnalytics(analytics, [
      'dateRange',
      'apps',
      'eventSeries',
      'uninstallReasons',
      'timeToUninstall',
      'charts',
    ]),
    metrics,
    charts: {
      ...analytics.charts,
      churnSeries,
    },
    uninstallFeedback: filteredUninstallFeedback.slice(0, 500),
    uninstallFeedbackTotalCount: filteredUninstallFeedback.length,
  }
}

export async function getAppDetailAnalyticsForUser(
  args: Parameters<typeof getAnalyticsForUser>[0] & { appId: string },
) {
  const analytics = await getAnalyticsForUser(args)

  return {
    ...pickAnalytics(analytics, [
      'dateRange',
      'apps',
      'metrics',
      'eventSeries',
      'revenueSeries',
      'usageRevenueSeries',
      'events',
      'charts',
    ]),
    customers: analytics.customers.slice(0, 500),
    customersTotalCount: analytics.customers.length,
    transactions: analytics.transactions.slice(0, 500),
    transactionsTotalCount: analytics.transactions.length,
    uninstallFeedback: analytics.uninstallFeedback.slice(0, 500),
    uninstallFeedbackTotalCount: analytics.uninstallFeedback.length,
  }
}

function pickAnalytics<TKey extends keyof AnalyticsPayload>(
  analytics: AnalyticsPayload,
  keys: TKey[],
) {
  return Object.fromEntries(keys.map((key) => [key, analytics[key]])) as Pick<
    AnalyticsPayload,
    TKey
  >
}

// Buckets uninstalled relationships by days from install to uninstall, mirroring
// the Partner dashboard "Time to uninstall" table. Closed stores ('deactivated')
// are excluded, matching Shopify. Fixed cohort order for the bar chart.
function computeTimeToUninstallCohorts(
  rows: Array<{
    status: string
    installedAt: Date | null
    uninstalledAt: Date | null
  }>,
) {
  const buckets = {
    'Same day': 0,
    '1–14 days': 0,
    '15–90 days': 0,
    '91+ days': 0,
  }

  for (const row of rows) {
    if (
      row.status !== 'uninstalled' ||
      !row.installedAt ||
      !row.uninstalledAt
    ) {
      continue
    }

    const days = Math.floor(
      (row.uninstalledAt.getTime() - row.installedAt.getTime()) / DAY_MS,
    )

    if (days <= 0) buckets['Same day'] += 1
    else if (days <= 14) buckets['1–14 days'] += 1
    else if (days <= 90) buckets['15–90 days'] += 1
    else buckets['91+ days'] += 1
  }

  return Object.entries(buckets).map(([name, value]) => ({ name, value }))
}

function toValueSeries(
  rows: Array<{ date: string } & Record<string, string | number>>,
  key: string,
) {
  return rows.flatMap((row) => {
    const value = Number(row[key] ?? 0)
    return value > 0 ? [{ date: row.date, value }] : []
  })
}

function buildMrrBridgeEvents(
  eventRows: Array<{
    appId: string
    appName: string
    shopId: number | null
    shopDomain: string | null
    shopName: string | null
    type: string
    occurredAt: Date
    amount: string | null
    currencyCode: string | null
    rawPayload: Record<string, unknown>
  }>,
  subscriptionRows: Array<{
    appId: string
    shopId: number
    chargeId: string
    planName: string | null
    interval: string | null
    isTest: boolean
    currencyCode: string | null
  }>,
): MrrBridgeEvent[] {
  const subscriptionsByCharge = new Map(
    subscriptionRows.map((row) => [
      `${row.appId}\0${row.shopId}\0${row.chargeId}`,
      row,
    ]),
  )

  return eventRows.flatMap((row) => {
    if (!row.shopId) return []

    const rawEvent = normalizeStoredPartnerAppEventPayload(row.rawPayload)
    const charge = rawEvent.charge
    if (!charge?.id) return []

    const key = `${row.appId}\0${row.shopId}\0${charge.id}`
    const subscription = subscriptionsByCharge.get(key)
    const amount = Number(charge.amount?.amount ?? row.amount ?? 0)
    if (!Number.isFinite(amount)) return []

    return [
      {
        key,
        appId: row.appId,
        appName: row.appName,
        shopId: row.shopId,
        shopDomain: row.shopDomain,
        shopName: row.shopName,
        chargeId: charge.id,
        planName: charge.name ?? subscription?.planName ?? null,
        interval: subscription?.interval ?? null,
        type: row.type,
        amount,
        currencyCode:
          charge.amount?.currencyCode ??
          subscription?.currencyCode ??
          row.currencyCode,
        isTest: charge.test ?? subscription?.isTest ?? false,
        occurredAt: row.occurredAt.toISOString(),
      },
    ]
  })
}

export async function getShopDetailForUser(args: {
  authOrganizationId: string
  shopId: number
  startDate?: string
  endDate?: string
}) {
  const dateRange = normalizeDateRangeSearch(args)
  const { start, endExclusive } = getDateRangeBounds(dateRange)
  const ownerScope = and(
    eq(partnerConnections.authOrganizationId, args.authOrganizationId),
    eq(shops.id, args.shopId),
  )

  const shop = (
    await db
      .select({
        id: shops.id,
        shopifyShopId: shops.shopifyShopId,
        shopDomain: shops.myshopifyDomain,
        shopName: shops.name,
        avatarUrl: shops.avatarUrl,
        isTest: sql<boolean>`${testShops.id} is not null`,
        createdAt: shops.createdAt,
      })
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
      .leftJoin(
        testShops,
        and(
          eq(testShops.authOrganizationId, args.authOrganizationId),
          eq(testShops.shopId, shops.id),
        ),
      )
      .where(ownerScope)
      .limit(1)
  ).at(0)

  if (!shop) return null

  const relationshipRowsQuery = db
    .select({
      appId: partnerApps.id,
      appName: partnerApps.name,
      partnerAppId: partnerApps.partnerAppId,
      status: shopAppRelationships.status,
      installedAt: shopAppRelationships.installedAt,
      uninstalledAt: shopAppRelationships.uninstalledAt,
      reactivatedAt: shopAppRelationships.reactivatedAt,
      deactivatedAt: shopAppRelationships.deactivatedAt,
    })
    .from(shopAppRelationships)
    .innerJoin(partnerApps, eq(shopAppRelationships.appId, partnerApps.id))
    .innerJoin(
      partnerConnections,
      eq(partnerApps.connectionId, partnerConnections.id),
    )
    .innerJoin(shops, eq(shopAppRelationships.shopId, shops.id))
    .where(ownerScope)
    .orderBy(desc(shopAppRelationships.updatedAt))

  const subscriptionRowsQuery = db
    .select({
      appId: partnerApps.id,
      appName: partnerApps.name,
      name: appSubscriptions.name,
      status: appSubscriptions.status,
      interval: appSubscriptions.interval,
      isTest: appSubscriptions.isTest,
      mrrAmount: appSubscriptions.mrrAmount,
      currencyCode: appSubscriptions.currencyCode,
      acceptedAt: appSubscriptions.acceptedAt,
      activatedAt: appSubscriptions.activatedAt,
      canceledAt: appSubscriptions.canceledAt,
    })
    .from(appSubscriptions)
    .innerJoin(partnerApps, eq(appSubscriptions.appId, partnerApps.id))
    .innerJoin(
      partnerConnections,
      eq(partnerApps.connectionId, partnerConnections.id),
    )
    .innerJoin(shops, eq(appSubscriptions.shopId, shops.id))
    .leftJoin(
      testShops,
      and(
        eq(testShops.authOrganizationId, args.authOrganizationId),
        eq(testShops.shopId, appSubscriptions.shopId),
      ),
    )
    .where(and(ownerScope, ...reportingFilters()))
    .orderBy(desc(appSubscriptions.updatedAt))

  const eventRowsQuery = db
    .select({
      appName: partnerApps.name,
      type: appEvents.type,
      occurredAt: appEvents.occurredAt,
      amount: appEvents.amount,
      currencyCode: appEvents.currencyCode,
    })
    .from(appEvents)
    .innerJoin(partnerApps, eq(appEvents.appId, partnerApps.id))
    .innerJoin(
      partnerConnections,
      eq(partnerApps.connectionId, partnerConnections.id),
    )
    .innerJoin(shops, eq(appEvents.shopId, shops.id))
    .leftJoin(
      testShops,
      and(
        eq(testShops.authOrganizationId, args.authOrganizationId),
        eq(testShops.shopId, appEvents.shopId),
      ),
    )
    .where(
      and(
        ownerScope,
        ...reportingFilters(),
        gte(appEvents.occurredAt, start),
        lt(appEvents.occurredAt, endExclusive),
      ),
    )
    .orderBy(desc(appEvents.occurredAt))
    .limit(100)
    .then((rows) =>
      rows.map((row) => ({
        ...row,
        type: normalizePartnerAppEventType(row.type) ?? row.type,
      })),
    )

  const transactionRowsQuery = db
    .select({
      appName: partnerApps.name,
      type: financialTransactions.transactionType,
      createdAt: financialTransactions.createdAt,
      netAmount: financialTransactions.netAmount,
      grossAmount: financialTransactions.grossAmount,
      currencyCode: financialTransactions.currencyCode,
    })
    .from(financialTransactions)
    .innerJoin(partnerApps, eq(financialTransactions.appId, partnerApps.id))
    .innerJoin(
      partnerConnections,
      eq(partnerApps.connectionId, partnerConnections.id),
    )
    .innerJoin(shops, eq(financialTransactions.shopId, shops.id))
    .leftJoin(
      testShops,
      and(
        eq(testShops.authOrganizationId, args.authOrganizationId),
        eq(testShops.shopId, financialTransactions.shopId),
      ),
    )
    .where(
      and(
        ownerScope,
        ...reportingFilters(),
        gte(financialTransactions.createdAt, start),
        lt(financialTransactions.createdAt, endExclusive),
      ),
    )
    .orderBy(desc(financialTransactions.createdAt))
    .limit(100)
    .then((rows) =>
      rows.map((row) => ({
        ...row,
        type: normalizePartnerTransactionType(row.type) ?? row.type,
      })),
    )

  const feedbackRowsQuery = db
    .select({
      appName: partnerApps.name,
      reason: uninstallFeedback.reason,
      description: uninstallFeedback.description,
      occurredAt: uninstallFeedback.occurredAt,
    })
    .from(uninstallFeedback)
    .innerJoin(partnerApps, eq(uninstallFeedback.appId, partnerApps.id))
    .innerJoin(
      partnerConnections,
      eq(partnerApps.connectionId, partnerConnections.id),
    )
    .innerJoin(shops, eq(uninstallFeedback.shopId, shops.id))
    .leftJoin(
      testShops,
      and(
        eq(testShops.authOrganizationId, args.authOrganizationId),
        eq(testShops.shopId, uninstallFeedback.shopId),
      ),
    )
    .where(
      and(
        ownerScope,
        ...reportingFilters(),
        gte(uninstallFeedback.occurredAt, start),
        lt(uninstallFeedback.occurredAt, endExclusive),
      ),
    )
    .orderBy(desc(uninstallFeedback.occurredAt))
    .limit(100)

  const [
    relationshipRows,
    subscriptionRows,
    eventRows,
    transactionRows,
    feedbackRows,
  ] = await Promise.all([
    relationshipRowsQuery,
    subscriptionRowsQuery,
    eventRowsQuery,
    transactionRowsQuery,
    feedbackRowsQuery,
  ])

  const activeSubscriptions = subscriptionRows.filter(
    (row) => !row.isTest && row.status === 'active',
  )
  const revenue = transactionRows.reduce(
    (sum, row) => sum + num(row.netAmount ?? row.grossAmount),
    0,
  )
  const mrr = activeSubscriptions.reduce(
    (sum, row) => sum + monthlyRecurringAmount(row.mrrAmount, row.interval),
    0,
  )
  const mrrCurrency = combineCurrencyCodes(activeSubscriptions)
  const revenueCurrency = combineCurrencyCodes(transactionRows)
  const moneyCurrency = combineCurrencyCodes([
    ...activeSubscriptions,
    ...transactionRows,
  ])
  const normalizedFeedbackRows = feedbackRows.map((row) => ({
    ...row,
    normalizedReason: normalizeUninstallReasons(row.reason),
  }))
  const activity = [
    ...eventRows.map((row) => ({
      kind: 'Partner event',
      label: row.type,
      appName: row.appName,
      occurredAt: row.occurredAt.toISOString(),
      detail: amountLabel(row.amount, row.currencyCode),
    })),
    ...transactionRows.map((row) => ({
      kind: 'Transaction',
      label: row.type,
      appName: row.appName,
      occurredAt: row.createdAt.toISOString(),
      detail: amountLabel(row.netAmount ?? row.grossAmount, row.currencyCode),
    })),
    ...normalizedFeedbackRows.map((row) => ({
      kind: 'Uninstall feedback',
      label: row.normalizedReason.reason,
      appName: row.appName,
      occurredAt: row.occurredAt.toISOString(),
      detail: row.description,
    })),
  ]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, 100)
  const partnerActivity = activity.filter((row) => row.kind === 'Partner event')
  const uninstallFeedbackActivity = activity.filter(
    (row) => row.kind === 'Uninstall feedback',
  )

  return {
    dateRange,
    shop: {
      ...shop,
      createdAt: shop.createdAt.toISOString(),
    },
    metrics: {
      activeSubscriptions: activeSubscriptions.length,
      mrr,
      revenue,
      partnerEvents: eventRows.length,
      uninstallFeedback: feedbackRows.length,
      currencyCode: moneyCurrency.currencyCode,
      hasMixedCurrencies: moneyCurrency.hasMixedCurrencies,
      mrrCurrencyCode: mrrCurrency.currencyCode,
      mrrHasMixedCurrencies: mrrCurrency.hasMixedCurrencies,
      revenueCurrencyCode: revenueCurrency.currencyCode,
      revenueHasMixedCurrencies: revenueCurrency.hasMixedCurrencies,
    },
    relationships: relationshipRows.map((row) => ({
      ...row,
      installedAt: toIso(row.installedAt),
      uninstalledAt: toIso(row.uninstalledAt),
      reactivatedAt: toIso(row.reactivatedAt),
      deactivatedAt: toIso(row.deactivatedAt),
    })),
    subscriptions: subscriptionRows.map((row) => ({
      ...row,
      mrrAmount: monthlyRecurringAmount(row.mrrAmount, row.interval),
      acceptedAt: toIso(row.acceptedAt),
      activatedAt: toIso(row.activatedAt),
      canceledAt: toIso(row.canceledAt),
    })),
    activity,
    charts: {
      activitySeries: countByDate(activity, (row) => row.occurredAt),
      partnerEventSeries: countByDate(partnerActivity, (row) => row.occurredAt),
      uninstallFeedbackSeries: countByDate(
        uninstallFeedbackActivity,
        (row) => row.occurredAt,
      ),
      activityMixChart: sumByGroup(
        activity,
        (row) => row.kind,
        () => 1,
      ),
    },
  }
}
