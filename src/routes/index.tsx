import type { CSSProperties } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ArrowRightIcon,
  CheckIcon,
  ChevronDownIcon,
  DatabaseIcon,
  GitBranchIcon,
  LineChartIcon,
  PlugZapIcon,
  ShieldCheckIcon,
  StoreIcon,
} from 'lucide-react'

import { Button } from '#/components/ui/button.tsx'
import { MetricsDockLogo } from '#/components/metricsdock-logo.tsx'
import { RankedBarChart, ReportChart } from '#/components/report-chart.tsx'
import { SiteFooter } from '#/components/site-footer.tsx'
import type { RankedPoint, SeriesPoint } from '#/components/report-chart.tsx'

export const Route = createFileRoute('/')({ component: Home })

const navLinks = [
  { href: '#reports', label: 'Reports' },
  { href: '#workflow', label: 'Workflow' },
  { href: '#drill-down', label: 'Drill-down' },
  { href: '#pricing', label: 'Pricing' },
]

const pricingIncludes = [
  'Revenue, customer, and churn reports',
  'Unlimited syncs and connected Partner apps',
  'Full Partner event history, stored at the source',
  'Drill-down into shops, invoices, and events',
]

const faqs = [
  {
    question: 'Which Shopify data does MetricsDock read?',
    answer:
      'It connects to the Shopify Partner API with your organization-scoped access token and reads apps, events, and transactions. Manage apps covers apps and events; View financials covers transactions.',
  },
  {
    question: 'How do I add an app to track?',
    answer:
      'The Partner API has no top-level app listing, so you paste your Partner app IDs in the UI. MetricsDock normalizes them to Partner GIDs for you.',
  },
  {
    question: 'Where does my Partner data live?',
    answer:
      'Raw Partner payloads are stored so reports can be rebuilt when definitions change. Everything stays scoped to your active organization.',
  },
  {
    question: 'Can my team share one workspace?',
    answer:
      'Yes. Organizations are the tenant boundary. Invite teammates to your organization as owners, admins, or members, each with their own permissions.',
  },
  {
    question: 'What does it cost?',
    answer:
      'Free during early access. When paid plans arrive, pricing is $3 per app you add, and nothing is charged before then.',
  },
]

const signalItems = [
  'Recurring revenue',
  'Usage charges',
  'Store installs',
  'Cancellations',
  'Trial activity',
  'Merchant feedback',
  'Plan changes',
  'Partner events',
]

// Sample data, used only to render the real product chart components on the
// marketing page. Values are illustrative, not pulled from a live workspace.
const heroRevenue: SeriesPoint[] = [
  { date: '2025-07-01', value: 9_200 },
  { date: '2025-08-01', value: 10_400 },
  { date: '2025-09-01', value: 11_050 },
  { date: '2025-10-01', value: 12_600 },
  { date: '2025-11-01', value: 13_900 },
  { date: '2025-12-01', value: 14_300 },
  { date: '2026-01-01', value: 15_700 },
  { date: '2026-02-01', value: 16_100 },
  { date: '2026-03-01', value: 16_950 },
  { date: '2026-04-01', value: 17_600 },
  { date: '2026-05-01', value: 18_050 },
  { date: '2026-06-01', value: 18_420 },
]

const bentoTrend: SeriesPoint[] = [
  { date: '2026-01-01', value: 412 },
  { date: '2026-02-01', value: 388 },
  { date: '2026-03-01', value: 503 },
  { date: '2026-04-01', value: 547 },
  { date: '2026-05-01', value: 612 },
  { date: '2026-06-01', value: 698 },
]

const revenueByApp: RankedPoint[] = [
  { name: 'Bundle Forge', value: 7_240 },
  { name: 'Restock Radar', value: 5_180 },
  { name: 'Ledgerline', value: 3_460 },
  { name: 'Shipgrid', value: 2_120 },
  { name: 'Proofkit', value: 1_290 },
]

const heroStats = [
  { label: 'MRR', value: '$18.4K' },
  { label: 'Active stores', value: '1,284' },
  { label: 'Net churn', value: '2.1%' },
]

const workflowSteps = [
  {
    icon: PlugZapIcon,
    title: 'Connect the source',
    body: 'Add Partner app IDs and connect the organization-scoped API once. MetricsDock normalizes them to Partner GIDs.',
  },
  {
    icon: DatabaseIcon,
    title: 'Keep the ledger',
    body: 'Sync raw transactions, app events, and store relationships into durable tables that survive definition changes.',
  },
  {
    icon: LineChartIcon,
    title: 'Read the reports',
    body: 'Rebuild revenue, customer, and churn views from stored source data, and check any number against its events.',
  },
]

function Home() {
  const marqueeItems = [...signalItems, ...signalItems]

  return (
    <main className="min-h-dvh w-full max-w-full overflow-x-hidden bg-background text-foreground">
      <nav className="sticky top-0 z-20 border-b border-border/70 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 lg:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <MetricsDockLogo />
            <span className="text-lg font-semibold tracking-tight">
              MetricsDock
            </span>
          </Link>

          <div className="hidden items-center gap-8 text-sm text-muted-foreground lg:flex">
            {navLinks.map((link) => (
              <a
                key={link.href}
                className="transition-colors hover:text-foreground"
                href={link.href}
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" render={<Link to="/login" />}>
              Sign in
            </Button>
            <Button render={<Link to="/signup" />}>
              Start tracking
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero: asymmetric split, real product chart as the right-hand asset */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_40rem_at_72%_-10%,rgb(56_132_255/.16),transparent_60%)] dark:bg-[radial-gradient(60rem_40rem_at_72%_-10%,rgb(56_132_255/.2),transparent_60%)]"
        />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 pt-16 pb-20 lg:grid-cols-[minmax(0,1fr)_minmax(26rem,32rem)] lg:px-6 lg:pt-24 lg:pb-28">
          <div className="space-y-7" data-reveal>
            <h1 className="max-w-[15ch] text-[clamp(2.5rem,4.6vw,3.9rem)] leading-[1.02] font-semibold tracking-tight text-balance">
              Partner analytics, traced to the event.
            </h1>
            <p className="max-w-xl text-lg leading-8 text-muted-foreground">
              MetricsDock turns Shopify Partner API events into revenue,
              customer, and churn reports you can audit down to the source.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button size="lg" render={<Link to="/signup" />}>
                Start tracking
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
              <Button size="lg" variant="outline" render={<Link to="/login" />}>
                Sign in
              </Button>
            </div>
          </div>

          <div
            className="relative"
            data-reveal
            style={{ '--metricsdock-delay': '120ms' } as CSSProperties}
          >
            <HeroPanel />
          </div>
        </div>
      </section>

      {/* Signals: the single kinetic marquee on the page */}
      <section
        aria-label="Signals MetricsDock tracks"
        className="overflow-hidden border-y border-border/70 bg-muted/40 py-5"
      >
        <div className="metricsdock-marquee flex w-max gap-3 px-4">
          {marqueeItems.map((item, index) => (
            <span
              key={`${item}-${index}`}
              className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground shadow-sm"
            >
              {item}
            </span>
          ))}
        </div>
      </section>

      {/* Reports: bento grid with a real chart in the lead cell */}
      <section id="reports" className="mx-auto max-w-7xl px-4 py-24 lg:px-6">
        <div className="max-w-3xl space-y-4" data-reveal-scroll>
          <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">
            Reports built from the source.
          </h2>
          <p className="text-lg leading-8 text-muted-foreground">
            MetricsDock keeps the raw Partner API payloads close, so every
            visible metric can be checked and rebuilt when definitions change.
          </p>
        </div>

        <div className="mt-12 grid auto-rows-[minmax(0,auto)] grid-cols-1 gap-4 md:grid-cols-3">
          <article
            className="flex flex-col gap-6 rounded-2xl border border-border bg-card p-6 ring-1 ring-foreground/5 md:col-span-2 md:row-span-2"
            data-reveal-scroll
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <h3 className="text-2xl font-semibold tracking-tight">
                  Reports that trace back
                </h3>
                <p className="max-w-md leading-7 text-muted-foreground">
                  Revenue, customers, and churn stay tied to the raw Partner
                  events that created them.
                </p>
              </div>
              <LineChartIcon
                className="mt-1 size-6 shrink-0 text-primary"
                strokeWidth={2}
              />
            </div>
            <div className="mt-auto rounded-xl border border-border/70 bg-muted/30 p-3">
              <ReportChart data={bentoTrend} type="area" className="h-48" />
            </div>
          </article>

          <article
            className="flex flex-col justify-between gap-10 rounded-2xl bg-primary p-6 text-primary-foreground shadow-lg shadow-primary/20"
            data-reveal-scroll
          >
            <StoreIcon className="size-6 opacity-90" strokeWidth={2} />
            <div className="space-y-2">
              <h3 className="text-2xl font-semibold tracking-tight">
                Store movement
              </h3>
              <p className="leading-7 text-primary-foreground/85">
                Installs, uninstalls, plan changes, and reactivations from one
                event stream.
              </p>
            </div>
          </article>

          <article
            className="flex flex-col justify-between gap-10 rounded-2xl bg-zinc-950 p-6 text-white ring-1 ring-white/10 dark:bg-zinc-900"
            data-reveal-scroll
          >
            <ShieldCheckIcon className="size-6 opacity-90" strokeWidth={2} />
            <div className="space-y-2">
              <h3 className="text-2xl font-semibold tracking-tight">
                Operational checks
              </h3>
              <p className="leading-7 text-white/70">
                Keep sync status, app IDs, and connections visible before
                reports go stale.
              </p>
            </div>
          </article>
        </div>
      </section>

      {/* Workflow: vertical numbered timeline */}
      <section
        id="workflow"
        className="border-y border-border/70 bg-muted/30 py-24"
      >
        <div className="mx-auto max-w-3xl px-4 lg:px-6">
          <div className="space-y-4" data-reveal-scroll>
            <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">
              The flow stays auditable.
            </h2>
            <p className="text-lg leading-8 text-muted-foreground">
              Connect the Partner API, sync raw events, and rebuild analytics
              from stored source data.
            </p>
          </div>

          <ol className="mt-12 space-y-8">
            {workflowSteps.map((step, index) => {
              const Icon = step.icon
              const isLast = index === workflowSteps.length - 1

              return (
                <li
                  key={step.title}
                  className="relative grid grid-cols-[auto_minmax(0,1fr)] gap-5"
                  data-reveal-scroll
                  style={
                    {
                      '--metricsdock-delay': `${index * 70}ms`,
                    } as CSSProperties
                  }
                >
                  <div className="flex flex-col items-center">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-card font-mono text-sm font-medium text-muted-foreground shadow-sm">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    {!isLast && (
                      <span
                        aria-hidden="true"
                        className="mt-1 w-px flex-1 bg-border"
                      />
                    )}
                  </div>
                  <div className="pb-2">
                    <div className="flex items-center gap-2.5">
                      <Icon
                        className="size-5 text-primary"
                        strokeWidth={2}
                        aria-hidden="true"
                      />
                      <h3 className="text-xl font-semibold tracking-tight">
                        {step.title}
                      </h3>
                    </div>
                    <p className="mt-2 max-w-xl leading-7 text-muted-foreground">
                      {step.body}
                    </p>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      </section>

      {/* Drill-down: full-width showcase with a real ranked chart */}
      <section id="drill-down" className="mx-auto max-w-7xl px-4 py-24 lg:px-6">
        <div className="max-w-3xl space-y-4" data-reveal-scroll>
          <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">
            Open the part that matters.
          </h2>
          <p className="text-lg leading-8 text-muted-foreground">
            Each report starts narrow, then lets you drill into the shops,
            invoices, and events behind the summary.
          </p>
        </div>

        <div
          className="mt-12 overflow-hidden rounded-3xl border border-border bg-card ring-1 ring-foreground/5"
          data-reveal-scroll
        >
          <div className="flex items-center justify-between gap-4 border-b border-border/70 px-6 py-4">
            <div className="flex items-center gap-2.5 text-sm font-medium">
              <GitBranchIcon
                className="size-4 text-muted-foreground"
                strokeWidth={2}
              />
              Revenue by app
            </div>
            <span className="text-xs font-medium text-muted-foreground">
              Sample workspace
            </span>
          </div>
          <div className="grid gap-8 p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:items-center">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-1">
              {[
                { label: 'Tracked apps', value: '12' },
                { label: 'Revenue items', value: '48,210' },
                { label: 'Last sync', value: '4 min ago' },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl border border-border/70 bg-muted/30 p-4"
                >
                  <dt className="text-xs text-muted-foreground">
                    {item.label}
                  </dt>
                  <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
              <RankedBarChart data={revenueByApp} className="h-64" />
            </div>
          </div>
        </div>
      </section>

      {/* Pricing: a single early-access offer, not a three-card wall */}
      <section
        id="pricing"
        className="border-t border-border/70 bg-muted/30 py-24"
      >
        <div className="mx-auto max-w-7xl px-4 lg:px-6">
          <div className="max-w-3xl space-y-4" data-reveal-scroll>
            <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">
              Free while we are in early access.
            </h2>
            <p className="text-lg leading-8 text-muted-foreground">
              Every report, sync, and connection is free during early access.
              When paid plans arrive, pricing stays simple: $3 per app you add.
            </p>
          </div>

          <div
            className="mt-12 grid overflow-hidden rounded-3xl border border-border bg-card ring-1 ring-foreground/5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]"
            data-reveal-scroll
          >
            <div className="flex flex-col justify-between gap-8 border-b border-border/70 p-8 lg:border-r lg:border-b-0 lg:p-10">
              <div className="space-y-5">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary ring-1 ring-primary/20">
                  <span className="size-1.5 rounded-full bg-primary" />
                  Early access
                </span>
                <div className="space-y-1">
                  <div className="text-6xl font-semibold tracking-tight tabular-nums">
                    $0
                  </div>
                  <div className="text-sm font-medium text-muted-foreground">
                    Free during early access
                  </div>
                </div>
                <p className="max-w-sm leading-7 text-muted-foreground">
                  Connect your Partner data and use every report at no cost
                  while MetricsDock is in early access.
                </p>
              </div>
              <Button
                size="lg"
                className="w-full sm:w-auto"
                render={<Link to="/signup" />}
              >
                Start tracking
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
            </div>

            <div className="flex flex-col gap-6 p-8 lg:p-10">
              <ul className="space-y-3">
                {pricingIncludes.map((item) => (
                  <li key={item} className="flex items-start gap-3 leading-7">
                    <CheckIcon
                      className="mt-1 size-4 shrink-0 text-primary"
                      strokeWidth={2.5}
                      aria-hidden="true"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto rounded-xl border border-border/70 bg-muted/30 p-4">
                <div className="text-sm font-medium">
                  When early access ends
                </div>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Pricing becomes $3 per app you add. Nothing is charged until
                  then, and you will hear from us before anything changes.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA: the one intentional dark contrast band */}
      <section className="px-4 py-24 lg:px-6">
        <div
          className="mx-auto grid max-w-7xl gap-8 overflow-hidden rounded-3xl bg-zinc-950 p-8 text-white shadow-2xl shadow-primary/10 ring-1 ring-white/10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:p-12 dark:bg-zinc-900"
          data-reveal-scroll
        >
          <div className="max-w-2xl space-y-4">
            <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">
              Replace the reporting spreadsheet.
            </h2>
            <p className="text-lg leading-8 text-white/70">
              Connect Partner data once, then keep revenue and churn reporting
              in the app built for it.
            </p>
          </div>
          <Button size="lg" variant="secondary" render={<Link to="/signup" />}>
            Start tracking
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </div>
      </section>

      {/* FAQ: native disclosure list, sits just above the footer */}
      <section className="border-t border-border/70 py-24">
        <div className="mx-auto max-w-3xl px-4 lg:px-6">
          <div className="space-y-4" data-reveal-scroll>
            <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">
              Questions, answered.
            </h2>
            <p className="text-lg leading-8 text-muted-foreground">
              The short version of how MetricsDock connects, stores, and bills.
            </p>
          </div>

          <div className="mt-10 divide-y divide-border" data-reveal-scroll>
            {faqs.map((faq) => (
              <details key={faq.question} className="group py-2">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-4 text-lg font-medium tracking-tight [&::-webkit-details-marker]:hidden">
                  {faq.question}
                  <ChevronDownIcon
                    className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                </summary>
                <p className="max-w-2xl pb-4 leading-7 text-muted-foreground">
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>
      <SiteFooter />
    </main>
  )
}

function HeroPanel() {
  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="absolute -inset-3 rounded-[2rem] bg-primary/10 blur-2xl"
      />
      <div
        aria-label="Sample MetricsDock revenue report"
        className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-primary/10 ring-1 ring-foreground/5"
      >
        <div className="flex items-center justify-between gap-4 border-b border-border/70 px-5 py-3.5">
          <div className="space-y-1.5">
            <div className="text-sm font-medium tracking-tight">
              Recurring revenue
            </div>
            <div className="text-xs text-muted-foreground">
              Last 12 months · Sample data
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary ring-1 ring-primary/20">
            <span className="size-1.5 rounded-full bg-primary" />
            Synced
          </span>
        </div>

        <div className="grid grid-cols-3 divide-x divide-border/70 border-b border-border/70">
          {heroStats.map((stat) => (
            <div key={stat.label} className="px-5 py-4">
              <div className="text-xs text-muted-foreground">{stat.label}</div>
              <div className="mt-1 text-xl font-semibold tracking-tight tabular-nums">
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        <div className="p-4">
          <ReportChart data={heroRevenue} type="area" className="h-56" />
        </div>
      </div>
    </div>
  )
}
