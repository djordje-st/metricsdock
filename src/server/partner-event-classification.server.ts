export const SHOPIFY_PARTNER_APP_EVENT = {
  CREDIT_APPLIED: 'CREDIT_APPLIED',
  CREDIT_FAILED: 'CREDIT_FAILED',
  CREDIT_PENDING: 'CREDIT_PENDING',
  ONE_TIME_CHARGE_ACCEPTED: 'ONE_TIME_CHARGE_ACCEPTED',
  ONE_TIME_CHARGE_ACTIVATED: 'ONE_TIME_CHARGE_ACTIVATED',
  ONE_TIME_CHARGE_DECLINED: 'ONE_TIME_CHARGE_DECLINED',
  ONE_TIME_CHARGE_EXPIRED: 'ONE_TIME_CHARGE_EXPIRED',
  RELATIONSHIP_DEACTIVATED: 'RELATIONSHIP_DEACTIVATED',
  RELATIONSHIP_INSTALLED: 'RELATIONSHIP_INSTALLED',
  RELATIONSHIP_REACTIVATED: 'RELATIONSHIP_REACTIVATED',
  RELATIONSHIP_UNINSTALLED: 'RELATIONSHIP_UNINSTALLED',
  SUBSCRIPTION_APPROACHING_CAPPED_AMOUNT:
    'SUBSCRIPTION_APPROACHING_CAPPED_AMOUNT',
  SUBSCRIPTION_CAPPED_AMOUNT_UPDATED: 'SUBSCRIPTION_CAPPED_AMOUNT_UPDATED',
  SUBSCRIPTION_CHARGE_ACCEPTED: 'SUBSCRIPTION_CHARGE_ACCEPTED',
  SUBSCRIPTION_CHARGE_ACTIVATED: 'SUBSCRIPTION_CHARGE_ACTIVATED',
  SUBSCRIPTION_CHARGE_CANCELED: 'SUBSCRIPTION_CHARGE_CANCELED',
  SUBSCRIPTION_CHARGE_DECLINED: 'SUBSCRIPTION_CHARGE_DECLINED',
  SUBSCRIPTION_CHARGE_EXPIRED: 'SUBSCRIPTION_CHARGE_EXPIRED',
  SUBSCRIPTION_CHARGE_FROZEN: 'SUBSCRIPTION_CHARGE_FROZEN',
  SUBSCRIPTION_CHARGE_UNFROZEN: 'SUBSCRIPTION_CHARGE_UNFROZEN',
  USAGE_CHARGE_APPLIED: 'USAGE_CHARGE_APPLIED',
} as const

export const SHOPIFY_PARTNER_TRANSACTION_TYPE = {
  APP_ONE_TIME_SALE: 'APP_ONE_TIME_SALE',
  APP_SALE_ADJUSTMENT: 'APP_SALE_ADJUSTMENT',
  APP_SALE_CREDIT: 'APP_SALE_CREDIT',
  APP_SUBSCRIPTION_SALE: 'APP_SUBSCRIPTION_SALE',
  APP_USAGE_SALE: 'APP_USAGE_SALE',
  LEGACY: 'LEGACY',
  REFERRAL: 'REFERRAL',
  REFERRAL_ADJUSTMENT: 'REFERRAL_ADJUSTMENT',
  SERVICE_SALE: 'SERVICE_SALE',
  SERVICE_SALE_ADJUSTMENT: 'SERVICE_SALE_ADJUSTMENT',
  TAX: 'TAX',
  THEME_SALE: 'THEME_SALE',
  THEME_SALE_ADJUSTMENT: 'THEME_SALE_ADJUSTMENT',
} as const

export const SHOPIFY_PARTNER_APP_PRICING_INTERVAL = {
  ANNUAL: 'ANNUAL',
  EVERY_30_DAYS: 'EVERY_30_DAYS',
} as const

export type ShopifyPartnerAppEventType =
  (typeof SHOPIFY_PARTNER_APP_EVENT)[keyof typeof SHOPIFY_PARTNER_APP_EVENT]
export type ShopifyPartnerTransactionType =
  (typeof SHOPIFY_PARTNER_TRANSACTION_TYPE)[keyof typeof SHOPIFY_PARTNER_TRANSACTION_TYPE]
export type ShopifyPartnerAppPricingInterval =
  (typeof SHOPIFY_PARTNER_APP_PRICING_INTERVAL)[keyof typeof SHOPIFY_PARTNER_APP_PRICING_INTERVAL]

export type RelationshipClassification = {
  status: 'installed' | 'uninstalled' | 'deactivated'
  isInstalled: boolean
  isUninstalled: boolean
  isReactivated: boolean
  isDeactivated: boolean
}

export type SubscriptionStatus = 'accepted' | 'active' | 'canceled'

export type IntervalKind = 'monthly' | 'annual' | 'unknown'

const appEventTypes = new Set<string>(Object.values(SHOPIFY_PARTNER_APP_EVENT))
const transactionTypes = new Set<string>(
  Object.values(SHOPIFY_PARTNER_TRANSACTION_TYPE),
)
const appPricingIntervals = new Set<string>(
  Object.values(SHOPIFY_PARTNER_APP_PRICING_INTERVAL),
)

const transactionTypenameToType: Partial<
  Record<string, ShopifyPartnerTransactionType>
> = {
  AppOneTimeSale: SHOPIFY_PARTNER_TRANSACTION_TYPE.APP_ONE_TIME_SALE,
  AppSaleAdjustment: SHOPIFY_PARTNER_TRANSACTION_TYPE.APP_SALE_ADJUSTMENT,
  AppSaleCredit: SHOPIFY_PARTNER_TRANSACTION_TYPE.APP_SALE_CREDIT,
  AppSubscriptionSale: SHOPIFY_PARTNER_TRANSACTION_TYPE.APP_SUBSCRIPTION_SALE,
  AppUsageSale: SHOPIFY_PARTNER_TRANSACTION_TYPE.APP_USAGE_SALE,
  TaxTransaction: SHOPIFY_PARTNER_TRANSACTION_TYPE.TAX,
}

const relationshipEvents: Partial<
  Record<ShopifyPartnerAppEventType, RelationshipClassification>
> = {
  [SHOPIFY_PARTNER_APP_EVENT.RELATIONSHIP_DEACTIVATED]: {
    status: 'deactivated',
    isInstalled: false,
    isUninstalled: false,
    isReactivated: false,
    isDeactivated: true,
  },
  [SHOPIFY_PARTNER_APP_EVENT.RELATIONSHIP_INSTALLED]: {
    status: 'installed',
    isInstalled: true,
    isUninstalled: false,
    isReactivated: false,
    isDeactivated: false,
  },
  [SHOPIFY_PARTNER_APP_EVENT.RELATIONSHIP_REACTIVATED]: {
    status: 'installed',
    isInstalled: false,
    isUninstalled: false,
    isReactivated: true,
    isDeactivated: false,
  },
  [SHOPIFY_PARTNER_APP_EVENT.RELATIONSHIP_UNINSTALLED]: {
    status: 'uninstalled',
    isInstalled: false,
    isUninstalled: true,
    isReactivated: false,
    isDeactivated: false,
  },
}

const subscriptionEvents: Partial<
  Record<ShopifyPartnerAppEventType, SubscriptionStatus>
> = {
  [SHOPIFY_PARTNER_APP_EVENT.SUBSCRIPTION_CHARGE_ACCEPTED]: 'accepted',
  [SHOPIFY_PARTNER_APP_EVENT.SUBSCRIPTION_CHARGE_ACTIVATED]: 'active',
  [SHOPIFY_PARTNER_APP_EVENT.SUBSCRIPTION_CHARGE_CANCELED]: 'canceled',
}

const intervalAliases: Partial<
  Record<string, ShopifyPartnerAppPricingInterval>
> = {
  MONTH: SHOPIFY_PARTNER_APP_PRICING_INTERVAL.EVERY_30_DAYS,
  MONTHLY: SHOPIFY_PARTNER_APP_PRICING_INTERVAL.EVERY_30_DAYS,
  YEAR: SHOPIFY_PARTNER_APP_PRICING_INTERVAL.ANNUAL,
  YEARLY: SHOPIFY_PARTNER_APP_PRICING_INTERVAL.ANNUAL,
}

function enumCase(value: string) {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
}

export function normalizePartnerAppEventType(type: string | null | undefined) {
  if (!type) return null

  const normalized = enumCase(type)

  return appEventTypes.has(normalized)
    ? (normalized as ShopifyPartnerAppEventType)
    : null
}

export function normalizePartnerTransactionType(
  type: string | null | undefined,
) {
  if (!type) return null

  const trimmed = type.trim()
  const typename = transactionTypenameToType[trimmed]

  if (typename) return typename

  const normalized = enumCase(trimmed)

  return transactionTypes.has(normalized)
    ? (normalized as ShopifyPartnerTransactionType)
    : null
}

export function normalizePartnerAppPricingInterval(
  interval: string | null | undefined,
) {
  if (!interval) return null

  const normalized = enumCase(interval)

  if (appPricingIntervals.has(normalized)) {
    return normalized as ShopifyPartnerAppPricingInterval
  }

  return intervalAliases[normalized] ?? null
}

export function classifyRelationshipEvent(
  type: string,
): RelationshipClassification | null {
  const normalized = normalizePartnerAppEventType(type)

  return normalized ? (relationshipEvents[normalized] ?? null) : null
}

export function classifySubscriptionEvent(
  type: string,
): SubscriptionStatus | null {
  const normalized = normalizePartnerAppEventType(type)

  return normalized ? (subscriptionEvents[normalized] ?? null) : null
}

export function isPartnerUninstallEvent(type: string) {
  return classifyRelationshipEvent(type)?.isUninstalled ?? false
}

export function isUsageTransaction(type: string) {
  return (
    normalizePartnerTransactionType(type) ===
    SHOPIFY_PARTNER_TRANSACTION_TYPE.APP_USAGE_SALE
  )
}

export function intervalKind(
  interval: string | null | undefined,
): IntervalKind {
  const normalized = normalizePartnerAppPricingInterval(interval)

  if (normalized === SHOPIFY_PARTNER_APP_PRICING_INTERVAL.ANNUAL) {
    return 'annual'
  }

  if (normalized === SHOPIFY_PARTNER_APP_PRICING_INTERVAL.EVERY_30_DAYS) {
    return 'monthly'
  }

  return 'unknown'
}

export function monthlyRecurringAmount(
  amount: string | number | null | undefined,
  interval: string | null | undefined,
) {
  const value = Number(amount ?? 0)

  if (intervalKind(interval) === 'annual') return value / 12

  return value
}
