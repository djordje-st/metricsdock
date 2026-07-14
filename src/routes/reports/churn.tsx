import { createFileRoute, useNavigate } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { AppShell } from '#/components/app-shell.tsx'
import { DataTable, DataTableColumnHeader } from '#/components/data-table.tsx'
import { DateRangePicker } from '#/components/date-range-picker.tsx'
import { MetricPanel } from '#/components/metric-card.tsx'
import { RankedBarChart, ReportChart } from '#/components/report-chart.tsx'
import type { DateRangeValue } from '#/lib/date-range.ts'
import {
  normalizeDateRangeSearch,
  normalizeReportLoaderSearch,
  normalizeReportSearch,
} from '#/lib/date-range.ts'
import { formatDate, formatNumber, formatPercent } from '#/lib/format.ts'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card.tsx'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'
import { getChurnReport } from '#/server/app.functions.ts'

const ALL_REASONS = 'all'

export const Route = createFileRoute('/reports/churn')({
  ssr: false,
  validateSearch: normalizeReportSearch,
  loaderDeps: ({ search }) => ({
    ...normalizeReportLoaderSearch(search),
    ...(search.reason ? { reason: search.reason } : {}),
  }),
  loader: ({ deps }) => getChurnReport({ data: deps }),
  component: ChurnReport,
})

type UninstallFeedbackRow = {
  description: string | null
  rawReason: string | null
  shopDomain: string | null
  reason: string
  reasonCategories: string[]
  occurredAt: string
}

const uninstallFeedbackColumns: ColumnDef<UninstallFeedbackRow>[] = [
  {
    accessorKey: 'shopDomain',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Shop" />
    ),
    cell: ({ row }) => row.original.shopDomain ?? 'Unknown',
  },
  {
    accessorKey: 'reason',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Reason" />
    ),
  },
  {
    accessorKey: 'description',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Feedback" />
    ),
    cell: ({ row }) => {
      const originalReason =
        row.original.rawReason && row.original.rawReason !== row.original.reason
          ? row.original.rawReason
          : null

      if (!row.original.description && !originalReason) return '-'

      return (
        <div className="flex max-w-xl flex-col gap-1">
          {row.original.description ? (
            <span>{row.original.description}</span>
          ) : null}
          {originalReason ? (
            <span className="text-xs text-muted-foreground">
              Original: {originalReason}
            </span>
          ) : null}
        </div>
      )
    },
  },
  {
    accessorKey: 'occurredAt',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="When" />
    ),
    cell: ({ row }) => formatDate(row.original.occurredAt),
  },
]

function ChurnReport() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  const dateRange = normalizeDateRangeSearch(search)
  const navigate = useNavigate({ from: '/reports/churn' })
  const reasonFilter = search.reason
  const uninstallFeedback = data.uninstallFeedback
  const uninstallFeedbackSeries = data.charts.churnSeries
  const uninstallReasonChart = data.charts.topReasonChart
  const filteredLabel = reasonFilter ? 'Filtered feedback' : 'Uninstalls'
  const uninstallTooltip = reasonFilter
    ? 'Uninstall comments matching the selected reason.'
    : 'Stores that uninstalled a connected app in the selected period.'
  const trendTitle = reasonFilter
    ? 'Filtered feedback trend'
    : 'Uninstall trend'
  const trendDescription = reasonFilter
    ? 'Feedback submissions by day for the selected reason filter.'
    : 'Uninstalls by day.'

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

  function setReasonFilter(reason: string) {
    void navigate({
      search: (previous) => {
        if (reason === ALL_REASONS) {
          const { reason: _reason, ...next } = previous
          return next
        }

        return { ...previous, reason }
      },
    })
  }

  return (
    <AppShell
      title="Churn"
      description="Stores lost, stores recovered, and merchant comments."
      apps={data.apps}
      reportAppFilter={{
        selectedAppIds: search.appIds,
        onChange: setReportAppIds,
      }}
      headerActions={
        <>
          <Select
            value={reasonFilter ?? ALL_REASONS}
            onValueChange={(value) => {
              if (value) setReasonFilter(value)
            }}
            items={[
              { label: 'All reasons', value: ALL_REASONS },
              ...data.uninstallReasons.map((reason) => ({
                label: `${reason.reason} (${reason.count})`,
                value: reason.reason,
              })),
            ]}
          >
            <SelectTrigger className="w-40 md:w-52">
              <SelectValue placeholder="Reason" />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                <SelectItem value={ALL_REASONS}>All reasons</SelectItem>
                {data.uninstallReasons.map((reason) => (
                  <SelectItem key={reason.reason} value={reason.reason}>
                    {reason.reason} ({reason.count})
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </>
      }
    >
      <MetricPanel
        title="Churn summary"
        description="Stores lost, stores recovered, and the current installed base."
        columns={3}
        metrics={[
          {
            label: filteredLabel,
            tooltip: uninstallTooltip,
            value: formatNumber(data.metrics.uninstalls),
            trend: uninstallFeedbackSeries,
            tone: 'negative',
          },
          {
            label: 'Reactivations',
            tooltip:
              'Stores that reinstalled or reactivated a connected app in the selected period.',
            value: formatNumber(data.metrics.reactivations),
            trend: data.charts.reactivationSeries,
          },
          {
            label: 'Active stores',
            tooltip:
              'Stores that currently have one of your connected apps installed.',
            value: formatNumber(data.metrics.activeInstalls),
          },
        ]}
      />
      <MetricPanel
        title="Retention rates"
        description="Net churn for the selected period, compared to where each base started."
        columns={3}
        metrics={[
          {
            label: 'Net revenue churn',
            tooltip:
              'MRR lost to cancellations and downgrades, net of expansion and reactivations, over starting MRR.',
            value: formatPercent(data.metrics.netRevenueChurnRate),
            trend: null,
            tone: 'negative',
          },
          {
            label: 'Net subscription churn',
            tooltip:
              'Subscriptions canceled net of reactivations, over the subscriptions active at the start of the period.',
            value: formatPercent(data.metrics.netSubscriptionChurnRate),
            trend: null,
            tone: 'negative',
          },
          {
            label: 'Net logo churn',
            tooltip:
              'Stores lost net of recoveries, over the installed base at the start of the period.',
            value: formatPercent(data.metrics.netLogoChurnRate),
            trend: null,
            tone: 'negative',
          },
        ]}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{trendTitle}</CardTitle>
            <CardDescription>{trendDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <ReportChart
              data={uninstallFeedbackSeries}
              type="bar"
              tone="negative"
              className="h-72"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Reason distribution</CardTitle>
            <CardDescription>Most common grouped reasons.</CardDescription>
          </CardHeader>
          <CardContent>
            <RankedBarChart data={uninstallReasonChart} />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Time to uninstall</CardTitle>
          <CardDescription>
            How long uninstalled stores kept the app before leaving. Closed
            stores are excluded.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RankedBarChart data={data.timeToUninstall} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Uninstall feedback</CardTitle>
          <CardDescription>
            Reasons and comments from stores that uninstalled.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={uninstallFeedbackColumns}
            data={uninstallFeedback}
            emptyMessage="No uninstall feedback submitted yet."
            filterableColumns={[
              {
                id: 'shopDomain',
                title: 'Shop',
                emptyLabel: 'Unknown shop',
              },
              { id: 'reason', title: 'Reason' },
            ]}
          />
        </CardContent>
      </Card>
    </AppShell>
  )
}
