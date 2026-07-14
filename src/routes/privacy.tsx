import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeftIcon } from 'lucide-react'

import { MetricsDockLogo } from '#/components/metricsdock-logo.tsx'
import { SiteFooter } from '#/components/site-footer.tsx'

export const Route = createFileRoute('/privacy')({
  head: () => ({
    meta: [
      { title: 'Privacy Policy | MetricsDock' },
      {
        name: 'description',
        content:
          'Privacy policy for MetricsDock, a Shopify Partner analytics service.',
      },
    ],
  }),
  component: Privacy,
})

const dataGroups = [
  {
    title: 'Account and organization data',
    items: [
      'Name, email address, login method, session data, and authentication metadata.',
      'Organization names, member roles, invitations, and active organization settings.',
      'Passkey public credential data if you add a passkey.',
    ],
  },
  {
    title: 'Shopify Partner connection data',
    items: [
      'Partner organization IDs, Partner app IDs, connection labels, and sync settings.',
      'Shopify Partner API tokens, encrypted at rest.',
      'Permission checks for Manage apps and View financials access.',
    ],
  },
  {
    title: 'Shopify Partner analytics data',
    items: [
      'App events, shop relationships, installs, uninstalls, reactivations, and deactivations.',
      'Subscriptions, usage charges, financial transactions, gross and net amounts, and currencies.',
      'Uninstall reasons, merchant-provided comments, and raw Partner API payloads used to rebuild reports.',
    ],
  },
  {
    title: 'Usage and security data',
    items: [
      'IP address, user agent, request metadata, device/browser information, and essential cookies.',
      'Sync job status, errors, timestamps, and operational logs used to run and secure the service.',
    ],
  },
]

const useCases = [
  'Create, authenticate, and secure MetricsDock accounts.',
  'Manage organization membership, invitations, roles, and permissions.',
  'Connect to Shopify Partner API with credentials you provide.',
  'Sync Partner events, shops, subscriptions, transactions, and uninstall feedback.',
  'Build revenue, customer, churn, shop, and sync health reports.',
  'Debug errors, prevent abuse, maintain auditability, and comply with legal obligations.',
]

const rights = [
  'Access, correct, export, or delete personal information where applicable.',
  'Object to or restrict certain processing where applicable.',
  'Withdraw consent where processing is based on consent.',
  'Opt out of marketing communications.',
  'Lodge a complaint with a data protection authority where applicable.',
]

function Privacy() {
  return (
    <>
      <main className="min-h-dvh bg-background text-foreground">
        <nav className="border-b border-border/70">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 lg:px-6">
            <Link to="/" className="flex items-center gap-2.5">
              <MetricsDockLogo />
              <span className="text-lg font-semibold tracking-tight">
                MetricsDock
              </span>
            </Link>
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeftIcon className="size-4" />
              Home
            </Link>
          </div>
        </nav>

        <section className="mx-auto max-w-4xl px-4 py-16 lg:px-6 lg:py-20">
          <p className="text-sm font-medium text-primary">Privacy Policy</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-balance md:text-5xl">
            How MetricsDock handles data.
          </h1>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            Last updated June 28, 2026. MetricsDock is a standalone analytics
            service for Shopify app developers. It imports Shopify Partner API
            data you authorize so your organization can report on revenue,
            customers, shops, subscriptions, churn, and sync health.
          </p>
          <p className="mt-6 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm leading-6 text-foreground">
            This policy is a publication draft and is not legal advice. Replace
            the company name, address, privacy contact, retention periods, and
            jurisdiction-specific clauses after legal review.
          </p>
        </section>

        <section className="mx-auto grid max-w-7xl gap-4 px-4 pb-16 md:grid-cols-2 lg:px-6">
          {dataGroups.map((group) => (
            <article
              key={group.title}
              className="rounded-lg border border-border bg-card p-5"
            >
              <h2 className="text-lg font-semibold tracking-tight">
                {group.title}
              </h2>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
                {group.items.map((item) => (
                  <li key={item} className="flex gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-2 size-1.5 shrink-0 rounded-full bg-primary"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        <section className="border-y border-border bg-muted/30 px-4 py-14 lg:px-6">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-2">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                How we use information
              </h2>
              <ul className="mt-5 space-y-3 text-sm leading-6 text-muted-foreground">
                {useCases.map((item) => (
                  <li key={item} className="flex gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-2 size-1.5 shrink-0 rounded-full bg-primary"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Your rights
              </h2>
              <ul className="mt-5 space-y-3 text-sm leading-6 text-muted-foreground">
                {rights.map((item) => (
                  <li key={item} className="flex gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-2 size-1.5 shrink-0 rounded-full bg-primary"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-4 py-16 lg:px-6">
          <div className="space-y-8 text-sm leading-7 text-muted-foreground">
            <section>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                Sharing
              </h2>
              <p className="mt-3">
                MetricsDock shares data with authorized organization members,
                Shopify, authentication providers you choose, infrastructure and
                security providers, professional advisers, and legal authorities
                when required. MetricsDock does not sell personal information or
                share it for cross-context behavioral advertising based on
                current product behavior.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                Retention
              </h2>
              <p className="mt-3">
                Account and organization data is retained while the account or
                organization is active. Partner analytics data is retained while
                the organization keeps the relevant connection or app data.
                Concrete retention periods for logs, backups, raw payloads, and
                deleted accounts must be confirmed before publication.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                Contact
              </h2>
              <p className="mt-3">
                For privacy questions or requests, contact{' '}
                <span className="font-medium text-foreground">
                  [LEGAL REVIEW REQUIRED: insert privacy email]
                </span>
                . The legal company name and registered address must be added
                before this policy is published.
              </p>
            </section>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  )
}
