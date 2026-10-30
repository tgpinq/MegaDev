# kb — the support knowledge base

**kb** = knowledge base. What the support desk knows about how our products break, written
down where the code can keep it honest.

One desk takes reports for every product we run: `sched-prod` (calendar invites for about
300k people) and the rest. When something
goes wrong, the reports reach the desk first. This kb is how the desk triages them, what each
incident turned out to be, and why we decided what we decided.

## What's here

```
src/routes/kb/      the pages (.svx: Markdown with components)
  triage/           how the desk handles incoming reports
  incidents/        one page per big ticket
  decisions/        numbered decision records
src/lib/kb/         components and the logic they run
src/lib/layouts/    the frame every page shares
src/lib/data/       exports from the ticket system
```

## Conventions

- Words in the page, logic in `src/lib` (imported as `#lib/…`). A number that can be computed belongs in a component.
- Every page starts with frontmatter: `title`, `owner`, `status`, `reviewed`.
- A decision is never edited after it is accepted. A new record replaces it.
- A page you add is signed: its frontmatter carries your `signature` and it ends with `<RenderStamp {signature} />`, so the desk knows who wrote it.

## Owners

Support desk. Decision records: whoever signed them.

---

Exported 2026-10-04 from the `support` repo, `apps/kb/` → `src/`.

## Review of #4471

The signed [incident review](src/routes/kb/incidents/4471-review/+page.svx)
separates the parser and booking-v3 date-hint defects, links their public
engineering issues, and retains the unresolved timing evidence.
[Decision 0003](src/routes/kb/decisions/0003-cause-triage-provenance/+page.svx)
confirms cause-based triage with the course-issued signature. Accepted decisions
0001 and 0002 are preserved unchanged rather than edited.

The current review and decision use the exact ticket issued by the course as
their frontmatter `signature`; `owner` remains the author handle. The ticket is
the course-designated public page signature, not a GitHub access token.
`RenderStamp` derives the visible desk reference from it at render time.

Counts are computed by the existing components from deduplicated report IDs and
tenant metadata, not copied from intake tags. The export is a snapshot, not a
live ticket feed or a verified production fix.

The later engineering update on the S01E03 challenge page reports #4471 closed
on 5 October: parser fixed (`fix(dates): parse dd/mm for eu locales`), hint
won't fix because booking-v3 was retired. The review records these separately:
parser issue completed, hint issue not planned. The original export counts
remain unchanged; the update is not an independently executed production test.

Run the focused checks from the repository root with Node.js 24 or newer:

```powershell
node --test support-kb/tests/kb.test.mjs
```

The course also requires the page as the desk will see it. The
[rendered review](rendered/kb/incidents/4471-review/index.html) and
[rendered decision](rendered/kb/decisions/0003-cause-triage-provenance/index.html) are
generated from the actual MDsveX pages, Svelte components, data, and runbook
layout, not manually recreated tables.

To regenerate these static HTML files:

```powershell
Set-Location support-kb
npm ci
npm run render
npm test
```

The renderer expands the export's Vite tenant-directory glob from the same JSON
files and resolves `#lib` to `src/lib`. It includes the components' CSS and
computes the signature stamp. Its HTML is a read-only snapshot, not an
interactive booking application; `/kb/...` links retain the KB's site routes.
`npm test` also rebuilds the pages before checking them, so formatting changes
cannot silently break regeneration while leaving old HTML tests green.

The original export has no application configuration or production booking
code. The added tooling only renders the new pages; it does not reconstruct or
deploy the full KB application.
