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

OMR scanning and answer-sheet generation run in two Python workers, `oliscan`
and `olisheet`, from the separate **archiomr** repository. They exchange files
with Olifogli through shared spool and data directories and update MongoDB
directly. See [docs/omr.md](docs/omr.md) for the protocol.

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
- **Logging**: two channels with the same JSON format (`timestamp`, `level`,
  `source`, `event`); see `docs/deploy.md`. Server logs (process health) go to
  stdout via `serverLog`/`logDiagnostic` in `app/lib/logging.ts`. Application
  logs (what happened: requests, uploads, deletions, jobs) go to
  `LOG_DIR/app-YYYY-MM-DD.log` and Redis via `appLog` in `app/lib/appLog.ts`,
  server side only. Event names are static string literals. Never log
  requests, responses, configuration, raw errors, names, emails, or row data;
  application events may carry the acting user's id (`userId`). Raw `console`
  calls in `app/` fail a test.
- **Denormalized counters** on `sheets` (`nRows`, `nValidRows`, `nSyncedRows`,
  `anomalies`, …) are updated in the same MongoDB transaction as the row change.
- **Files for the archiomr workers**: never write them directly into a spool
  directory; use `stageSpoolFile` (`app/lib/spool.ts`), which writes a `.part`
  file and renames it only after the job is committed. The workers pick up any
  top-level file with their extension (`.pdf`, `.jsonl`).
- **Real-time updates**: most subscriptions carry only a signal; clients refetch
  over HTTP. Follow the same pattern for new ones.
- **Obsolete sheet creation**: the `createSheets` mutation (with
  `Schema.row_to_sheet`, `Distrettuale` and the «Genera fogli» table action)
  and `app/components/SheetsCreation.tsx` (from a `scuole` sheet) are kept only
  until the Olimanager sheet creation (`OlimanagerVenueSheetsCreation`,
  `prepareOlimanagerVenueSheets`) supports all contests. Do not extend them;
  add new contests to the Olimanager creation instead (`VENUE_SHEET_SCHEMAS`).
  District contest sheets come from the Olimanager creation and their rows
  from the `import_participants` worker job
  (`app/lib/olimanagerParticipantImport.ts`); background in
  `docs/piano-gara-distrettuale.md`.
- **Documentation**: keep it in Italian and update the relevant file in `docs/`
  when behavior changes. Refer to code names in backticks so they can be
  grepped.

## Ideas under evaluation (not implemented)

Analysed on 2026-11-22 from Olimanager `main` (`~/olimanager`, apps
`api/olimanager/tickets/` and `api/olimanager/emails/`). The maintainer is still
deciding whether they are useful: do not implement without asking. Check the
deployed Olimanager first, it may differ from `main`.

**Olimanager tickets in the address book** (`/olimanager/<olympiad>/<edition>`):
mainly for staff and olympiad admins (OA).
- Query `tickets { tickets { pk title status statusDisplay lastUpdatedAt
  topic { name } user { email name surname } olympiad { id } } }`, no filters.
  Staff see all tickets, OA those of their olympiads, everyone else only their
  own. Zone admins (CD/RD) do not see the tickets of their RI.
- A ticket belongs to an olympiad, not to an edition. Status `OPEN` = last
  message not seen by staff, `IN_PROGRESS` = seen, not answered, `CLOSED` =
  staff answered the last message (it goes back to `OPEN` if the user writes).
  «Open» would mean `OPEN` + `IN_PROGRESS`.
- `lastUpdatedAt` runs one query per ticket: measure it on many tickets.
- Ticket page on Olimanager: `<frontend>/help/ticket/<pk>`. Messages are
  Markdown, no attachments.
- Planned in two steps:
  1. Read only:
     - open tickets per district and per person, matched by email, with a
       «solo con ticket aperti» filter;
     - a «I miei ticket» section on the home page for the other users;
     - links to Olimanager.
  2. Possibly reply from Olifogli:
     - `createMessage(ticketPk, content)` is allowed to staff, OA and the
       author; it sets `CLOSED`, or `OPEN` if the author writes;
     - Olimanager emails the other people who already wrote in the ticket;
     - `updateTicketStatus` (`IN_PROGRESS` only for staff/OA).
- `createTicket` always uses the requesting user: an OA cannot open a ticket on
  behalf of someone. The Django admin can do it, but sends no email. This would
  need an Olimanager change, e.g. an optional recipient for staff/OA.

**Bulk emails through Olimanager** (to all CD, RD or RI):
- Allowed to edition admins (`SendBulkEmailPermission`):
  1. `saveBulkDraft(editionId, filter, contestId, recipient, subject, body)`
     returns the count and a preview;
  2. `addBulkEmailAttachment`;
  3. `finalizeBulkDraft` sends at once.

  Emails go from the olympiad's sender address and are recorded in Olimanager.
- Recipient groups: subscribed to the edition, not subscribed, or subscribed to
  a contest. Recipient kinds: students, teachers, schools, venue and subvenue
  admins. «All RI» = `SUBSCRIBED` + `TEACHERS`.
- Not possible:
  - CD and RD (zone admins are not a recipient kind);
  - a per-zone filter;
  - an arbitrary address list.
- Each user has one draft per edition: saving from Olifogli overwrites a
  draft the OA is editing in Olimanager.
- Requests for Olimanager, if the idea goes ahead:
  - CD/RD as recipient kinds;
  - a zone filter;
  - tickets opened on behalf of a user.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
