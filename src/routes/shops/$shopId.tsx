import { useState } from 'react'
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
import { RankedBarChart, ReportChart } from '#/components/report-chart.tsx'
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
import { getShopDetail, setShopTestMode } from '#/server/app.functions.ts'
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

export const Route = createFileRoute('/shops/$shopId')({
  ssr: false,
  validateSearch: normalizeReportSearch,
  loaderDeps: ({ search }) => normalizeDateRangeSearch(search),
  loader: ({ deps, params }) => {
    const shopId = Number(params.shopId)

    if (!Number.isInteger(shopId) || shopId <= 0) throw notFound()

    return getShopDetail({ data: { shopId, ...deps } })
  },
  component: ShopDetailPage,
})

type RelationshipRow = {
  appName: string
  partnerAppId: string
  status: string
  installedAt: string | null
  reactivatedAt: string | null
  uninstalledAt: string | null
  deactivatedAt: string | null
}

type SubscriptionRow = {
  appName: string
  name: string | null
  status: string
  interval: string | null
  mrrAmount: number
  currencyCode: string | null
  activatedAt: string | null
  canceledAt: string | null
}

type ActivityRow = {
  kind: string
  label: string
  appName: string
  occurredAt: string
  detail: string | null
}

const relationshipColumns: ColumnDef<RelationshipRow>[] = [
  {
    accessorKey: 'appName',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="App" />
    ),
    cell: ({ row }) => (
      <div className="flex flex-col gap-1">
        <span className="font-medium">{row.original.appName}</span>
        <span className="text-sm text-muted-foreground">
          {formatShopifyId(row.original.partnerAppId)}
        </span>
      </div>
    ),
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
    accessorKey: 'reactivatedAt',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Reactivated" />
    ),
    cell: ({ row }) => formatDate(row.original.reactivatedAt),
  },
  {
    accessorKey: 'uninstalledAt',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Uninstalled" />
    ),
    cell: ({ row }) => formatDate(row.original.uninstalledAt),
  },
]

const subscriptionColumns: ColumnDef<SubscriptionRow>[] = [
  {
    accessorKey: 'appName',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="App" />
    ),
  },
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Plan" />
    ),
    cell: ({ row }) => row.original.name ?? '-',
  },
  {
    accessorKey: 'status',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    id: 'mrrAmount',
    accessorFn: (row) => Number(row.mrrAmount),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Recurring revenue" />
    ),
    cell: ({ row }) =>
      formatCurrency(row.original.mrrAmount, {
        currency: row.original.currencyCode,
      }),
  },
  {
    accessorKey: 'activatedAt',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Activated" />
    ),
    cell: ({ row }) => formatDate(row.original.activatedAt),
  },
  {
    accessorKey: 'canceledAt',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Canceled" />
    ),
    cell: ({ row }) => formatDate(row.original.canceledAt),
  },
]

const activityColumns: ColumnDef<ActivityRow>[] = [
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
      <DataTableColumnHeader column={column} title="Type" />
    ),
    cell: ({ row }) => <Badge variant="outline">{row.original.kind}</Badge>,
  },
  {
    accessorKey: 'label',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Event" />
    ),
  },
  {
    accessorKey: 'appName',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="App" />
    ),
  },
  {
    accessorKey: 'detail',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Detail" />
    ),
    cell: ({ row }) => row.original.detail ?? '-',
  },
]

function ShopDetailPage() {
  const detail = Route.useLoaderData()
  const search = Route.useSearch()
  const dateRange = normalizeDateRangeSearch(search)
  const navigate = useNavigate({ from: '/shops/$shopId' })
  const router = useRouter()
  const [settingTestMode, setSettingTestMode] = useState(false)
  const title = detail.shop.shopName ?? detail.shop.shopDomain
  const {
    activitySeries,
    partnerEventSeries,
    uninstallFeedbackSeries,
    activityMixChart,
  } = detail.charts
  const mrrMoney = (value: number | string | null | undefined) =>
    formatMoneyMetric(value, {
      currencyCode: detail.metrics.mrrCurrencyCode,
      hasMixedCurrencies: detail.metrics.mrrHasMixedCurrencies,
    })
  const revenueMoney = (value: number | string | null | undefined) =>
    formatMoneyMetric(value, {
      currencyCode: detail.metrics.revenueCurrencyCode,
      hasMixedCurrencies: detail.metrics.revenueHasMixedCurrencies,
    })

  function setDateRange(range: DateRangeValue) {
    void navigate({ search: (previous) => ({ ...previous, ...range }) })
  }

  async function toggleShopTestMode() {
    setSettingTestMode(true)

    try {
      await setShopTestMode({
        data: { shopId: detail.shop.id, isTest: !detail.shop.isTest },
      })
      toast.success(
        detail.shop.isTest ? 'Shop included in reports' : 'Shop marked test',
      )
      void router.invalidate()
    } finally {
      setSettingTestMode(false)
    }
  }

  return (
    <AppShell title={title} description={detail.shop.shopDomain}>
      <PageInsightCard
        eyebrow={detail.shop.isTest ? 'Test shop' : 'Shop detail'}
        title="Review this merchant across every connected app."
        description={
          detail.shop.isTest
            ? 'This shop stays connected, but its events and revenue are excluded from reporting.'
            : 'This view brings together app status, subscription revenue, Shopify activity, and uninstall feedback for the selected store.'
        }
        action={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button variant="outline" render={<Link to="/reports/customers" />}>
              Back to customers
            </Button>
            <Button
              type="button"
              variant={detail.shop.isTest ? 'secondary' : 'outline'}
              aria-pressed={detail.shop.isTest}
              onClick={toggleShopTestMode}
              disabled={settingTestMode}
            >
              {settingTestMode
                ? 'Saving...'
                : detail.shop.isTest
                  ? 'Include in reports'
                  : 'Mark as test'}
            </Button>
            <DateRangePicker value={dateRange} onChange={setDateRange} />
          </div>
        }
        stats={[
          {
            label: 'Domain',
            value: detail.shop.shopDomain,
            description: 'myshopify domain',
          },
          {
            label: 'Shopify shop ID',
            value: formatShopifyId(detail.shop.shopifyShopId),
            description: 'plain ID shown for support',
          },
          {
            label: 'First seen',
            value: formatDate(detail.shop.createdAt),
            description: 'first saved in MetricsDock',
          },
          {
            label: 'Connected apps',
            value: formatNumber(detail.relationships.length),
            description: 'apps for this store',
          },
        ]}
      />

      <MetricPanel
        title="Shop summary"
        description="Revenue, subscriptions, and recent activity for the selected period."
        columns={5}
        metrics={[
          {
            label: 'Recurring revenue',
            tooltip:
              'Monthly recurring revenue from active, non-test subscriptions for this store.',
            value: mrrMoney(detail.metrics.mrr),
          },
          {
            label: 'Revenue',
            tooltip:
              'Net revenue Shopify recorded for this store in the selected period. Uses gross amount when net is missing.',
            value: revenueMoney(detail.metrics.revenue),
          },
          {
            label: 'Active subscriptions',
            tooltip: 'Active, non-test paid subscriptions for this store.',
            value: formatNumber(detail.metrics.activeSubscriptions),
          },
          {
            label: 'Shopify events',
            tooltip:
              'Shopify Partner activity for this store in the selected period.',
            value: formatNumber(detail.metrics.partnerEvents),
            trend: partnerEventSeries,
          },
          {
            label: 'Uninstall feedback',
            tooltip:
              'Uninstall comments received for this store in the selected period.',
            value: formatNumber(detail.metrics.uninstallFeedback),
            trend: uninstallFeedbackSeries,
          },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Activity trend</CardTitle>
            <CardDescription>
              Shopify activity, revenue activity, and feedback by day.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReportChart data={activitySeries} type="bar" className="h-72" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Activity mix</CardTitle>
            <CardDescription>Activity types in this period.</CardDescription>
          </CardHeader>
          <CardContent>
            <RankedBarChart data={activityMixChart} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connected apps</CardTitle>
          <CardDescription>Current app status for this store.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={relationshipColumns}
            data={detail.relationships}
            emptyMessage="No connected apps found for this store."
            filterableColumns={[
              { id: 'appName', title: 'App' },
              { id: 'status', title: 'Status' },
            ]}
            sortParam="relationshipsSort"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Subscriptions</CardTitle>
          <CardDescription>
            Current and past paid subscriptions for this store.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={subscriptionColumns}
            data={detail.subscriptions}
            emptyMessage="No subscriptions found for this store."
            filterableColumns={[
              { id: 'appName', title: 'App' },
              { id: 'name', title: 'Plan', emptyLabel: 'No plan' },
              { id: 'status', title: 'Status' },
            ]}
            sortParam="subscriptionsSort"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>
            Shopify activity, revenue activity, and uninstall feedback in the
            selected range.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={activityColumns}
            data={detail.activity}
            emptyMessage="No activity found for this store in the selected range."
            filterableColumns={[
              { id: 'kind', title: 'Type' },
              { id: 'label', title: 'Event' },
              { id: 'appName', title: 'App' },
            ]}
            sortParam="activitySort"
          />
        </CardContent>
      </Card>
    </AppShell>
  )
}
