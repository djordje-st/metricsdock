import {
  classifyRelationshipEvent,
  classifySubscriptionEvent,
  monthlyRecurringAmount,
} from '#/server/partner-event-classification.server.ts'

export type LifecycleEvent = {
  type: string
  occurredAt: string
}

export function reduceLifecycle(events: Array<LifecycleEvent>) {
  const state = {
    status: 'none',
    installs: 0,
    uninstalls: 0,
    reactivations: 0,
  }

  for (const event of [...events].sort((a, b) =>
    a.occurredAt.localeCompare(b.occurredAt),
  )) {
    const relationship = classifyRelationshipEvent(event.type)

    if (relationship?.isUninstalled) {
      state.status = 'uninstalled'
      state.uninstalls += 1
    } else if (relationship?.isReactivated) {
      state.status = 'installed'
      state.reactivations += 1
    } else if (relationship?.isInstalled) {
      state.status = 'installed'
      state.installs += 1
    }
  }

  return state
}

export type MrrEvent = {
  shopId: string
  type: string
  amount: number
  occurredAt: string
}

export function reduceMrr(events: Array<MrrEvent>) {
  const current = new Map<string, number>()
  let newMrr = 0
  let expansion = 0
  let contraction = 0
  let cancellation = 0

  for (const event of [...events].sort((a, b) =>
    a.occurredAt.localeCompare(b.occurredAt),
  )) {
    const previous = current.get(event.shopId) ?? 0
    const status = classifySubscriptionEvent(event.type)

    if (status === 'canceled') {
      cancellation += previous
      current.delete(event.shopId)
      continue
    }

    if (status !== 'accepted' && status !== 'active') continue

    if (previous === 0) newMrr += event.amount
    else if (event.amount > previous) expansion += event.amount - previous
    else if (event.amount < previous) contraction += previous - event.amount

    current.set(event.shopId, event.amount)
  }

  const mrr = [...current.values()].reduce((sum, value) => sum + value, 0)
  return { mrr, newMrr, expansion, contraction, cancellation }
}

export type MrrMovementKind =
  | 'new'
  | 'reactivation'
  | 'expansion'
  | 'contraction'
  | 'cancellation'

export type MrrBridgeEvent = {
  key: string
  appId: string
  appName: string
  shopId: number | null
  shopDomain: string | null
  shopName: string | null
  chargeId: string
  planName: string | null
  interval: string | null
  type: string
  amount: number
  currencyCode: string | null
  isTest: boolean
  occurredAt: string
}

export type MrrBridgeRow = {
  id: string
  kind: MrrMovementKind
  appId: string
  appName: string
  shopId: number | null
  shopDomain: string | null
  shopName: string | null
  chargeId: string
  planName: string | null
  interval: string | null
  type: string
  currencyCode: string | null
  occurredAt: string
  previousMrr: number
  nextMrr: number
  delta: number
}

export function buildMrrMovementBridge({
  events,
  startDate,
  endDate,
}: {
  events: MrrBridgeEvent[]
  startDate: string
  endDate: string
}) {
  const current = new Map<string, number>()
  const hadPositiveMrr = new Set<string>()
  const sortedEvents = events
    .filter((event) => !event.isTest)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
  const priorEvents = sortedEvents.filter(
    (event) => event.occurredAt < startDate,
  )
  const windowEvents = sortedEvents.filter(
    (event) => event.occurredAt >= startDate && event.occurredAt < endDate,
  )
  const rows: MrrBridgeRow[] = []

  for (const event of priorEvents) {
    applyMrrBridgeEvent({
      current,
      event,
      hadPositiveMrr,
      rows,
      shouldRecord: false,
    })
  }

  const startingMrr = sumCurrentMrr(current)
  // The subscriptions paying as of `start` — the cohort for churn. Snapshot now,
  // before window events mutate `current`.
  const startCohort = new Map(current)

  for (const event of windowEvents) {
    applyMrrBridgeEvent({
      current,
      event,
      hadPositiveMrr,
      rows,
      shouldRecord: true,
    })
  }

  const endingMrr = sumCurrentMrr(current)
  // Cohort churn: starting subscriptions no longer paying at the end of the
  // window. A subscription that left and came back nets out (it's active again).
  let cohortChurnedCount = 0
  let cohortChurnedMrr = 0
  let cohortEndingMrr = 0
  for (const [key, mrr] of startCohort) {
    const endingCohortMrr = current.get(key) ?? 0

    if (endingCohortMrr <= 0) {
      cohortChurnedCount += 1
      cohortChurnedMrr += mrr
    } else {
      cohortEndingMrr += endingCohortMrr
    }
  }
  const summary = rows.reduce(
    (currentSummary, row) => {
      const amount = Math.abs(row.delta)

      if (row.kind === 'new') currentSummary.newMrr += amount
      if (row.kind === 'reactivation') currentSummary.reactivation += amount
      if (row.kind === 'expansion') currentSummary.expansion += amount
      if (row.kind === 'contraction') currentSummary.contraction += amount
      if (row.kind === 'cancellation') currentSummary.cancellation += amount

      return currentSummary
    },
    {
      startingMrr,
      endingMrr,
      newMrr: 0,
      reactivation: 0,
      expansion: 0,
      contraction: 0,
      cancellation: 0,
      netMrr: endingMrr - startingMrr,
      startingSubscriptions: startCohort.size,
      cohortChurnedCount,
      cohortChurnedMrr,
      cohortEndingMrr,
      cohortNetMrrLoss: startingMrr - cohortEndingMrr,
    },
  )

  return { rows, summary }
}

function applyMrrBridgeEvent({
  current,
  event,
  hadPositiveMrr,
  rows,
  shouldRecord,
}: {
  current: Map<string, number>
  event: MrrBridgeEvent
  hadPositiveMrr: Set<string>
  rows: MrrBridgeRow[]
  shouldRecord: boolean
}) {
  const status = classifySubscriptionEvent(event.type)
  const previousMrr = current.get(event.key) ?? 0

  if (status === 'accepted') return

  if (status === 'canceled') {
    if (previousMrr <= 0) return

    current.delete(event.key)
    if (shouldRecord) {
      rows.push(
        mrrBridgeRow(event, 'cancellation', previousMrr, 0, -previousMrr),
      )
    }
    return
  }

  if (status !== 'active') return

  const nextMrr = monthlyRecurringAmount(event.amount, event.interval)
  let kind: MrrMovementKind | null = null

  if (previousMrr === 0 && nextMrr > 0) {
    kind = hadPositiveMrr.has(event.key) ? 'reactivation' : 'new'
  } else if (nextMrr > previousMrr) {
    kind = 'expansion'
  } else if (nextMrr < previousMrr) {
    kind = 'contraction'
  }

  if (nextMrr > 0) {
    current.set(event.key, nextMrr)
    hadPositiveMrr.add(event.key)
  } else {
    current.delete(event.key)
  }

  if (shouldRecord && kind) {
    rows.push(
      mrrBridgeRow(event, kind, previousMrr, nextMrr, nextMrr - previousMrr),
    )
  }
}

function mrrBridgeRow(
  event: MrrBridgeEvent,
  kind: MrrMovementKind,
  previousMrr: number,
  nextMrr: number,
  delta: number,
): MrrBridgeRow {
  return {
    id: `${event.key}:${event.occurredAt}:${kind}`,
    kind,
    appId: event.appId,
    appName: event.appName,
    shopId: event.shopId,
    shopDomain: event.shopDomain,
    shopName: event.shopName,
    chargeId: event.chargeId,
    planName: event.planName,
    interval: event.interval,
    type: event.type,
    currencyCode: event.currencyCode,
    occurredAt: event.occurredAt,
    previousMrr,
    nextMrr,
    delta,
  }
}

function sumCurrentMrr(current: Map<string, number>) {
  return [...current.values()].reduce((sum, value) => sum + value, 0)
}

// Period churn + growth rates, returned as fractions (0.0531 -> 5.31%) or null
// when there's no base to divide by.
//
// Churn is cohort-based: of the subscriptions / stores / MRR active at the START
// of the period, the share that was no longer active at the END. Subscriptions
// both created and cancelled within the window never enter the cohort. Net
// revenue churn can be negative when cohort expansion outweighs losses.
// Reactivations net out naturally — a cohort member that left and came back is
// not counted as lost.
//
// MRR growth is separate: net MRR movement over the period (from the bridge),
// which legitimately includes within-window signups.
export function computeChurnRates({
  bridge,
  logoCohort,
}: {
  bridge: ReturnType<typeof buildMrrMovementBridge>
  logoCohort: { startingCount: number; churnedCount: number }
}) {
  const {
    netMrr,
    startingMrr,
    startingSubscriptions,
    cohortChurnedCount,
    cohortNetMrrLoss,
  } = bridge.summary
  const rate = (numerator: number, base: number) =>
    base > 0 ? numerator / base : null

  return {
    mrrGrowthRate: rate(netMrr, startingMrr),
    netRevenueChurnRate: rate(cohortNetMrrLoss, startingMrr),
    netSubscriptionChurnRate: rate(cohortChurnedCount, startingSubscriptions),
    netLogoChurnRate: rate(logoCohort.churnedCount, logoCohort.startingCount),
  }
}
