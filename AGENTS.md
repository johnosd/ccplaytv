# Repository Guidelines

`ccplayTv` is a Samsung Tizen Smart TV app for organizing and playing IPTV (M3U/Xtream) catalogs enriched with TMDB metadata. Voice control (OpenAI) and an Android remote-control companion are planned; consult the backlog before describing any feature as delivered.

## Standing Rules & Status Authority

The app is **client-first** (ADR-008): import, classification, catalog storage and playback run on the TV, with IndexedDB via Dexie and no always-on backend.

Feature status belongs in `.planning/backlog.md` (`## Features`) and `sdd/specs/<NNN-slug>/plan.md` (`## Estado Atual`), not in this file or `CLAUDE.md`. Keep these guidance files focused on standing rules, commands and architecture facts. Historical feature summaries live in `docs/status-features.md`.

## Project Structure & Module Organization

`tv-web/` is the active React 19, TypeScript and Vite application. Put screens in `src/features/`, shared UI in `src/components/`, catalog, focus, metadata and playback logic in `src/lib/`, and CSS in `src/styles/`. Keep unit and component tests beside their subjects; browser flows and fixtures live in `tv-web/e2e/`.

- `CCPlayTv/` is the real Tizen packaging project (`config.xml`, `index.html`, assets), populated by `tv-web/scripts/sync-tizen.mjs`. `tizen-app/` is an empty legacy placeholder.
- `api/` is a frozen Python 3.13/FastAPI/SQLAlchemy 2 async/Alembic/PostgreSQL fallback managed with `uv`, only for providers that block TV browser CORS. Do not assume it is running or route new client-first work through it without a documented reason.
- `.planning/` holds shared scripts, templates, `memory/constitution.md` and `backlog.md`. Read `.planning/README.md` before using the SDD workflow.
- `sdd/` holds generated work: `specs/<NNN-slug>/`, `adr/ADR-NNN-slug.md`, `bugs/<slug>/` and `assessments/<slug>/`.
- `docs/` holds research and design references: `iptvnator/`, Samsung/Tizen guidance in `guia-praticas-app-tv/`, and the current design system in `design/design-system/`. `design/old/` is historical and must not guide new UI work.

## Architecture & Tizen Constraints

- IndexedDB is the catalog's source of truth. Parse M3U and call the Xtream JSON protocol directly through `src/lib/catalog/`. Imports use `importWorker.ts`/`importRunner.ts`, with a main-thread fallback if the Worker cannot load.
- Load category structure first, then obtain items through `categoryLoader.ts` on entry; background prefetch also fills categories of the active list. Same-path updates preserve the active generation. For standalone/unconfirmed M3U and limited mode, scan once and retain category content in `storedEntries` for local loading.
- Category items are stored as `categoryBlocks`, with legacy row fallback and background conversion. Access a category's or kind's items through `catalogRepository.ts`, never directly through `db.channels`; episodes still use rows.
- Live TV, Filmes and Séries use the real local catalog and `@tanstack/react-virtual`. Directional focus uses the project's own `useRemoteNav` and `src/lib/focus/` hooks (state plus CSS classes, ADR-009); do not introduce a DOM-ref focus library.
- `PlayerService` in `src/lib/player/` abstracts `webapis.avplay` on TV. Playback is Direct Play, with no proxy or transcoding. The `<video>` adapter and `mpegts.js` fallback are desktop development aids; `scripts/check-no-demux-in-build.mjs` keeps the development demuxer out of production builds.
- Player UI reads the engine's capability contract (pause, seek, position, duration), rather than branching on engine identity. `src/components/PlayerLayer.tsx` is the shared fullscreen layer for Live TV, Filmes and Séries.
- Player composition hooks live in `src/components/player/`; Live composition hooks and `liveColumns.tsx` live in `src/features/live/`. Before moving code there, read `sdd/specs/040-dividir-player-live/logic/divisao.md` §1: preserve refs and effect order, keep one `useRemoteNav` per component, and keep render helpers as plain functions.
- Every screen mounting `PlayerLayer` needs its root covered by the hardware-plane CSS rule in `screens.css`. `.screen` roots are covered; other roots need an explicit rule so the screen does not obscure the hardware video plane.
- Keep the explicit `chrome108` build target in `vite.config.ts`. The reference Samsung QN50Q60DAGXZD was measured on 2026-09-29 as Tizen 9.0/Chromium 120 with a `file://` origin; 108 remains the compatibility floor despite older device documentation.
- Every emitted Worker, font and asset must be listed in `tizen_web_project.yaml`. The sync guard (`scripts/tizenFiles.mjs`, `findUnlistedFiles`) refuses unlisted files; update the list when adding build output.
- ADR-012 allows a static HTTPS bridge page solely to supply an HTTP(S) origin to an embed that fails from `file://` (such as YouTube error 153 without a `Referer`). Such pages have no server logic, data or secrets and must be registered in ADR-012.

## Build, Test, and Development Commands

Run frontend commands from `tv-web/` after `npm install`:

- `npm run dev` starts Vite for local development (fallback API CORS expects port 5173).
- `npm run test` runs Vitest's `dom` (jsdom, `*.test.tsx`) and `node` (`*.test.ts`) projects. Add `.ts` tests requiring DOM to `TESTES_TS_COM_DOM` in `vite.config.ts`.
- `npm run lint` runs Oxlint.
- `npm run build` runs `tsc -b`, builds with Vite and verifies that the development demuxer is absent. `npm run build:tizen` also syncs output into `CCPlayTv/`.
- `npm run test:e2e` runs the parallel Playwright suite (`e2e/run.mjs`) against an already running dev server; pass runner options after `--`: `--only a,b`, `--jobs N`, `--retry N`.
- `npm run test:e2e:serial` runs the older sequential chain to help distinguish concurrency flakes from behavior failures.

For fallback API work only, start PostgreSQL with `docker compose up -d postgres` from the repository root, then run from `api/`:

```bash
uv sync --locked
uv run alembic upgrade head
uv run python main.py          # 127.0.0.1:3000
uv run pytest                  # asyncio_mode = auto
uv run ruff check .            # line-length 100
```

Prefer the narrowest test command covering the change before running a whole suite.

## Coding Style & Naming Conventions

Follow neighboring files: two-space indentation in TypeScript/TSX, four spaces in Python, single quotes and no semicolons in frontend code. Use PascalCase for React components, camelCase for functions and hooks (`useRemoteNav`), and descriptive kebab-case names for E2E scripts. Ruff sets a 100-character Python line length.

Project documentation under `sdd/`, `.planning/` and `docs/` is written in Portuguese. Keep this file and code comments in the language already used by their surroundings.

## Constitution, Focus & Secrets

`.planning/memory/constitution.md` binds every change, including work outside formally planned features. Read the relevant accepted ADRs before proposing a conflicting change.

- Every loading, empty and error state must have at least one focusable element. Moving focus selects; SELECT plays. Focusing never starts playback or an external query.
- RETURN restores focus and scroll position, reconciled by item id rather than index.
- Resume position, favorites and history use stable logical identity (source + type + stable id + season/episode), never the stream URL.
- Progress percentages must reflect measured progress. Player controls must match real media capabilities; live content without a DVR window has no seek bar.
- Preserve provider-declared groups/categories; never silently replace them with external taxonomy such as TMDB genres.
- Secrets must never appear in logs, visible UI or errors. Sanitize caught fetch errors, which can contain a full URL with credentials. Developer-owned/shared TMDB or OpenAI keys must never reach the client.
- ADR-008/ADR-010 permit provider credentials, source/playback URLs and the downloaded M3U in device IndexedDB for authentication and playback, but never in logs, rendered cards, errors, third-party requests or exports/backups. A user-entered BYOK key may also live there under the same restrictions and is sent only to its own service.
- `docs/m3u/dados.md` contains real provider credentials and is gitignored. Never copy its values into code, specs, fixtures, commits, logs or prompts.

## Design System & UI Text

All screens use CCPlayTV Design System V14 Spectrum. Before creating or changing any screen or component, consult all three artifacts in `docs/design/design-system/`:

| Artifact | Role and reading guidance |
|---|---|
| `CCPlayTV_Design_System_Spec_v14_Spectrum.md` | Normative tokens (§5–§10), focus/disabled states (§11), navigation (§13), cards (§16), states/errors (§19/§45), player (§27/§43), QA (§34), IME (§37), ARIA (§38), lifecycle (§40), focus memory (§41). Read relevant sections. |
| `CCPlayTV_Design_System_Component_Lab_v14_Spectrum.html` | Interactive component catalog. Open in a browser or search the relevant section id (`cards`, `rails`, `forms`, `ime`, `feedback`, `errorstax`, `player`, `categoriesv131`). |
| `CCPlayTV_Tizen_Ultimate_Prototype_v13_2.html` | Screen examples (`profiles()`, `home()`, `live()`, `catalog()`, `details()`, `player()`, settings and modals). Search narrow windows with `rg`; do not read the whole large file. Serve the directory with `python -m http.server` when browser tooling blocks `file://`. |

Precedence (ADR-011): **constitution > accepted ADRs > V14 Spec > Component Lab > prototype**. Consult `docs/guia-praticas-app-tv/` before designing a screen.

- A profile is an IPTV list, with a single active source. Follow ADR-011's topbar structure. Channel numbers represent source order.
- The Spec's §36 legacy V13 CSS block is obsolete; use V14 §5/§11. Do not implement media previews on focus or invent ratings, relevance percentages, EPG text or editorial content from prototype examples. Unbuilt controls are centrally registered, soft-disabled `Em breve` placeholders.
- ADR-007's visual contract remains: uniformly scaled 1920×1080 stage, dark theme, brand gradient reserved for identity, `--accent: #ff7a3d` for state, 4px outline plus offset/glow and `scale(1.06)`, 140ms motion. Use `src/components/Stage.tsx` and the tokens in `src/index.css`; new screens must not hardcode colors, radii, spacing or font sizes.
- Fonts ship locally from `src/assets/fonts/`, never a CDN.
- UI strings go through `src/lib/i18n/`: add keys in `messages/<area>.ts` for pt/en/es (`pt` is the base), and read them with `useT()`. Pure helpers receive `t` as an argument and never read the store. Do not translate provider channel, category or title names.

## SDD Workflow & Session Continuity

Use the matching skill when the user requests its workflow. Read its `SKILL.md` for gates, document updates and verdict rules.

```text
sdd-assess (optional) -> sdd-specify -> sdd-plan -> sdd-execute -> sdd-converge
```

`sdd-adr` handles fundamental architecture decisions; `sdd-bugfix` handles bugs reported outside active feature execution; `sdd-adhoc` handles small, low-risk improvements. They run independently of the feature pipeline.

Repository skills are available in `.agents/skills/`, with mirrored copies in `.claude/skills/` and `.agent/skills/`. Keep copies synchronized when editing a skill. `tizen-tv` and `tizen-emulator` are operational skills, outside the SDD pipeline.

To resume work:

1. Check `.planning/backlog.md` (`## Features` / `## Bugs`) for status and task counts.
2. Read the feature's `plan.md` (`## Estado Atual`, `PRÓXIMO:`).
3. Read `## Execution Notes` and `## Cuidados para Retomada` for recent decisions and pitfalls.

The backlog also holds `## Ideias Futuras` and `## Melhorias Ad-hoc`. Status/progress columns are maintained by PowerShell scripts; do not hand-edit them. Idea lists and `.planning/migracao-design-system-v14.md` prose are maintained by hand.

Helper scripts live in `.planning/scripts/powershell/` and run on Windows PowerShell 5.1; do not assume `pwsh` is installed. Follow the skill's invocation instructions:

| Script | Purpose |
|---|---|
| `common.ps1` | Root/path resolution, slugs and templates. |
| `new-feature.ps1` / `new-adr.ps1` | Create numbered feature/ADR documents from templates. |
| `check-prerequisites.ps1` | Check required documents for specify/plan/execute/converge. |
| `update-feature-status.ps1` | Recalculate backlog progress and optionally update spec status. |
| `resolve-bug.ps1` / `update-bug-status.ps1` | Resolve bug phase and refresh the Bugs panel. |
| `resolve-assessment.ps1` | Resolve assessment documents and next phase. |
| `check-contract-tests.ps1` | SHA256-lock contract tests created by `sdd-plan` (max 5 cases) in `contract-tests.lock`; execution makes them pass without editing them. |

Legacy `.specify/` and `.github/skills/speckit-*` tooling is separate; this workflow does not read or modify it.

## Architecture Decisions

Accepted decisions live in `sdd/adr/`. Amend history with an inline `**Atualização (ADR-0XX):**` note instead of rewriting it.

| ADR | Subject |
|---|---|
| ADR-001 | Stack, PlayerService/AVPlay, Direct Play, voice and Android remote; import/catalog placement partly superseded by ADR-008. |
| ADR-002 | Offline resilience and local catalog, including partial category coverage. |
| ADR-003 | Python/FastAPI/uv backend, superseding Node.js/Fastify. |
| ADR-004 | No mandatory account; sources and import. |
| ADR-005 | Catalog, preferences, IMDb rating and recommendations. |
| ADR-006 | Libraries, boundaries, adoption increments and validation gates; backend scope amended by ADR-008 and directional focus superseded by ADR-009. |
| ADR-007 | TV visual identity and focus contract; design reference updated by ADR-011. |
| ADR-008 | Client-first; backend only when strictly necessary. |
| ADR-009 | Project-owned state/CSS directional navigation with `useRemoteNav`. |
| ADR-010 | Device storage exception for source/playback URLs and downloaded M3U. |
| ADR-011 | V14 Spectrum, reference precedence, IPTV-list profiles, single active source, topbar and placeholder policy. |
| ADR-012 | Restricted static HTTPS bridge pages for embeds requiring an HTTP(S) origin. |

Also consult `REQUISITOS-FUNCIONAIS.md` and `ESPECIFICACAO-TRAILERS.md` for functional requirements.

## Testing Guidelines

Name colocated frontend tests `*.test.ts(x)` or `*.contract.test.ts(x)`; API tests use `api/tests/test_*.py`. There is no configured coverage percentage. Test affected behavior, including remote-control focus and SELECT/RETURN paths for TV UI changes. Stack-specific tests must pass for each completed task. Never mark a bug fix verified without rerunning the reproduction.

The constitution's development flow requires `npm run test:e2e`, with `npm run dev` already running, after finishing a feature and before requesting `tizen-tv` or `tizen-emulator` validation, in addition to unit tests.

Browser/emulator checks cannot establish AVPlay, codecs, IPTV playback, physical remote keys, performance or memory behavior. Record required physical-device checks in the feature plan. Use `tizen-tv` for physical-TV installation and validation, with no backend prerequisite. Use `tizen-emulator` for emulator workflows; consult its recorded `118, -4 Operation not allowed` installation diagnosis before repeating eliminated checks.

## Commits & Pull Requests

Recent commits commonly use `feat(025): ...` or `docs(026): ...`, with the numbered SDD feature as scope; follow that pattern when applicable. In a PR, describe the user-visible change, link the relevant `sdd/specs/<number>-<slug>/` or backlog item, list commands run, and attach screenshots for UI changes. Update the spec, tasks, and backlog when their status changes. Review configuration and logs for secrets before committing; never commit real provider credentials or `.env` files.
