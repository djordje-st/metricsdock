import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { AppShell } from '#/components/app-shell.tsx'
import { DataTable, DataTableColumnHeader } from '#/components/data-table.tsx'
import { DateRangePicker } from '#/components/date-range-picker.tsx'
import { MetricPanel } from '#/components/metric-card.tsx'
import { MultiBarChart } from '#/components/report-chart.tsx'
import { StatusBadge } from '#/components/status-badge.tsx'
import type { DateRangeValue } from '#/lib/date-range.ts'
import {
  normalizeDateRangeSearch,
  normalizeReportLoaderSearch,
  normalizeReportSearch,
} from '#/lib/date-range.ts'
import { formatDate, formatNumber } from '#/lib/format.ts'
import { formatShopifyId } from '#/lib/shopify-id.ts'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card.tsx'
import { getCustomerReport } from '#/server/app.functions.ts'

export const Route = createFileRoute('/reports/customers')({
  ssr: false,
  validateSearch: normalizeReportSearch,
  loaderDeps: ({ search }) => normalizeReportLoaderSearch(search),
  loader: ({ deps }) => getCustomerReport({ data: deps }),
  component: CustomersReport,
})

type CustomerRow = {
  appName: string
  partnerAppId: string
  planName: string | null
  shopId: number
  shopDomain: string
  shopName: string | null
  status: string
  installedAt: string | null
  reactivatedAt: string | null
  uninstalledAt: string | null
}

const customerColumns: ColumnDef<CustomerRow>[] = [
  {
    accessorKey: 'shopDomain',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Shop" />
    ),
    cell: ({ row }) => (
      <div className="flex flex-col gap-1">
        <Link
          to="/shops/$shopId"
          params={{ shopId: String(row.original.shopId) }}
          className="font-medium underline-offset-4 hover:underline"
        >
          {row.original.shopName ?? row.original.shopDomain}
        </Link>
        <div className="text-sm text-muted-foreground">
          {row.original.shopDomain}
        </div>
      </div>
    ),
  },
  {
    accessorKey: 'appName',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="App" />
    ),
    cell: ({ row }) => (
      <div className="flex flex-col gap-1">
        <span className="font-medium">{row.original.appName}</span>
        <span className="text-xs text-muted-foreground">
          {formatShopifyId(row.original.partnerAppId)}
        </span>
      </div>
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

function CustomersReport() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  const dateRange = normalizeDateRangeSearch(search)
  const navigate = useNavigate({ from: '/reports/customers' })
  const { customerLifecycleSeries, installSeries, reactivationSeries } =
    data.charts

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
      title="Customers"
      description="Stores using your apps and how their status changed."
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
        title="Customer changes"
        description="Current stores and store changes for the selected period."
        columns={3}
        metrics={[
          {
            label: 'Active stores',
            tooltip:
              'Stores that currently have one of your connected apps installed.',
            value: formatNumber(data.metrics.activeInstalls),
            trend: installSeries,
          },
          {
            label: 'Installs',
            tooltip:
              'Stores that installed a connected app in the selected period.',
            value: formatNumber(data.metrics.installs),
            trend: installSeries,
          },
          {
            label: 'Reactivations',
            tooltip:
              'Stores that reinstalled or reactivated a connected app in the selected period.',
            value: formatNumber(data.metrics.reactivations),
            trend: reactivationSeries,
          },
        ]}
      />
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
      <Card>
        <CardHeader>
          <CardTitle>Stores</CardTitle>
          <CardDescription>Current app status for each store.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={customerColumns}
            data={data.customers}
            emptyMessage="No stores found yet."
            filterableColumns={[
              { id: 'shopDomain', title: 'Shop' },
              { id: 'appName', title: 'App' },
              {
                id: 'planName',
                title: 'Plan',
                emptyLabel: 'No active plan',
              },
              { id: 'status', title: 'Status' },
            ]}
          />
        </CardContent>
      </Card>
    </AppShell>
  )
}
