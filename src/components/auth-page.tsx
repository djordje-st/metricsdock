import type { ReactNode, SVGProps } from 'react'
import { Link } from '@tanstack/react-router'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './ui/card.tsx'
import { Button } from './ui/button.tsx'
import { MetricsDockLogo } from './metricsdock-logo.tsx'
import { SiteFooter } from './site-footer.tsx'

export function AuthPage({
  children,
  description,
  switchLabel,
  switchTo,
  title,
}: {
  children: ReactNode
  description: string
  switchLabel: string
  switchTo: '/login' | '/signup'
  title: string
}) {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <section className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 py-5 sm:px-6">
        <nav className="flex h-14 items-center justify-between gap-4">
          <Link
            to="/"
            className="flex items-center gap-2.5 text-lg font-semibold tracking-tight text-foreground transition-colors hover:text-primary"
          >
            <MetricsDockLogo />
            <span>MetricsDock</span>
          </Link>
          <Button variant="ghost" render={<Link to={switchTo} />}>
            {switchLabel}
          </Button>
        </nav>

        <div className="flex flex-1 items-center justify-center py-8">
          <Card className="w-full rounded-2xl bg-card/95 shadow-2xl shadow-primary/5 ring-1 ring-border [--card-spacing:--spacing(5)]">
            <CardHeader className="gap-2">
              <CardTitle className="text-2xl font-semibold tracking-tight">
                {title}
              </CardTitle>
              <CardDescription className="text-base leading-relaxed">
                {description}
              </CardDescription>
            </CardHeader>
            <CardContent>{children}</CardContent>
          </Card>
        </div>
      </section>
      <SiteFooter />
    </main>
  )
}

export function GoogleLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="#4285F4"
        d="M21.6 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h5.4c-.2 1.2-.9 2.3-2 3v2.4h3.2c1.9-1.7 3-4.2 3-7.1z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 5-.9 6.6-2.5l-3.2-2.4c-.9.6-2 .9-3.4.9-2.6 0-4.8-1.8-5.6-4.1H3.1v2.5C4.8 19.7 8.1 22 12 22z"
      />
      <path
        fill="#FBBC05"
        d="M6.4 13.9c-.2-.6-.3-1.2-.3-1.9s.1-1.3.3-1.9V7.6H3.1C2.4 8.9 2 10.4 2 12s.4 3.1 1.1 4.4l3.3-2.5z"
      />
      <path
        fill="#EA4335"
        d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8C16.9 3 14.7 2 12 2 8.1 2 4.8 4.3 3.1 7.6l3.3 2.5C7.2 7.8 9.4 6 12 6z"
      />
    </svg>
  )
}
