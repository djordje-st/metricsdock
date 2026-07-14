import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  ChevronDownIcon,
  LightbulbIcon,
  ListChecksIcon,
  PlugZapIcon,
} from 'lucide-react'
import { AppShell } from '#/components/app-shell.tsx'
import { DataTable, DataTableColumnHeader } from '#/components/data-table.tsx'
import { DateRangePicker } from '#/components/date-range-picker.tsx'
import { MetricPanel } from '#/components/metric-card.tsx'
import {
  MultiBarChart,
  RankedBarChart,
  ReportChart,
} from '#/components/report-chart.tsx'
import type { DateRangeValue } from '#/lib/date-range.ts'
import {
  normalizeDateRangeSearch,
  normalizeReportLoaderSearch,
  normalizeReportSearch,
} from '#/lib/date-range.ts'
import { formatDate, formatNumber, formatPercent } from '#/lib/format.ts'
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
import { Badge } from '#/components/ui/badge.tsx'
import { getAppStoreAnalyticsReport } from '#/server/app.functions.ts'
import { cn } from '#/lib/utils.ts'

export const Route = createFileRoute('/reports/app-store')({
  ssr: false,
  validateSearch: normalizeReportSearch,
  loaderDeps: ({ search }) => normalizeReportLoaderSearch(search),
  loader: ({ deps }) => getAppStoreAnalyticsReport({ data: deps }),
  component: AppStoreReport,
})

type AppStoreEventRow = {
  id: string
  date: string
  appId: string
  appName: string
  eventName: string
  eventLabel: string
  country: string
  sourceMedium: string
  surfaceType: string
  surfaceDetail: string
  eventCount: number
  activeUsers: number
}

type AppStoreInsight = {
  title: string
  description: string
  tone: 'default' | 'success' | 'warning'
}

type AppStoreRecommendation = {
  title: string
  description: string
}

type AppStoreComparison = {
  label: string
  current: number | null
  previous: number | null
  delta: number | null
  changeRate: number | null
  format: 'number' | 'percent'
}

const eventColumns: ColumnDef<AppStoreEventRow>[] = [
  {
    accessorKey: 'date',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Date" />
    ),
    cell: ({ row }) => formatDate(row.original.date),
  },
  {
    accessorKey: 'appName',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="App" />
    ),
  },
  {
    accessorKey: 'eventLabel',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Event" />
    ),
  },
  {
    accessorKey: 'country',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Country" />
    ),
  },
  {
    id: 'attribution',
    accessorFn: (row) => attributionLabel(row),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Attribution" />
    ),
    cell: ({ row }) => attributionLabel(row.original),
  },
  {
    accessorKey: 'eventCount',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Events" />
    ),
    cell: ({ row }) => formatNumber(row.original.eventCount),
  },
  {
    accessorKey: 'activeUsers',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Active users" />
    ),
    cell: ({ row }) => formatNumber(row.original.activeUsers),
  },
]

function AppStoreReport() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  const dateRange = normalizeDateRangeSearch(search)
  const navigate = useNavigate({ from: '/reports/app-store' })

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
      title="App Store Performance"
      description="Listing traffic, conversion, and install sources from your Shopify App Store analytics."
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
        <div className="grid gap-4">
          {data.accessIssues.length ? (
            <Card className="border-warning/50 bg-warning/5">
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>Tracking setup needs attention</CardTitle>
                  <Badge variant="warning">Partial data</Badge>
                </div>
                <CardDescription>
                  MetricsDock fetched usable listing data. Fix these items for
                  cleaner app-level attribution.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {data.accessIssues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]">
            <InsightSummaryCard insights={data.insights} />
            <ComparisonCard comparisons={data.comparisons} />
          </div>

          <MetricPanel
            title="Listing conversion"
            description="How visitors move from viewing the listing to clicking install and completing the install."
            columns={6}
            metrics={[
              {
                label: 'Listing views',
                value: formatNumber(data.metrics.listingViews),
                description: 'People who viewed the listing',
                trend: data.listingViewSeries,
              },
              {
                label: 'Install clicks',
                value: formatNumber(data.metrics.installClicks),
                description: 'Visitors who clicked install',
                trend: data.funnelSeries.map((point) => ({
                  date: point.date,
                  value: point.installClicks,
                })),
              },
              {
                label: 'Completed installs',
                value: formatNumber(data.metrics.completedInstalls),
                description: 'Installs attributed to the listing',
                trend: data.installSeries,
              },
              {
                label: 'Click-through rate',
                value: formatPercent(data.metrics.installClickRate),
                description: 'Install clicks / listing views',
                trend: null,
              },
              {
                label: 'Install completion',
                value: formatPercent(data.metrics.installCompletionRate),
                description: 'Completed installs / install clicks',
                trend: null,
              },
              {
                label: 'Ad clicks',
                value: formatNumber(data.metrics.adClicks),
                description: 'Shopify App Store ads',
                trend: null,
              },
            ]}
          />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Conversion by day</CardTitle>
                <CardDescription>
                  Views, install clicks, and completed installs over time.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <MultiBarChart
                  data={data.funnelSeries}
                  series={[
                    { key: 'listingViews', label: 'Listing views' },
                    { key: 'installClicks', label: 'Install clicks' },
                    { key: 'completedInstalls', label: 'Completed installs' },
                  ]}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Completed installs over time</CardTitle>
                <CardDescription>
                  The install outcome trend after visitors click through.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ReportChart data={data.installSeries} type="area" />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Where install intent comes from</CardTitle>
                <CardDescription>
                  Shopify App Store surfaces and source / medium signals.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RankedBarChart data={data.topAttribution} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Strongest markets</CardTitle>
                <CardDescription>
                  Countries driving listing views and completed installs.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RankedBarChart data={data.topCountries} />
              </CardContent>
            </Card>
          </div>

          <RecommendationsCard recommendations={data.recommendations} />

          <RawEventsCard rows={data.rows} />
        </div>
      ) : (
        <Empty className="rounded-xl border bg-muted/20">
          <EmptyHeader>
            <EmptyTitle>Connect App Store analytics</EmptyTitle>
            <EmptyDescription>
              Add a GA4 property and map it to a Partner app before viewing App
              Store listing analytics.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button render={<Link to="/settings/connections" />}>
              <PlugZapIcon data-icon="inline-start" />
              Open connections
            </Button>
          </EmptyContent>
        </Empty>
      )}
    </AppShell>
  )
}

function InsightSummaryCard({ insights }: { insights: AppStoreInsight[] }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <LightbulbIcon className="size-4 text-muted-foreground" />
          <CardTitle>What this means</CardTitle>
        </div>
        <CardDescription>
          A plain-language read on listing conversion and demand.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {insights.map((insight) => (
          <div
            key={`${insight.title}-${insight.description}`}
            className="flex min-w-0 flex-col gap-2 rounded bg-muted/30 p-3 ring-1 ring-border/70"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{insight.title}</span>
              <Badge variant={insightBadgeVariant(insight.tone)}>
                {insightLabel(insight.tone)}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {insight.description}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function ComparisonCard({
  comparisons,
}: {
  comparisons: AppStoreComparison[]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>What changed</CardTitle>
        <CardDescription>
          Current period compared with the previous matching period.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {comparisons.map((comparison) => (
          <ComparisonRow key={comparison.label} comparison={comparison} />
        ))}
      </CardContent>
    </Card>
  )
}

function ComparisonRow({ comparison }: { comparison: AppStoreComparison }) {
  const direction =
    comparison.delta === null || comparison.delta === 0
      ? 'flat'
      : comparison.delta > 0
        ? 'up'
        : 'down'

  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded bg-muted/30 p-3 ring-1 ring-border/70">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{comparison.label}</div>
        <div className="text-xs text-muted-foreground">
          Previous: {formatComparisonValue(comparison.previous, comparison)}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-right">
        {direction === 'up' ? (
          <ArrowUpRightIcon className="size-4 text-success" />
        ) : direction === 'down' ? (
          <ArrowDownRightIcon className="size-4 text-destructive" />
        ) : null}
        <div>
          <div className="font-heading text-lg leading-none font-semibold tabular-nums">
            {formatComparisonValue(comparison.current, comparison)}
          </div>
          <div
            className={cn(
              'text-xs',
              direction === 'up' && 'text-success',
              direction === 'down' && 'text-destructive',
              direction === 'flat' && 'text-muted-foreground',
            )}
          >
            {formatComparisonChange(comparison)}
          </div>
        </div>
      </div>
    </div>
  )
}

function RecommendationsCard({
  recommendations,
}: {
  recommendations: AppStoreRecommendation[]
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ListChecksIcon className="size-4 text-muted-foreground" />
          <CardTitle>What to do next</CardTitle>
        </div>
        <CardDescription>
          Suggested actions based on the funnel and source mix.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        {recommendations.map((recommendation) => (
          <div
            key={`${recommendation.title}-${recommendation.description}`}
            className="rounded bg-muted/30 p-4 ring-1 ring-border/70"
          >
            <div className="font-medium">{recommendation.title}</div>
            <p className="mt-2 text-sm text-muted-foreground">
              {recommendation.description}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function RawEventsCard({ rows }: { rows: AppStoreEventRow[] }) {
  return (
    <Card>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-6 marker:hidden">
          <div className="min-w-0">
            <CardTitle>Raw event details</CardTitle>
            <CardDescription className="mt-1">
              Date, app, country, source, and event-level rows.
            </CardDescription>
          </div>
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <CardContent>
          <DataTable
            columns={eventColumns}
            data={rows}
            emptyMessage="No App Store analytics events found for this date range."
            sortParam="appStoreEventSort"
            filterableColumns={[
              {
                id: 'app',
                title: 'App',
                getValue: (row) => row.appName,
              },
              {
                id: 'event',
                title: 'Event',
                getValue: (row) => row.eventLabel,
              },
              {
                id: 'country',
                title: 'Country',
                getValue: (row) => row.country,
              },
            ]}
          />
        </CardContent>
      </details>
    </Card>
  )
}

function insightBadgeVariant(tone: AppStoreInsight['tone']) {
  if (tone === 'success') return 'success'
  if (tone === 'warning') return 'warning'

  return 'info'
}

function insightLabel(tone: AppStoreInsight['tone']) {
  if (tone === 'success') return 'Good'
  if (tone === 'warning') return 'Watch'

  return 'Signal'
}

function formatComparisonValue(
  value: number | null,
  comparison: Pick<AppStoreComparison, 'format'>,
) {
  if (comparison.format === 'percent') return formatPercent(value)

  return formatNumber(value)
}

function formatComparisonChange(comparison: AppStoreComparison) {
  if (comparison.delta === null) return 'No comparison'
  if (comparison.delta === 0) return 'Flat'

  const direction = comparison.delta > 0 ? 'Up' : 'Down'

  if (comparison.changeRate !== null) {
    return `${direction} ${formatPercent(Math.abs(comparison.changeRate))}`
  }

  if (
    comparison.previous === 0 &&
    comparison.current &&
    comparison.current > 0
  ) {
    return 'New activity'
  }

  const delta =
    comparison.format === 'percent'
      ? formatPercent(Math.abs(comparison.delta))
      : formatNumber(Math.abs(comparison.delta))

  return `${direction} ${delta}`
}

function attributionLabel(row: AppStoreEventRow) {
  if (row.surfaceType !== 'Unknown') {
    return row.surfaceDetail === 'Unknown'
      ? row.surfaceType
      : `${row.surfaceType}: ${row.surfaceDetail}`
  }

  return row.sourceMedium
}
