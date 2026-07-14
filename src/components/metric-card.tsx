import type { ReactNode } from 'react'
import { CircleHelpIcon } from 'lucide-react'
import { Line, LineChart, XAxis, YAxis } from 'recharts'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card.tsx'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#/components/ui/tooltip.tsx'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '#/components/ui/chart.tsx'
import type { ChartConfig } from '#/components/ui/chart.tsx'
import { Button } from '#/components/ui/button.tsx'
import { formatShortDate } from '#/lib/format.ts'
import { cn } from '#/lib/utils.ts'

type MetricTrend = Array<{ date: string; value: number }>

type MetricTone = 'default' | 'negative'

type Metric = {
  label: string
  value: ReactNode
  description?: ReactNode
  tooltip?: string
  trend?: MetricTrend | null
  tone?: MetricTone
}

const metricPanelColumns = {
  1: '',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 xl:grid-cols-4',
  5: 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
  6: 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6',
} as const

export function MetricCard({
  label,
  value,
  description,
  tooltip,
}: {
  label: string
  value: ReactNode
  description?: ReactNode
  tooltip?: string
}) {
  return (
    <Card className="[--card-spacing:--spacing(5)]">
      <CardHeader>
        <CardDescription>
          <MetricLabel label={label} tooltip={tooltip} />
        </CardDescription>
        <CardTitle className="text-3xl leading-none font-semibold tabular-nums">
          {value}
        </CardTitle>
      </CardHeader>

      {description ? (
        <CardContent className="text-sm text-muted-foreground">
          {description}
        </CardContent>
      ) : null}
    </Card>
  )
}

export function MetricPanel({
  title,
  description,
  action,
  metrics,
  columns = 4,
  className,
}: {
  title: string
  description?: ReactNode
  action?: ReactNode
  metrics: Metric[]
  columns?: keyof typeof metricPanelColumns
  className?: string
}) {
  return (
    <Card className={cn('[--card-spacing:--spacing(5)]', className)}>
      <CardHeader
        className={cn(
          action &&
            'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between',
        )}
      >
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle>{title}</CardTitle>
          {description ? (
            <CardDescription>{description}</CardDescription>
          ) : null}
        </div>
        {action ? (
          <CardAction className="w-full sm:w-auto">{action}</CardAction>
        ) : null}
      </CardHeader>
      <CardContent className={cn('grid gap-3', metricPanelColumns[columns])}>
        {metrics.map((metric) => (
          <MetricPanelItem key={metric.label} metric={metric} />
        ))}
      </CardContent>
    </Card>
  )
}

function MetricPanelItem({ metric }: { metric: Metric }) {
  const shouldRenderTrend = metric.trend !== null

  return (
    <div className="flex min-h-40 min-w-0 flex-col justify-between gap-4 rounded bg-muted/30 p-4 ring-1 ring-border/70 transition-colors hover:bg-muted/50">
      <div className="flex flex-col gap-1.5">
        <MetricLabel label={metric.label} tooltip={metric.tooltip} />
        {metric.description ? (
          <p className="text-pretty text-sm text-muted-foreground">
            {metric.description}
          </p>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <div className="truncate font-heading text-2xl leading-none font-semibold tabular-nums">
          {metric.value}
        </div>
        {shouldRenderTrend ? (
          <MiniTrendChart data={metric.trend ?? undefined} tone={metric.tone} />
        ) : null}
      </div>
    </div>
  )
}

const miniTrendConfig = {
  value: { label: 'Value', color: 'var(--chart-1)' },
} satisfies ChartConfig
const miniTrendNegativeConfig = {
  value: { label: 'Value', color: 'var(--chart-5)' },
} satisfies ChartConfig
const miniTrendInitialDimension = { width: 220, height: 64 } as const
const miniTrendMargin = { top: 4, right: 2, bottom: 0, left: 2 } as const
const miniTrendPlaceholderData: MetricTrend = [
  { date: 'placeholder-1', value: 0.5 },
  { date: 'placeholder-2', value: 0.5 },
  { date: 'placeholder-3', value: 0.5 },
  { date: 'placeholder-4', value: 0.5 },
  { date: 'placeholder-5', value: 0.5 },
]
const miniTrendTooltipContent = (
  <ChartTooltipContent labelFormatter={formatMiniTrendTooltipLabel} />
)

function MiniTrendChart({
  data,
  tone = 'default',
}: {
  data?: MetricTrend
  tone?: MetricTone
}) {
  const hasTrendData = (data?.length ?? 0) > 0
  const chartData = (data?.length ? data : miniTrendPlaceholderData).map(
    (point) => ({
      date: point.date,
      value: Number.isFinite(point.value) ? point.value : 0,
    }),
  )
  const values = chartData.map((point) => point.value)
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const domain: [number, number] = hasTrendData
    ? min === max
      ? [min - 1, max + 1]
      : [min, max]
    : [0, 1]
  const containerClassName = cn(
    'h-16 w-full',
    hasTrendData ? 'cursor-crosshair' : 'pointer-events-none',
  )
  const lineDot = hasTrendData && chartData.length === 1 ? { r: 3 } : false

  return (
    <ChartContainer
      config={tone === 'negative' ? miniTrendNegativeConfig : miniTrendConfig}
      className={containerClassName}
      initialDimension={miniTrendInitialDimension}
      aria-label={hasTrendData ? undefined : 'No trend data'}
    >
      <LineChart data={chartData} accessibilityLayer margin={miniTrendMargin}>
        <XAxis dataKey="date" hide />
        <YAxis domain={domain} hide />
        {hasTrendData ? (
          <ChartTooltip content={miniTrendTooltipContent} />
        ) : null}
        <Line
          activeDot={hasTrendData ? { r: 3 } : false}
          dataKey="value"
          dot={lineDot}
          stroke="var(--color-value)"
          strokeOpacity={hasTrendData ? 1 : 0.38}
          strokeWidth={2}
          type="monotone"
        />
      </LineChart>
    </ChartContainer>
  )
}

function formatMiniTrendTooltipLabel(value: unknown): ReactNode {
  if (typeof value === 'string') return formatShortDate(value, value)
  if (typeof value === 'number') return value

  return null
}

function MetricLabel({ label, tooltip }: { label: string; tooltip?: string }) {
  return (
    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <span className="truncate">{label}</span>
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label={`About ${label}`}
                className="-my-1"
                size="icon-xs"
                type="button"
                variant="ghost"
              />
            }
          >
            <CircleHelpIcon />
          </TooltipTrigger>
          <TooltipContent align="start" className="max-w-72 leading-relaxed">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  )
}
