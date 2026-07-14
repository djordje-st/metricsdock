import assert from 'node:assert/strict'
import {
  classifyRelationshipEvent,
  classifySubscriptionEvent,
  intervalKind,
  isPartnerUninstallEvent,
  isUsageTransaction,
  monthlyRecurringAmount,
  normalizePartnerAppPricingInterval,
  normalizePartnerTransactionType,
} from '../src/server/partner-event-classification.server.ts'
import { reduceLifecycle, reduceMrr } from '../src/server/analytics-reducers.ts'

assert.deepEqual(classifyRelationshipEvent('RELATIONSHIP_INSTALLED'), {
  status: 'installed',
  isInstalled: true,
  isUninstalled: false,
  isReactivated: false,
  isDeactivated: false,
})
assert.equal(
  classifyRelationshipEvent('RELATIONSHIP_UNINSTALLED')?.status,
  'uninstalled',
)
assert.equal(
  classifyRelationshipEvent('RELATIONSHIP_REACTIVATED')?.isReactivated,
  true,
)
assert.equal(
  classifyRelationshipEvent('RELATIONSHIP_DEACTIVATED')?.status,
  'deactivated',
)
assert.equal(isPartnerUninstallEvent('RELATIONSHIP_UNINSTALLED'), true)

assert.equal(
  classifySubscriptionEvent('SUBSCRIPTION_CHARGE_ACCEPTED'),
  'accepted',
)
assert.equal(
  classifySubscriptionEvent('SUBSCRIPTION_CHARGE_ACTIVATED'),
  'active',
)
assert.equal(
  classifySubscriptionEvent('SUBSCRIPTION_CHARGE_CANCELED'),
  'canceled',
)

assert.equal(intervalKind('EVERY_30_DAYS'), 'monthly')
assert.equal(intervalKind('ANNUAL'), 'annual')
assert.equal(intervalKind('monthly'), 'monthly')
assert.equal(normalizePartnerAppPricingInterval('monthly'), 'EVERY_30_DAYS')
assert.equal(monthlyRecurringAmount('120', 'ANNUAL'), 10)
assert.equal(monthlyRecurringAmount('19', 'monthly'), 19)
assert.equal(isUsageTransaction('AppUsageSale'), true)
assert.equal(isUsageTransaction('APP_USAGE_SALE'), true)
assert.equal(
  normalizePartnerTransactionType('AppSubscriptionSale'),
  'APP_SUBSCRIPTION_SALE',
)

assert.deepEqual(
  reduceLifecycle([
    { type: 'RELATIONSHIP_INSTALLED', occurredAt: '2026-01-01T00:00:00Z' },
    { type: 'RELATIONSHIP_UNINSTALLED', occurredAt: '2026-01-02T00:00:00Z' },
    { type: 'RELATIONSHIP_REACTIVATED', occurredAt: '2026-01-03T00:00:00Z' },
  ]),
  { status: 'installed', installs: 1, uninstalls: 1, reactivations: 1 },
)

assert.deepEqual(
  reduceMrr([
    {
      shopId: 'shop-a',
      type: 'SUBSCRIPTION_CHARGE_ACCEPTED',
      amount: 20,
      occurredAt: '2026-01-01T00:00:00Z',
    },
    {
      shopId: 'shop-a',
      type: 'SUBSCRIPTION_CHARGE_ACTIVATED',
      amount: 30,
      occurredAt: '2026-01-02T00:00:00Z',
    },
    {
      shopId: 'shop-a',
      type: 'SUBSCRIPTION_CHARGE_CANCELED',
      amount: 0,
      occurredAt: '2026-01-03T00:00:00Z',
    },
  ]),
  { mrr: 0, newMrr: 20, expansion: 10, contraction: 0, cancellation: 30 },
)

console.log('Partner event classification fixtures passed')
