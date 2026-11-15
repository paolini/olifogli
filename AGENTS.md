# AGENTS.md

Guidance for AI agents working on this repository. Human-facing documentation
is in Italian: start from [README.md](README.md), which links to the guides in
[docs/](docs/).

## What this is

Olifogli is a Next.js + GraphQL + MongoDB web app where teachers enter the
results of math competitions. Users log in through Olimanager (OAuth2/OIDC).
Data is organized as workbooks → sheets → rows, with per-sheet permissions.
The UI and user-facing messages are in Italian.

## Processes

| Process | Entry point | Dev command |
|---|---|---|
| Next.js (HTTP GraphQL at `/graphql`, pages, REST) | `app/` | `npm run dev` |
| WebSocket server (GraphQL subscriptions only, port 4001) | `ws-server.ts` | `npm run ws-server:watch` |
| Background worker (Olimanager jobs, sheet encryption) | `olifogli-worker.ts` | `npm run olifogli:worker` |

MongoDB must be a replica set (transactions, change streams). Redis is the
Pub/Sub between processes. `docker compose up -d --wait db redis` starts both.

## Commands

```bash
npm test          # node --test tests/*.test.cjs; no MongoDB/Redis needed
npm run lint      # ESLint; existing warnings are known, add no new ones
npx tsc --noEmit -p .
npm run codegen   # regenerate app/graphql/generated.ts
```

## Where things are

- `app/graphql/schema.gql`: GraphQL schema (source of truth).
- `app/graphql/resolvers.ts`: resolver registry; one resolver per file in
  `app/graphql/resolvers/`.
- `app/lib/models.ts`: MongoDB document types (source of truth).
- `app/lib/mongodb.ts`: collection accessors (`getSheetsCollection`, …).
- `app/lib/schema.ts` and `app/lib/schema/`: sheet schemas (fields,
  validation, scoring).
- `app/lib/pubsub.ts`: Redis topics. `app/lib/olimanager*.ts`: Olimanager
  integration and background jobs.
- `app/components/`: React components; client GraphQL documents are usually
  defined inline with `gql` in the component that uses them.

## Conventions

- **Adding a GraphQL field**: edit `schema.gql`, add the resolver file, register
  it in `resolvers.ts`, run `npm run codegen`. Admin-only resolvers start with
  `check_admin(await get_authenticated_user(context))`.
- **`generated.ts` cleanup**: codegen emits a `// @ts-ignore` line followed by
  two overload signatures for every `use…SuspenseQuery`. The committed file has
  these three lines removed (they fail lint); remove them again after codegen so
  the diff only contains real changes.
- **Restart the ws-server** after changing `schema.gql` or subscription
  resolvers: it loads the schema at startup.
- **Logging**: never `console.log` requests, responses, configuration, or raw
  errors. Use `logDiagnostic` with a static event name. Logs must not contain
  identities, variables, or payloads.
- **Denormalized counters** on `sheets` (`nRows`, `nValidRows`, `nSyncedRows`,
  `anomalies`, …) are updated in the same MongoDB transaction as the row change.
- **Real-time updates**: most subscriptions carry only a signal; clients refetch
  over HTTP. Follow the same pattern for new ones.
- **Documentation**: keep it in Italian and update the relevant file in `docs/`
  when behavior changes. Refer to code names in backticks so they can be
  grepped.
