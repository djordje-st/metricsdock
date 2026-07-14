import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ActivityIcon, CircleDollarSignIcon, UsersIcon } from 'lucide-react'
import { AppShell } from '#/components/app-shell.tsx'
import { DateRangePicker } from '#/components/date-range-picker.tsx'
import { MetricPanel } from '#/components/metric-card.tsx'
import type { DateRangeValue } from '#/lib/date-range.ts'
import {
  normalizeDateRangeSearch,
  normalizeReportLoaderSearch,
  normalizeReportSearch,
} from '#/lib/date-range.ts'
import { formatMoneyMetric, formatNumber, formatPercent } from '#/lib/format.ts'
import { Button } from '#/components/ui/button.tsx'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#/components/ui/empty.tsx'
import { getDashboardAnalytics } from '#/server/app.functions.ts'

export const Route = createFileRoute('/dashboard')({
  ssr: false,
  validateSearch: normalizeReportSearch,
  loaderDeps: ({ search }) => normalizeReportLoaderSearch(search),
  loader: ({ deps }) => getDashboardAnalytics({ data: deps }),
  component: Dashboard,
})

function Dashboard() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  const dateRange = normalizeDateRangeSearch(search)
  const navigate = useNavigate({ from: '/dashboard' })
  const {
    activeInstallSeries,
    activeSubscriberSeries,
    installSeries,
    mrrSeries,
    reactivationSeries,
    runRateSeries,
    churnSeries,
    topReasonChart,
  } = data.charts

  function setDateRange(range: DateRangeValue) {
    void navigate({ search: (previous) => ({ ...previous, ...range }) })
  }

  function setReportAppIds(appIds: string[]) {
    void navigate({
      search: (previous) => {
        const { appIds: _appIds, ...next } = previous

        return appIds.length === data.apps.length ? next : { ...next, appIds }
      },
    })
  }

  const activeSubscriberParts: string[] = []

  if (data.metrics.monthlySubscriptions) {
    activeSubscriberParts.push(
      `${formatNumber(data.metrics.monthlySubscriptions)} monthly`,
    )
  }

  if (data.metrics.annualSubscriptions) {
    activeSubscriberParts.push(
      `${formatNumber(data.metrics.annualSubscriptions)} annual`,
    )
  }

  if (data.metrics.unknownIntervalSubscriptions) {
    activeSubscriberParts.push(
      `${formatNumber(data.metrics.unknownIntervalSubscriptions)} unknown interval`,
    )
  }

  const activeSubscriberDescription =
    activeSubscriberParts.join(', ') || 'billing interval unavailable'
  const mrrMoney = (value: number | string | null | undefined) =>
    formatMoneyMetric(value, {
      currencyCode: data.metrics.mrrCurrencyCode,
      hasMixedCurrencies: data.metrics.mrrHasMixedCurrencies,
    })
  const revenueMoney = (value: number | string | null | undefined) =>
    formatMoneyMetric(value, {
      currencyCode: data.metrics.revenueCurrencyCode,
      hasMixedCurrencies: data.metrics.revenueHasMixedCurrencies,
    })
  const usageRevenueMoney = (value: number | string | null | undefined) =>
    formatMoneyMetric(value, {
      currencyCode: data.metrics.usageRevenueCurrencyCode,
      hasMixedCurrencies: data.metrics.usageRevenueHasMixedCurrencies,
    })
  const runRateMoney = (value: number | string | null | undefined) =>
    formatMoneyMetric(value, {
      currencyCode: data.metrics.runRateCurrencyCode,
      hasMixedCurrencies: data.metrics.runRateHasMixedCurrencies,
    })
  const revenueSeries = data.metrics.revenueHasMixedCurrencies
    ? []
    : data.revenueSeries
  const usageRevenueSeries = data.metrics.usageRevenueHasMixedCurrencies
    ? []
    : data.usageRevenueSeries
  const mrrTrendSeries = data.metrics.mrrHasMixedCurrencies ? null : mrrSeries
  const runRateTrendSeries = data.metrics.runRateHasMixedCurrencies
    ? null
    : runRateSeries
  const topReason = topReasonChart.at(0)
  return (
    <AppShell
      title="Overview"
      description="A clear summary of revenue, customers, and churn."
      apps={data.apps}
      reportAppFilter={{
        selectedAppIds: search.appIds,
        onChange: setReportAppIds,
      }}
      headerActions={
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      }
    >
      {data.apps.length ? (
        <div className="grid gap-4 grid-cols-1">
          <MetricPanel
            title="Revenue"
            description="Recurring revenue and money earned this period."
            action={
              <Button
                variant="outline"
                render={<Link to="/reports/revenue" preload="intent" />}
              >
                <CircleDollarSignIcon data-icon="inline-start" />
                Revenue report
              </Button>
            }
            metrics={[
              {
                label: 'Estimated monthly revenue',
                value: runRateMoney(data.metrics.runRate),
                description: 'recurring revenue plus usage revenue',
                tooltip:
                  'Current monthly recurring revenue plus usage-based revenue estimated over 30 days.',
                trend: runRateTrendSeries,
              },
              {
                label: 'Recurring revenue',
                value: mrrMoney(data.metrics.mrr),
                description: 'active paid subscriptions',
                tooltip:
                  'Monthly recurring revenue from active, non-test subscriptions.',
                trend: mrrTrendSeries,
              },
              {
                label: 'Revenue this period',
                value: revenueMoney(data.metrics.revenue),
                description: 'money recorded by Shopify',
                tooltip:
                  'Net revenue recorded by Shopify in the current period.',
                trend: revenueSeries,
              },
              {
                label: 'Usage revenue',
                value: usageRevenueMoney(data.metrics.usageRevenue),
                description: 'metered revenue this period',
                tooltip:
                  'Revenue from usage-based charges in the current period.',
                trend: usageRevenueSeries,
              },
            ]}
          />

          <MetricPanel
            title="Customers"
            description="Stores using your apps and how that changed."
            action={
              <Button
                variant="outline"
                render={<Link to="/reports/customers" preload="intent" />}
              >
                <UsersIcon data-icon="inline-start" />
                Customer report
              </Button>
            }
            metrics={[
              {
                label: 'Active stores',
                value: formatNumber(data.metrics.activeInstalls),
                description: 'currently installed shops',
                tooltip:
                  'Stores that currently have one of your connected apps installed.',
                trend: activeInstallSeries,
              },
              {
                label: 'Active subscribers',
                value: formatNumber(data.metrics.activeSubscribers),
                description: activeSubscriberDescription,
                tooltip:
                  'Stores with at least one active, non-test paid subscription.',
                trend: activeSubscriberSeries,
              },
              {
                label: 'Installs',
                value: formatNumber(data.metrics.installs),
                description: 'new stores this period',
                tooltip:
                  'Stores that installed a connected app in the current period.',
                trend: installSeries,
              },
              {
                label: 'Reactivations',
                value: formatNumber(data.metrics.reactivations),
                description: 'shops that came back',
                tooltip:
                  'Stores that reinstalled or reactivated a connected app in the current period.',
                trend: reactivationSeries,
              },
            ]}
          />

          <MetricPanel
            title="Churn"
            description="Stores lost and the most common reason."
            columns={3}
            action={
              <Button
                variant="outline"
                render={<Link to="/reports/churn" preload="intent" />}
              >
                <ActivityIcon data-icon="inline-start" />
                Churn report
              </Button>
            }
            metrics={[
              {
                label: 'Monthly churn',
                value: formatPercent(data.metrics.monthlyChurnRate),
                description: 'share of stores lost',
                tooltip:
                  'Stores that uninstalled in this period compared with active stores plus those uninstalls.',
                trend: churnSeries,
                tone: 'negative',
              },
              {
                label: 'Uninstalls',
                value: formatNumber(data.metrics.uninstalls),
                description: 'stores lost this period',
                tooltip:
                  'Stores that uninstalled a connected app in the current period.',
                trend: churnSeries,
                tone: 'negative',
              },
              {
                label: 'Top reason',
                value: topReason?.name ?? '-',
                description: topReason
                  ? `${formatNumber(topReason.value)} matching comments`
                  : 'No reason feedback yet',
                tooltip:
                  'Most common grouped uninstall reason in the current period.',
                trend: null,
              },
            ]}
          />
        </div>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No Partner app connected</EmptyTitle>
            <EmptyDescription>
              Add a Shopify Partner organization, token, and app ID to start
              syncing.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button render={<Link to="/settings/connections" />}>
              Connect app
            </Button>
          </EmptyContent>
        </Empty>
      )}
    </AppShell>
  )
}
