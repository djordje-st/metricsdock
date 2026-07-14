import type { ReactNode } from 'react'
import { Badge } from '#/components/ui/badge.tsx'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card.tsx'
import { cn } from '#/lib/utils.ts'

type PageInsightStat = {
  label: string
  value: ReactNode
  description?: ReactNode
}

export function PageInsightCard({
  eyebrow,
  title,
  description,
  action,
  stats,
  children,
  className,
}: {
  eyebrow?: ReactNode
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
  stats?: PageInsightStat[]
  children?: ReactNode
  className?: string
}) {
  return (
    <Card
      className={cn('bg-muted/20 [--card-spacing:--spacing(5)]', className)}
    >
      {eyebrow || title || description || action ? (
        <CardHeader
          className={cn(
            'flex flex-col gap-4 md:flex-row md:items-start md:justify-between',
          )}
        >
          {eyebrow || title || description ? (
            <div className="flex min-w-0 flex-col gap-3">
              {eyebrow ? (
                <Badge variant="outline" className="w-fit">
                  {eyebrow}
                </Badge>
              ) : null}
              {title || description ? (
                <div className="flex flex-col gap-2">
                  {title ? (
                    <CardTitle className="text-xl leading-tight font-semibold md:text-2xl">
                      {title}
                    </CardTitle>
                  ) : null}
                  {description ? (
                    <CardDescription className="max-w-3xl text-pretty leading-relaxed">
                      {description}
                    </CardDescription>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          {action ? (
            <CardAction className="ml-auto w-full md:w-auto">
              {action}
            </CardAction>
          ) : null}
        </CardHeader>
      ) : null}
      {stats?.length || Boolean(children) ? (
        <CardContent className="flex flex-col gap-3">
          {stats?.length ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="flex min-h-28 min-w-0 flex-col justify-between gap-3 rounded bg-background/80 p-4 ring-1 ring-border/70"
                >
                  <div className="text-sm text-muted-foreground">
                    {stat.label}
                  </div>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <div className="truncate font-heading text-2xl leading-none font-semibold tabular-nums">
                      {stat.value}
                    </div>
                    {stat.description ? (
                      <p className="text-pretty text-sm text-muted-foreground">
                        {stat.description}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {children}
        </CardContent>
      ) : null}
    </Card>
  )
}
