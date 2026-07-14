# Contributing

Thanks for helping improve MetricsDock.

## Development workflow

1. Fork the repository and create a focused branch.
2. Follow the [local setup](README.md#local-setup).
3. Keep changes scoped to one concern and update documentation when behavior or configuration changes.
4. Run the required checks:

   ```bash
   pnpm typecheck
   pnpm check
   pnpm lint
   pnpm check:generated
   pnpm build
   ```

5. Open a pull request that explains the problem, the solution, and any manual verification performed.

Tests were intentionally removed from the current project, so do not add a test framework as part of an unrelated change.

## Project conventions

- Authenticate inside every server function or endpoint that accesses user data.
- Scope tenant data to the active Better Auth organization.
- Keep client-importable server functions in `*.functions.ts` and server-only logic in `*.server.ts`.
- Use TanStack Form with Zod and existing shadcn components for application forms.
- Regenerate routes with `pnpm generate-routes` after adding, moving, or deleting route files.
- Generate Drizzle migrations with `pnpm db:generate`; do not edit migration snapshots by hand.
- Never commit `.env.local`, tokens, customer data, production exports, or logs containing sensitive fields.

Be respectful and constructive in issues, reviews, and discussions.
