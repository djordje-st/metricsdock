import { useMemo, useState } from 'react'
import {
  createFileRoute,
  Link,
  notFound,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { toast } from 'sonner'
import { AppShell } from '#/components/app-shell.tsx'
import { DataTable, DataTableColumnHeader } from '#/components/data-table.tsx'
import { DateRangePicker } from '#/components/date-range-picker.tsx'
import { MetricPanel } from '#/components/metric-card.tsx'
import { PageInsightCard } from '#/components/page-insight-card.tsx'
import {
  MultiBarChart,
  RankedBarChart,
  ReportChart,
} from '#/components/report-chart.tsx'
import { StatusBadge } from '#/components/status-badge.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card.tsx'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#/components/ui/empty.tsx'
import type { DateRangeValue } from '#/lib/date-range.ts'
import {
  normalizeDateRangeSearch,
  normalizeReportSearch,
} from '#/lib/date-range.ts'
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatMoneyMetric,
  formatNumber,
} from '#/lib/format.ts'
import { formatShopifyId } from '#/lib/shopify-id.ts'
import {
  enqueueUserSync,
  getAppDetailAnalytics,
  setPartnerAppTestMode,
} from '#/server/app.functions.ts'

export const Route = createFileRoute('/apps/$appId')({
  ssr: false,
  validateSearch: normalizeReportSearch,
  loaderDeps: ({ search }) => normalizeDateRangeSearch(search),
  loader: ({ deps, params }) => {
    const appId = params.appId.trim()

    if (!appId) throw notFound()

    return getAppDetailAnalytics({ data: { appId, ...deps } })
  },
  component: AppDetailPage,
})

type CustomerRow = {
  shopId: number
  shopDomain: string
  shopName: string | null
  planName: string | null
  status: string
  installedAt: string | null
  reactivatedAt: string | null
  uninstalledAt: string | null
}

type TransactionRow = {
  shopId: number | null
  shopDomain: string | null
  shopName: string | null
  type: string
  createdAt: string
  currencyCode: string | null
  netAmount: string | null
  grossAmount: string | null
}

type PartnerEventRow = {
  shopId: number | null
  shopDomain: string | null
  shopName: string | null
  type: string
  occurredAt: string
  amount: string | null
  currencyCode: string | null
}

const customerColumns: ColumnDef<CustomerRow>[] = [
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
    cell: ({ row }) => row.original.planName ?? 'No active plan',
  },
  {
    accessorKey: 'status',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    accessorKey: 'installedAt',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Installed" />
    ),
    cell: ({ row }) => formatDate(row.original.installedAt),
  },
  {
    accessorKey: 'uninstalledAt',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Uninstalled" />
    ),
    cell: ({ row }) => formatDate(row.original.uninstalledAt),
  },
]

const transactionColumns: ColumnDef<TransactionRow>[] = [
  {
    accessorKey: 'createdAt',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Date" />
    ),
    cell: ({ row }) => formatDate(row.original.createdAt),
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
    accessorKey: 'type',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Type" />
    ),
  },
  {
    id: 'amount',
    accessorFn: (row) => Number(row.netAmount ?? row.grossAmount ?? 0),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Amount" />
    ),
    cell: ({ row }) =>
      formatCurrency(row.original.netAmount ?? row.original.grossAmount, {
        currency: row.original.currencyCode,
      }),
  },
]

const partnerEventColumns: ColumnDef<PartnerEventRow>[] = [
  {
    accessorKey: 'occurredAt',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="When" />
    ),
    cell: ({ row }) => formatDateTime(row.original.occurredAt),
  },
  {
    accessorKey: 'type',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Event" />
    ),
    cell: ({ row }) => <Badge variant="outline">{row.original.type}</Badge>,
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
    id: 'amount',
    accessorFn: (row) => Number(row.amount ?? 0),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Amount" />
    ),
    cell: ({ row }) =>
      formatCurrency(row.original.amount, {
        currency: row.original.currencyCode,
      }),
  },
]

function AppDetailPage() {
  const data = Route.useLoaderData()
  const { appId: appIdParam } = Route.useParams()
  const search = Route.useSearch()
  const dateRange = normalizeDateRangeSearch(search)
  const navigate = useNavigate({ from: '/apps/$appId' })
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)
  const [settingTestMode, setSettingTestMode] = useState(false)
  const app = useMemo(
    () =>
      data.apps.find(
        (candidate) =>
          candidate.id === appIdParam ||
          formatShopifyId(candidate.id) === appIdParam,
      ),
    [data.apps, appIdParam],
  )
  const {
    customerLifecycleSeries,
    churnSeries: uninstallSeries,
    eventTypeChart,
    transactionTypeChart,
  } = data.charts
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
  const revenueSeries = data.metrics.revenueHasMixedCurrencies
    ? []
    : data.revenueSeries
  const revenueTypeChart = data.metrics.revenueHasMixedCurrencies
    ? []
    : transactionTypeChart

  function setDateRange(range: DateRangeValue) {
    void navigate({ search: (previous) => ({ ...previous, ...range }) })
  }

  async function syncApp() {
    if (!app) return

    setSyncing(true)

    try {
      await enqueueUserSync({ data: { appId: app.id } })
      toast.success('Sync queued')
      void router.invalidate()
    } finally {
      setSyncing(false)
    }
  }

  async function toggleAppTestMode() {
    if (!app) return

    setSettingTestMode(true)

    try {
      await setPartnerAppTestMode({
        data: { appId: app.id, isTest: !app.isTest },
      })
      toast.success(app.isTest ? 'App included in reports' : 'App marked test')
      void router.invalidate()
    } finally {
      setSettingTestMode(false)
    }
  }

  if (!app) {
    return (
      <AppShell title="App not found" apps={data.apps}>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>App not found</EmptyTitle>
            <EmptyDescription>
              This app is not connected to the current account.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" render={<Link to="/dashboard" />}>
              Back to overview
            </Button>
          </EmptyContent>
        </Empty>
      </AppShell>
    )
  }

  return (
    <AppShell
      title={app.name}
      description="Revenue, stores, and churn for this app."
      apps={data.apps}
    >
      <PageInsightCard
        action={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button variant="outline" render={<Link to="/dashboard" />}>
              Back to overview
            </Button>
            <Button
              type="button"
              variant={app.isTest ? 'secondary' : 'outline'}
              aria-pressed={app.isTest}
              onClick={toggleAppTestMode}
              disabled={settingTestMode}
            >
              {settingTestMode
                ? 'Saving...'
                : app.isTest
                  ? 'Include in reports'
                  : 'Mark as test'}
            </Button>
            <Button type="button" onClick={syncApp} disabled={syncing}>
              {syncing ? 'Queueing...' : 'Sync app'}
            </Button>
            <DateRangePicker value={dateRange} onChange={setDateRange} />
          </div>
        }
        stats={[
          {
            label: 'Partner app ID',
            value: formatShopifyId(app.partnerAppId),
            description: 'plain ID shown for support',
          },
          {
            label: 'Connection',
            value: app.connectionName ?? 'Partner org',
            description: 'connected account',
          },
          {
            label: 'Organization',
            value: app.organizationId,
            description: 'Shopify Partner org',
          },
          {
            label: 'Customers',
            value: formatNumber(data.customersTotalCount),
            description: 'stores found',
          },
        ]}
      />

      <MetricPanel
        title="App summary"
        description="Revenue and stores for the selected app."
        columns={5}
        metrics={[
          {
            label: 'Recurring revenue',
            tooltip:
              'Monthly recurring revenue from active, non-test subscriptions for this app.',
            value: mrrMoney(data.metrics.mrr),
          },
          {
            label: 'Revenue',
            tooltip:
              'Net revenue Shopify recorded for this app in the selected period.',
            value: revenueMoney(data.metrics.revenue),
            trend: revenueSeries,
          },
          {
            label: 'Active stores',
            tooltip: 'Stores that currently have this app installed.',
            value: formatNumber(data.metrics.activeInstalls),
          },
          {
            label: 'Subscribers',
            tooltip:
              'Count of unique merchant shops with at least one non-test active subscription for this app.',
            value: formatNumber(data.metrics.activeSubscribers),
          },
          {
            label: 'Uninstalls',
            tooltip: 'Stores that uninstalled this app in the selected period.',
            value: formatNumber(data.metrics.uninstalls),
            trend: uninstallSeries,
          },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Revenue trend</CardTitle>
            <CardDescription>
              Net revenue recorded by Shopify each day for this app.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReportChart data={revenueSeries} type="area" className="h-80" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Shopify activity mix</CardTitle>
            <CardDescription>Recent Shopify activity types.</CardDescription>
          </CardHeader>
          <CardContent>
            <RankedBarChart data={eventTypeChart} className="h-80" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Store changes</CardTitle>
            <CardDescription>
              Installs, reactivations, and uninstalls by day.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MultiBarChart
              data={customerLifecycleSeries}
              series={[
                { key: 'installs', label: 'Installs' },
                { key: 'reactivations', label: 'Reactivations' },
                { key: 'uninstalls', label: 'Uninstalls', tone: 'negative' },
              ]}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Revenue by activity</CardTitle>
            <CardDescription>
              Shopify revenue activity types in this period.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RankedBarChart data={revenueTypeChart} className="h-64" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Customers</CardTitle>
          <CardDescription>
            Current status for stores connected to this app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={customerColumns}
            data={data.customers}
            emptyMessage="No stores found for this app."
            filterableColumns={[
              { id: 'shopDomain', title: 'Shop' },
              {
                id: 'planName',
                title: 'Plan',
                emptyLabel: 'No active plan',
              },
              { id: 'status', title: 'Status' },
            ]}
            sortParam="customerSort"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shopify activity</CardTitle>
          <CardDescription>
            Recent Shopify Partner activity for this app in the selected range.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={partnerEventColumns}
            data={data.events}
            emptyMessage="No Shopify activity found for this app."
            filterableColumns={[
              { id: 'type', title: 'Event' },
              {
                id: 'shopDomain',
                title: 'Shop',
                emptyLabel: 'Unknown shop',
              },
            ]}
            sortParam="partnerEventSort"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Revenue activity</CardTitle>
          <CardDescription>
            Shopify revenue items for this app in the selected range.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={transactionColumns}
            data={data.transactions}
            emptyMessage="No revenue activity found for this app."
            filterableColumns={[
              {
                id: 'shopDomain',
                title: 'Shop',
                emptyLabel: 'Unknown shop',
              },
              { id: 'type', title: 'Type' },
            ]}
            sortParam="transactionSort"
          />
        </CardContent>
      </Card>
    </AppShell>
  )
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

  if (!shopId) {
    return (
      <div className="flex flex-col gap-1">
        <span className="font-medium">{label}</span>
        {shopDomain ? (
          <span className="text-xs text-muted-foreground">{shopDomain}</span>
        ) : null}
      </div>
    )
  }

  return (
    <Link
      to="/shops/$shopId"
      params={{ shopId: String(shopId) }}
      className="flex flex-col gap-1 underline-offset-4 hover:underline"
    >
      <span className="font-medium">{label}</span>
      {shopDomain ? (
        <span className="text-xs text-muted-foreground">{shopDomain}</span>
      ) : null}
    </Link>
  )
}
