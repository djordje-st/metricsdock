import { useMemo } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { AppShell } from '#/components/app-shell.tsx'
import { DataTable, DataTableColumnHeader } from '#/components/data-table.tsx'
import { DateRangePicker } from '#/components/date-range-picker.tsx'
import { MetricPanel } from '#/components/metric-card.tsx'
import { ReportChart } from '#/components/report-chart.tsx'
import type { DateRangeValue } from '#/lib/date-range.ts'
import {
  normalizeDateRangeSearch,
  normalizeReportLoaderSearch,
  normalizeReportSearch,
} from '#/lib/date-range.ts'
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatMoneyMetric,
  formatNumber,
  formatPercent,
} from '#/lib/format.ts'
import { formatShopifyId } from '#/lib/shopify-id.ts'
import { Badge } from '#/components/ui/badge.tsx'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card.tsx'
import { getRevenueReport } from '#/server/app.functions.ts'

export const Route = createFileRoute('/reports/revenue')({
  ssr: false,
  validateSearch: normalizeReportSearch,
  loaderDeps: ({ search }) => normalizeReportLoaderSearch(search),
  loader: ({ deps }) => getRevenueReport({ data: deps }),
  component: RevenueReport,
})

type TransactionRow = {
  type: string
  createdAt: string
  currencyCode: string | null
  netAmount: string | null
  grossAmount: string | null
}

type MrrMovementKind =
  | 'new'
  | 'reactivation'
  | 'expansion'
  | 'contraction'
  | 'cancellation'

type MrrMovementRow = {
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

type DateSeriesPoint = { date: string; value: number }

function movementSeries(
  rows: MrrMovementRow[],
  kind: MrrMovementKind,
): DateSeriesPoint[] {
  const series = new Map<string, number>()

  for (const row of rows) {
    if (row.kind !== kind) continue

    const date = row.occurredAt.slice(0, 10)
    series.set(date, (series.get(date) ?? 0) + row.delta)
  }

  return [...series.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }))
}

const transactionColumns: ColumnDef<TransactionRow>[] = [
  {
    accessorKey: 'createdAt',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Date" />
    ),
    cell: ({ row }) => formatDate(row.original.createdAt),
  },
  {
    accessorKey: 'type',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Activity" />
    ),
  },
  {
    accessorKey: 'currencyCode',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Currency" />
    ),
    cell: ({ row }) => row.original.currencyCode ?? '-',
  },
  {
    id: 'netAmount',
    accessorFn: (row) => Number(row.netAmount ?? 0),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Net amount" />
    ),
    cell: ({ row }) =>
      formatCurrency(row.original.netAmount ?? 0, {
        currency: row.original.currencyCode,
      }),
  },
  {
    id: 'grossAmount',
    accessorFn: (row) => Number(row.grossAmount ?? 0),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Gross amount" />
    ),
    cell: ({ row }) =>
      formatCurrency(row.original.grossAmount ?? 0, {
        currency: row.original.currencyCode,
      }),
  },
]

const mrrMovementColumns: ColumnDef<MrrMovementRow>[] = [
  {
    accessorKey: 'occurredAt',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="When" />
    ),
    cell: ({ row }) => formatDateTime(row.original.occurredAt),
  },
  {
    accessorKey: 'kind',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Change" />
    ),
    cell: ({ row }) => <MovementBadge kind={row.original.kind} />,
  },
  {
    accessorKey: 'appName',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="App" />
    ),
    cell: ({ row }) => (
      <Link
        to="/apps/$appId"
        params={{ appId: row.original.appId }}
        className="block max-w-48 truncate font-medium hover:underline"
      >
        {row.original.appName}
      </Link>
    ),
  },
  {
    accessorKey: 'shopDomain',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Shop" />
    ),
    cell: ({ row }) => (
      <ShopCell
        shopId={row.original.shopId}
        shopDomain={row.original.shopDomain}
        shopName={row.original.shopName}
      />
    ),
  },
  {
    accessorKey: 'planName',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Plan" />
    ),
    cell: ({ row }) => (
      <div className="flex min-w-44 flex-col">
        <span className="max-w-56 truncate font-medium">
          {row.original.planName ?? 'Unnamed plan'}
        </span>
        <span className="max-w-56 truncate text-xs text-muted-foreground">
          Subscription {formatShopifyId(row.original.chargeId)}
        </span>
      </div>
    ),
  },
  {
    accessorKey: 'interval',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Interval" />
    ),
    cell: ({ row }) => row.original.interval ?? 'Unknown',
  },
  {
    accessorKey: 'delta',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Change" />
    ),
    cell: ({ row }) => movementCurrency(row.original, row.original.delta),
  },
  {
    id: 'after',
    accessorFn: (row) => row.nextMrr,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Revenue after" />
    ),
    cell: ({ row }) => movementCurrency(row.original, row.original.nextMrr),
  },
]

function RevenueReport() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  const dateRange = normalizeDateRangeSearch(search)
  const navigate = useNavigate({ from: '/reports/revenue' })
  const bridgeSummary = data.mrrBridge.summary
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
  const mrrMovementSeries = data.metrics.mrrHasMixedCurrencies
    ? null
    : data.mrrMovementSeries
  const mrrTrendSeries = data.metrics.mrrHasMixedCurrencies
    ? null
    : data.mrrSeries
  const runRateTrendSeries = data.metrics.runRateHasMixedCurrencies
    ? null
    : data.runRateSeries
  const {
    newRevenueSeries,
    expansionSeries,
    reactivationSeries,
    contractionSeries,
    cancellationSeries,
  } = useMemo(() => {
    if (data.metrics.mrrHasMixedCurrencies) {
      return {
        newRevenueSeries: null,
        expansionSeries: null,
        reactivationSeries: null,
        contractionSeries: null,
        cancellationSeries: null,
      }
    }

    return {
      newRevenueSeries: movementSeries(data.mrrBridge.rows, 'new'),
      expansionSeries: movementSeries(data.mrrBridge.rows, 'expansion'),
      reactivationSeries: movementSeries(data.mrrBridge.rows, 'reactivation'),
      contractionSeries: movementSeries(data.mrrBridge.rows, 'contraction'),
      cancellationSeries: movementSeries(data.mrrBridge.rows, 'cancellation'),
    }
  }, [data.metrics.mrrHasMixedCurrencies, data.mrrBridge.rows])

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

  return (
    <AppShell
      title="Revenue"
      description="Recurring revenue, usage revenue, and Shopify revenue activity."
      apps={data.apps}
      reportAppFilter={{
        selectedAppIds: search.appIds,
        onChange: setReportAppIds,
      }}
      headerActions={
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      }
    >
      <MetricPanel
        title="Revenue summary"
        description="Recurring revenue, revenue this period, and usage revenue in one place."
        columns={6}
        metrics={[
          {
            label: 'Recurring revenue',
            tooltip:
              'Monthly recurring revenue from active, non-test subscriptions.',
            value: mrrMoney(data.metrics.mrr),
            trend: mrrTrendSeries,
          },
          {
            label: 'MRR growth',
            tooltip:
              'Net MRR movement over the period (new, expansion and reactivation minus contraction and cancellation) versus MRR at the start.',
            value: formatPercent(data.metrics.mrrGrowthRate),
            trend: null,
          },
          {
            label: 'Revenue',
            tooltip:
              'Net revenue Shopify recorded in the selected period. Uses gross amount when net is missing.',
            value: revenueMoney(data.metrics.revenue),
            trend: revenueSeries,
          },
          {
            label: 'Usage revenue',
            tooltip: 'Revenue from usage-based charges in the selected period.',
            value: usageRevenueMoney(data.metrics.usageRevenue),
            trend: usageRevenueSeries,
          },
          {
            label: 'Active subscriptions',
            tooltip: 'Active, non-test paid subscriptions.',
            value: formatNumber(data.metrics.activeSubscriptions),
            trend: data.activeSubscriptionSeries,
          },
          {
            label: 'Estimated monthly revenue',
            tooltip:
              'Current monthly recurring revenue plus usage-based revenue estimated over 30 days.',
            value: runRateMoney(data.metrics.runRate),
            trend: runRateTrendSeries,
          },
        ]}
      />
      <MetricPanel
        title="Subscription changes"
        description="How paid subscriptions changed recurring revenue in the selected period."
        columns={6}
        metrics={[
          {
            label: 'Net change',
            tooltip:
              'Ending recurring revenue minus starting recurring revenue for subscription changes in this period.',
            value: mrrMoney(bridgeSummary.netMrr),
            description: `Ends at ${mrrMoney(bridgeSummary.endingMrr)}`,
            trend: mrrMovementSeries,
            tone: bridgeSummary.netMrr < 0 ? 'negative' : 'default',
          },
          {
            label: 'New revenue',
            tooltip: 'Recurring revenue from newly active paid subscriptions.',
            value: mrrMoney(bridgeSummary.newMrr),
            trend: newRevenueSeries,
          },
          {
            label: 'Expansion',
            tooltip:
              'Increases in recurring revenue from existing active subscriptions.',
            value: mrrMoney(bridgeSummary.expansion),
            trend: expansionSeries,
          },
          {
            label: 'Reactivation',
            tooltip:
              'Recurring revenue from subscriptions that became active again.',
            value: mrrMoney(bridgeSummary.reactivation),
            trend: reactivationSeries,
          },
          {
            label: 'Contraction',
            tooltip:
              'Decreases in recurring revenue from existing active subscriptions.',
            value: mrrMoney(-bridgeSummary.contraction),
            trend: contractionSeries,
            tone: 'negative',
          },
          {
            label: 'Cancellation',
            tooltip: 'Recurring revenue lost when subscriptions were canceled.',
            value: mrrMoney(-bridgeSummary.cancellation),
            trend: cancellationSeries,
            tone: 'negative',
          },
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle>Revenue trend</CardTitle>
          <CardDescription>
            Net revenue recorded by Shopify each day.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReportChart data={revenueSeries} type="area" className="h-80" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Subscription revenue changes</CardTitle>
          <CardDescription>
            Daily recurring revenue gained or lost from subscriptions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReportChart
            data={mrrMovementSeries ?? []}
            type="bar"
            className="h-72"
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Subscription change details</CardTitle>
          <CardDescription>
            Subscription events behind the recurring revenue changes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={mrrMovementColumns}
            data={data.mrrBridge.rows}
            emptyMessage="No subscription changes found for this period."
            filterableColumns={[
              { id: 'kind', title: 'Change' },
              { id: 'appName', title: 'App' },
              {
                id: 'shopDomain',
                title: 'Shop',
                emptyLabel: 'Unknown shop',
              },
              {
                id: 'planName',
                title: 'Plan',
                emptyLabel: 'Unnamed plan',
              },
              {
                id: 'interval',
                title: 'Interval',
                emptyLabel: 'Unknown interval',
              },
            ]}
            sortParam="mrrMovementSort"
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Recent revenue activity</CardTitle>
          <CardDescription>
            Shopify revenue items from the current period.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={transactionColumns}
            data={data.transactions}
            emptyMessage="No revenue activity found yet."
            filterableColumns={[
              { id: 'type', title: 'Activity' },
              {
                id: 'currencyCode',
                title: 'Currency',
                emptyLabel: 'Unknown currency',
              },
            ]}
          />
        </CardContent>
      </Card>
    </AppShell>
  )
}

function MovementBadge({ kind }: { kind: MrrMovementKind }) {
  const label = {
    cancellation: 'Cancellation',
    contraction: 'Contraction',
    expansion: 'Expansion',
    new: 'New',
    reactivation: 'Reactivation',
  }[kind]
  const variant =
    kind === 'cancellation' || kind === 'contraction'
      ? 'destructive'
      : 'success'

  return <Badge variant={variant}>{label}</Badge>
}

function ShopCell({
  shopId,
  shopDomain,
  shopName,
}: {
  shopId: number | null
  shopDomain: string | null
  shopName: string | null
}) {
  const label = shopName ?? shopDomain ?? 'Unknown shop'
  const content = (
    <div className="flex min-w-40 flex-col">
      <span className="max-w-56 truncate font-medium">{label}</span>
      {shopName && shopDomain ? (
        <span className="max-w-56 truncate text-xs text-muted-foreground">
          {shopDomain}
        </span>
      ) : null}
    </div>
  )

  if (!shopId) return content

  return (
    <Link
      to="/shops/$shopId"
      params={{ shopId: String(shopId) }}
      className="hover:underline"
    >
      {content}
    </Link>
  )
}

function movementCurrency(row: MrrMovementRow, value: number) {
  return formatCurrency(value, { currency: row.currencyCode })
}
