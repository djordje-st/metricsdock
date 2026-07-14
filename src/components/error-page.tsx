import type {
  ErrorComponentProps,
  NotFoundRouteProps,
} from '@tanstack/react-router'
import { Link, useRouter } from '@tanstack/react-router'
import {
  AlertTriangleIcon,
  HomeIcon,
  RefreshCcwIcon,
  SearchXIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '#/components/ui/button.tsx'
import { cn } from '#/lib/utils.ts'

export function ErrorState({
  actions,
  className,
  description,
  icon: Icon = AlertTriangleIcon,
  statusCode,
  title,
}: {
  actions?: ReactNode
  className?: string
  description: string
  icon?: LucideIcon
  statusCode: string
  title: string
}) {
  return (
    <section
      className={cn(
        'flex min-h-[24rem] w-full flex-col items-center justify-center gap-6 rounded-xl border bg-muted/20 p-6 text-center',
        className,
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-xl bg-background text-muted-foreground ring-1 ring-border">
        <Icon className="size-5" />
      </div>

      <div className="flex max-w-md flex-col items-center gap-2">
        <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
          {statusCode}
        </p>

        <h1 className="font-heading text-2xl font-semibold tracking-tight text-balance">
          {title}
        </h1>

        <p className="text-sm leading-6 text-muted-foreground text-balance">
          {description}
        </p>
      </div>

      {actions ? (
        <div className="flex flex-wrap justify-center gap-2">{actions}</div>
      ) : null}
    </section>
  )
}

export function ErrorPage({
  className,
  ...props
}: React.ComponentProps<typeof ErrorState>) {
  return (
    <main className="flex min-h-dvh bg-background p-4 text-foreground md:p-6">
      <ErrorState className={cn('m-auto max-w-3xl', className)} {...props} />
    </main>
  )
}

export function NotFoundPage(_props: NotFoundRouteProps) {
  return (
    <ErrorPage
      statusCode="404"
      title="Page not found"
      description="This page does not exist, or it is no longer available in this workspace."
      icon={SearchXIcon}
      actions={
        <>
          <Button render={<Link to="/dashboard" />}>
            <HomeIcon data-icon="inline-start" />
            Dashboard
          </Button>

          <Button variant="outline" render={<Link to="/" />}>
            Home
          </Button>
        </>
      }
    />
  )
}

export function RouteErrorPage({ reset }: ErrorComponentProps) {
  const router = useRouter()

  function retry() {
    reset()
    void router.invalidate()
  }

  return (
    <ErrorPage
      statusCode="500"
      title="Something went wrong"
      description="The page could not be loaded. Try again, or return to a stable page."
      actions={
        <>
          <Button type="button" onClick={retry}>
            <RefreshCcwIcon data-icon="inline-start" />
            Retry
          </Button>

          <Button variant="outline" render={<Link to="/dashboard" />}>
            Dashboard
          </Button>
        </>
      }
    />
  )
}
