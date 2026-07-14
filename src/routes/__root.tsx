import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { ThemeProvider } from 'next-themes'
import appCss from '../styles.css?url'
import type { QueryClient } from '@tanstack/react-query'
import { NotFoundPage, RouteErrorPage } from '#/components/error-page.tsx'
import { Toaster } from '#/components/ui/sonner.tsx'
import { TooltipProvider } from '#/components/ui/tooltip.tsx'

interface MyRouterContext {
  queryClient: QueryClient
}

const siteDescription =
  'Shopify Partner analytics for revenue, customers, churn, and App Store performance.'

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'MetricsDock',
      },
      {
        name: 'description',
        content: siteDescription,
      },
      {
        property: 'og:type',
        content: 'website',
      },
      {
        property: 'og:title',
        content: 'MetricsDock',
      },
      {
        property: 'og:description',
        content: siteDescription,
      },
      {
        name: 'twitter:card',
        content: 'summary_large_image',
      },
      {
        name: 'twitter:title',
        content: 'MetricsDock',
      },
      {
        name: 'twitter:description',
        content: siteDescription,
      },
    ],
    links: [
      {
        rel: 'icon',
        type: 'image/png',
        href: '/logo.png',
      },
      {
        rel: 'apple-touch-icon',
        href: '/logo.png',
      },
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  errorComponent: RouteErrorPage,
  notFoundComponent: NotFoundPage,
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>

      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          disableTransitionOnChange
          enableSystem
          storageKey="metricsdock-theme"
        >
          <TooltipProvider>{children}</TooltipProvider>

          <Toaster />
        </ThemeProvider>

        <Scripts />
      </body>
    </html>
  )
}
