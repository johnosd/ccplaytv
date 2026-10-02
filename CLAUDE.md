# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`ccplayTv` is a native Samsung Tizen Smart TV app that plays and organizes
IPTV (M3U/Xtream) catalogs, enriched with TMDB metadata, with a planned
voice control (OpenAI) and Android remote-control companion app.

## Project status

The app is **client-first** (ADR-008): source import, classification, catalog
storage and playback all happen on the TV itself, in IndexedDB via Dexie, with
no always-on backend. Features 001–046 are built (the Design System V14
migration was features 021–028); a few keep a physical-TV gate open.

**Status per feature is not kept here.** Authority, in order:
`.planning/backlog.md` (`## Features`) → `sdd/specs/<slug>/plan.md` →
`## Estado Atual`. The long history of each feature's paragraph is archived in
`docs/status-features.md` (not auto-loaded).

**Do not add per-feature status paragraphs to this file** — not at the end of
`sdd-execute`, `sdd-converge` or any other workflow. Record that in the
feature's `plan.md` and the backlog. Only edit `CLAUDE.md` for a standing rule,
command or architecture fact that every future session needs, and keep it short.

The four top-level directories:

- **`tv-web/`** — React 19 + TypeScript + Vite. Splash, the "Selecione ou
  Adicione sua lista" profile screen (one card per IPTV list plus "Adicionar
  lista", ADR-011 §2; feature 037), the "Conecte sua lista IPTV" add-list form, the Início (hub content under a
  persistent topbar, feature 023), **Live TV, Filmes and Séries** all read
  the **real local catalog** (`tv-web/src/lib/catalog/`, IndexedDB via
  Dexie) — no mock data remains anywhere in the app. Live TV/Filmes/Séries are
  category-first: a category rail, with items obtained only when the person
  enters a category (feature 010) — never the whole catalog at once. All
  three are virtualized via `@tanstack/react-virtual` (feature 009), with
  focus kept in sync by the project's own `useRemoteNav` + the hooks in
  `src/lib/focus/` — **not** a DOM-ref focus library (ADR-009).
  Playback goes through `src/lib/player/` (`PlayerService` + AVPlay adapter,
  `<video>` adapter for desktop dev), each engine declaring a capability
  contract (pause/seek/position/duration) the UI reads instead of ever
  branching on which engine is active. `src/components/PlayerLayer.tsx` is
  the one fullscreen playback layer shared by Live TV, Filmes and Séries
  (moved out of `features/live/` in feature 011; `SeriesDetailScreen`
  became its third consumer in feature 012). Since feature 040 it only
  composes: session/lifecycle, chrome, panels and keyboard live in
  `src/components/player/` (`usePlayerSession`, `usePlayerChrome`,
  `usePlayerPanels`, `usePlayerKeyboard`), and `features/live/LiveScreen.tsx`
  likewise composes `useLiveCatalog`/`useLiveSearch`/`useLiveZapping`/
  `useLiveGuide`/`useLiveKeyboard` and `liveColumns.tsx` — read
  `sdd/specs/040-dividir-player-live/logic/divisao.md` §1 before moving code
  there (refs stay refs, effect order is preserved, one `useRemoteNav` per
  component, render helpers stay plain functions) — any screen that mounts it
  needs its root covered by the hardware-plane CSS rule in `screens.css`
  (`.screen`-rooted screens already are; a screen with a different root,
  like `MovieDetailScreen`'s `.movie-detail-layout`, needs its own line
  added there — `SeriesDetailScreen` avoided this by staying `.screen`-
  rooted), or the video paints behind whatever that screen renders on top
  of it. The build targets `chrome108` explicitly, because Vite 8's
  default is Chrome 111 — above what older docs assumed for the TV (the
  device was later measured at Chromium 120, but 108 stays as the safe
  floor). Don't drop that from `vite.config.ts`.
- **`api/`** — Python 3.13 + FastAPI + SQLAlchemy 2 (async) + Alembic +
  PostgreSQL, managed with `uv`. **Frozen fallback per ADR-008** — not the
  primary path for any feature. It exists only for a provider panel that
  blocks CORS from the TV's browser; don't build new client-first work on
  top of it, and don't assume it's running.
- **`CCPlayTv/`** — the Tizen web project (`config.xml`, `index.html`,
  assets) that gets packaged into `.wgt`. `tv-web/scripts/sync-tizen.mjs`
  copies the Vite build into it (`npm run build:tizen`). Files listed in
  `tizen_web_project.yaml` must match exactly what Vite emits — a Worker
  chunk (`assets/importWorker.js`) missing from that list used to fail
  silently on the TV, never in the browser or in tests, until feature 021
  gave `sync-tizen.mjs` a guard (`tv-web/scripts/tizenFiles.mjs`'s
  `findUnlistedFiles`) that refuses to sync and lists exactly what's
  missing — add any new emitted file (a Worker, a font, an asset) to that
  list or the build stops there instead of on the TV.
- **`tizen-app/`** — empty placeholder from the original setup guide; the
  real packaging project is `CCPlayTv/`.

Do not describe planned features as delivered — the backlog and the specs
are the source of truth for status, and honest verdicts are a constitution
principle.

## Commands

Backend (`api/` — frozen fallback per ADR-008, not needed for any
client-first feature; needs PostgreSQL — `docker compose up -d postgres`
from the repo root):

```bash
uv sync --locked
uv run alembic upgrade head
uv run python main.py          # serves on 127.0.0.1:3000
uv run pytest                  # tests/ (asyncio_mode = auto)
uv run ruff check .            # line-length 100
```

Frontend (`tv-web/`):

```bash
npm run dev            # Vite dev server (API CORS expects :5173)
npm run test           # vitest run — two projects: `dom` (jsdom, *.test.tsx) and `node` (*.test.ts); a .ts test needing DOM goes in TESTES_TS_COM_DOM (vite.config.ts)
npm run test:e2e       # whole E2E suite, parallel runner (tv-web/e2e/run.mjs); --only a,b / --jobs N / --retry N
npm run test:e2e:serial # old one-at-a-time chain, to tell a concurrency flake from a real failure
npm run lint           # oxlint
npm run build          # tsc -b && vite build
npm run build:tizen    # build + sync into CCPlayTv/
```

Prefer the narrowest command that covers the change (a single
`uv run pytest tests/test_classifier.py`, a single vitest file) before
running a whole suite.

Per the constitution's "Fluxo de Desenvolvimento" (`.planning/memory/constitution.md`),
`npm run test:e2e` (with `npm run dev` already running) is a required gate after
finishing a feature — in addition to unit tests — and must run **before**
requesting a `tizen-tv`/`tizen-emulator` validation pass.

## The constitution is a real gate

`.planning/memory/constitution.md` (v1.7.0) holds 13 non-negotiable
principles, checked by `sdd-plan` and binding on any change — not just on
formally planned features. The ones most easily violated by accident:

- Focus is the most important state. Every state — including loading, empty
  and error — needs at least one focusable element, or the remote gets
  trapped. Moving focus selects; SELECT plays. Focusing never starts
  playback or fires an external query.
- Going back restores focus and scroll position, reconciled by item id, not
  by index.
- Resume position, favorites and history are keyed by stable logical
  identity (source + type + stable id + season/episode), never by the stream
  URL.
- Secrets never reach logs, error messages or visible UI, and are never
  logged/interpolated raw (a caught fetch error can embed the full URL with
  credentials). A developer-owned or shared TMDB/OpenAI key never reaches
  the client at all.
  **Exception (ADR-008, extended by ADR-010)**: provider credentials (dns,
  username, password), the full source URL, each item's playback URL and
  the downloaded M3U file may live in the device's IndexedDB — that's what
  lets the client re-authenticate and play without a backend — but still
  never in a log, a rendered card, an error message, a third-party request,
  or an export/backup. **Extension (constitution 1.6.0, feature 032)**: a
  BYOK key the *person* typed on the TV (TMDB, later OpenAI) may live there
  too, under the same rules, and is only ever sent to its own service.
- No invented progress percentages, and player controls must match the
  media's real capabilities (no seek bar on live without a DVR window).
- Source-declared groups/categories are never silently replaced by external
  taxonomy (e.g. TMDB genres).

## Design system

**The app has migrated to the CCPlayTV Design System V14 "Spectrum"** — see
`.planning/migracao-design-system-v14.md` for the wave-by-wave history
(Onda 0–7, one SDD feature each, 021 through 028). Every screen runs under
the V14 shell/tokens now; there is no pre-V14 layout left in the codebase
(feature 028, Onda 7, removed the last pre-V14 CSS file,
`features/screens.css`). Feature 028's own mandatory physical-TV pass
(SC-008) is done — see `sdd/specs/028-limpeza-qa-ds-v14/plan.md` →
`R-009`. New work still follows V14, same as always.

**Before creating or changing any screen or component, consult the V14
design system — all three artifacts, in `docs/design/design-system/`:**

| Artifact | Role | How to read it |
|---|---|---|
| `CCPlayTV_Design_System_Spec_v14_Spectrum.md` | **Normative** — tokens (§5–§10), focus/pressed/soft vs hard disabled (§11), navigation patterns incl. pinned `★ Favoritos`/`↺ Histórico`/`Todos` (§13), cards (§16), states/errors (§19, §45), player (§27, §43), IME (§37), ARIA (§38), lifecycle (§40), focus memory (§41), Tizen QA matrix (§34) | Plain Markdown, read the relevant sections |
| `CCPlayTV_Design_System_Component_Lab_v14_Spectrum.html` | Visual/interactive catalog, one `<section id="…">` per component (`#cards`, `#rails`, `#forms`, `#ime`, `#feedback`, `#errorstax`, `#player`, `#categoriesv131`…) | Open in a browser, or `Grep` for `id="<section>"` |
| `CCPlayTV_Tizen_Ultimate_Prototype_v13_2.html` | The rules applied to real screens — one JS function per screen (`profiles()`, `home()`, `live()`, `catalog()`, `details()`, `player()`, `settings*()`, `*Modal()`) | 249 KB with lines up to ~13k chars: `Grep` a narrow window (e.g. `function live\(\).{0,400}`), never read whole. `file://` is blocked for Playwright MCP — serve the folder with `python -m http.server` to look at it |

**Precedence when they disagree** (ADR-011): constitution > accepted ADRs >
V14 Spec > Component Lab > prototype. Where the prototype's structure
differs from ADR-011, ADR-011 wins: its "profiles" are IPTV lists, and
Esportes/Infantil are not in the topbar yet. Known conflicts already
resolved in the migration plan (§1): the Spec's §36 "CSS canônico V13" block is obsolete
(red accent, white focus) — V14 values are §5/§11; trailer/channel
*preview on focus* is **not** adopted (constitution: focusing never starts
playback or an external query; AVPlay is a singleton); the prototype's
invented content (relevance %, ratings, EPG "Agora:" text, editorial rails)
never becomes real UI — unbuilt features are **soft-disabled "Em breve"
mocks**, registered in one place, never fake data.

Also check `docs/guia-praticas-app-tv/` (Samsung/Tizen guidelines — input
method, focus, text entry, media player chrome) before designing a screen.
The old 9-screen prototype lives on only as history in
`docs/design/old/` — don't use it as a reference for new work.

ADR-007 remains the canonical visual contract (V14 kept its palette and
focus recipe: 1920×1080 stage scaled uniformly, dark theme, brand gradient
reserved for identity, `--accent: #ff7a3d` for state, 4px outline + offset
+ glow + `scale(1.06)`, 140ms). The executable form is the tokens in
`tv-web/src/index.css`, all in place since feature 021 (full V14 set:
spacing, radius, elevation, motion, semantic colors, z-layers), and the
1920×1080 stage is a real component (`tv-web/src/components/Stage.tsx`),
not just an aspiration — it wraps the app root, identity at 1920×1080,
scaled elsewhere. **New screens consume tokens; they never hardcode a
color, radius, spacing or font size**, and fonts ship locally
(`tv-web/src/assets/fonts/`, feature 021) — never a CDN.

## How work happens here: the SDD system

This repo is driven by a bespoke Spec-Driven Development workflow (evolved
from a `plan-feature` skill, borrowing structural ideas from GitHub
spec-kit). **Read `.planning/README.md` first** — it is the authoritative,
fully-worked-out explanation of every skill, script, and document
convention below; this section is only an orientation summary.

The pipeline for a feature is:

```
sdd-assess (optional, "is this worth building?")
  -> sdd-specify -> sdd-plan -> sdd-execute -> sdd-converge
```

`sdd-adr` (architecture decisions), `sdd-bugfix` (bugs reported outside an
active feature), and `sdd-adhoc` (small low-risk tweaks) run independently
of that pipeline, at any time.

### Skills are mirrored in `.claude/skills/` and `.agent/skills/`

All 8 SDD skills (`sdd-assess`, `sdd-adr`, `sdd-bugfix`, `sdd-specify`,
`sdd-plan`, `sdd-execute`, `sdd-converge`, `sdd-adhoc`) exist as
`SKILL.md` under **both** `.claude/skills/<name>/` (so Claude Code invokes
them as `/sdd-*`) and `.agent/skills/<name>/` (other agent CLIs, e.g.
Gemini CLI). Keep the two copies in sync when editing one.

Two more skills follow the same mirroring rule but are **not** part of the
SDD pipeline — both are operational procedures for getting the app onto a
screen:

- `tizen-tv` — installs/updates the app on the **physical TV** over the
  network (find the TV's current IP → build with `VITE_API_URL` on the LAN →
  package with the Samsung profile → `sdb` install → launch → collect
  evidence). This is the working path, verified 2026-09-17, and the only one
  that can validate AVPlay, codecs, remote keys or performance.
- `tizen-emulator` — the same cycle against the Tizen Studio TV Emulator.
  **Currently blocked**: install fails with `118, -4 Operation not allowed`
  on the TV emulator after DUID, clock, chain and package integrity were all
  ruled out. The skill documents what was eliminated so a future session
  doesn't repeat it.

When the user asks in natural language for one of these workflows
("especifica a feature de X", "planeja a feature 001", "implementa a feature
X", "converge a feature X", "documenta essa decisão de arquitetura", "avalia
esse bug", "avalia essa ideia"), invoke the matching skill rather than
improvising the procedure — the SKILL.md files encode required gates,
required document updates, and verdict-honesty rules (e.g. never mark a bug
fix `verified` without actually re-running the reproduction) that are easy
to under-deliver on from memory.

### Where things live

- `.planning/` — shared machinery: PowerShell scripts, doc templates,
  `memory/constitution.md`, and `backlog.md`.
- `sdd/` — generated work product: `sdd/specs/<NNN-slug>/`,
  `sdd/adr/ADR-NNN-slug.md`, `sdd/bugs/<slug>/`, `sdd/assessments/<slug>/`.
- `.planning/backlog.md` — single status panel: `## Ideias Futuras`
  (only what is still missing, in suggested execution order, with
  dependencies; delivered items sit in a short table at its end),
  `## Features`, `## Bugs`, `## Melhorias Ad-hoc`. **The status/progress
  columns are maintained by the PowerShell scripts — don't hand-edit them.**
  The idea list is hand-maintained.
- `.planning/migracao-design-system-v14.md` — the roadmap for migrating the
  frontend to Design System V14 (waves → features 021+, real-vs-mock matrix,
  mock policy, open decisions, risks). Hand-maintained prose, like the idea
  list in the backlog.
- `docs/` — research inputs, not generated work product:
  - `docs/iptvnator/` — 10 reports on what to reuse from a mature Angular/
    Electron IPTV player (UI/UX, architecture, APIs, per-screen deep dives).
    Each item says where it lives in that repo and how to adapt it here.
  - `docs/guia-praticas-app-tv/` — 13 reports on Samsung/Tizen guidelines
    (design principles, input methods, layout, text input, media player,
    Smart View, UX checklist, distribution, launch checklist, Seller Office,
    web APIs, samples). Normative for anything shipped to a TV.
  - `docs/design/design-system/` — **the current design system (V14
    Spectrum)**: normative Spec, Component Lab and screen prototype. See
    "Design system" above.
  - `docs/design/old/` — the superseded 9-screen prototype and the prompt
    that produced it. Kept as history only.
  - `docs/m3u/dados.md` — **contains real provider credentials in plain
    text.** It is gitignored and has never been committed (handled during
    feature 001), so there is no history to remediate — but never quote its
    values into code, specs, fixtures, commits, logs or prompts.

### Resuming work between sessions

Skills have no memory across invocations — each one rereads files from
scratch, so the documents *are* the memory:

1. Check `.planning/backlog.md` → `## Features` / `## Bugs` for overall
   status and progress (`N/M tasks`).
2. Open `sdd/specs/<slug>/plan.md` → `## Estado Atual` and the `PRÓXIMO:`
   line for the fastest "where did we leave off" snapshot.
3. For more detail: `## Execution Notes` (recent history) and
   `## Cuidados para Retomada` (known pitfalls) in the same `plan.md`.

### Helper scripts (`.planning/scripts/powershell/`)

Called by the skills themselves (you generally don't need to invoke these
directly — following a SKILL.md will call them as needed). They run fine
under Windows PowerShell 5.1; `pwsh` is not installed on this machine.

| Script | Purpose |
|---|---|
| `common.ps1` | Shared functions: repo root discovery (via `.planning/` marker), feature path resolution, slug generation, template loading |
| `new-feature.ps1 "<description>" [-ShortName <slug>] [-Json] [-DryRun]` | Creates `sdd/specs/<NNN-slug>/` seeded from the spec template |
| `new-adr.ps1 "<title>" [-Json] [-DryRun]` | Creates `sdd/adr/ADR-NNN-slug.md` seeded from the ADR template |
| `check-prerequisites.ps1 -Stage specify\|plan\|execute\|converge [-FeatureDir <path>\|-Slug <slug>] [-Json] [-PathsOnly]` | Stage gate — blocks with a specific "run X first" message when a required doc is missing |
| `update-feature-status.ps1 -Slug <NNN-slug> [-Status <value>] [-Json]` | Recalculates progress in `backlog.md` and (if `-Status` given) the `**Status**:` line in `spec.md` |
| `resolve-bug.ps1 [-Slug <slug>] [-Title "<description>"] [-Json]` | Creates/finds `sdd/bugs/<slug>/`, reports next phase (`assess`/`fix`/`test`/`complete`) |
| `update-bug-status.ps1` | Recalculates the `## Bugs` panel in `backlog.md` from `sdd/bugs/<slug>/*.md` |
| `check-contract-tests.ps1 -Slug <slug> [-Write [-Paths <files>]] [-Json]` | Locks a feature's contract tests (written by `sdd-plan`, max 5 test cases) in `contract-tests.lock` by SHA256; without `-Write` it verifies nothing changed — `sdd-execute` must make them pass, never edit them |
| `resolve-assessment.ps1 [-Slug <slug>] [-Title "<description>"] [-Json]` | Creates/finds `sdd/assessments/<slug>/`, reports next phase (`define`/`decide`/`complete`) |

The `.specify/` / `.github/skills/speckit-*` tooling, if present in a
checkout, is a separate legacy system this one deliberately coexists with
and never reads or modifies.

## Architecture (from `sdd/adr/`)

ADR-001 to ADR-012 are accepted decisions — read the relevant one in full
before proposing anything that conflicts, and amend with an inline
`**Atualização (ADR-0XX):**` note rather than rewriting history.

| ADR | Subject |
|---|---|
| ADR-001 | Overall architecture and stack; `PlayerService`/AVPlay; Direct Play; voice and Android remote (**partially superseded by ADR-008** on where import/catalog logic runs) |
| ADR-002 | Cache-first / offline resilience on the TV |
| ADR-003 | Backend moved to Python + FastAPI + `uv` (**supersedes the earlier Node.js/Fastify plan**) |
| ADR-004 | No mandatory account; sources and import |
| ADR-005 | Catalog, preferences, IMDb rating, recommendations |
| ADR-006 | Library/SDK selection, boundaries, adoption increments A–E, validation gates V1–V9 (**Incremento E partially superseded by ADR-008; directional-focus recommendation superseded by ADR-009**) |
| ADR-007 | TV design system and visual identity (**visual reference updated by ADR-011** to DS V14; palette and focus recipe still valid) |
| ADR-008 | Client-first architecture — backend only when strictly necessary (VPS/self-hosted backend no longer the default path; confirmed CORS works against the real provider) |
| ADR-009 | Directional navigation is the project's own `useRemoteNav` hook (state + CSS class, no DOM-ref focus library) — Norigin Spatial Navigation, recommended by ADR-006, was never installed |
| ADR-010 | Full source URL, per-item playback URLs and the downloaded M3U file may be stored on the device (extends ADR-008's credential exception); still never logged, displayed, sent to third parties or exported |
| ADR-011 | Adopts Design System V14 Spectrum (updates ADR-007's reference): precedence constitution > ADRs > V14 Spec > Component Lab > prototype; no media preview on focus; topbar shell; **profile = IPTV list**; single active source; "Em breve" soft-disabled mocks, never fake content; channel number = source order position |
| ADR-012 | "Bridge page": a static HTTPS page on free static hosting (no server logic, no data, no secrets) is allowed solely to give an http(s) origin to a third-party embed that fails from the app's `file://` origin — the YouTube IFrame player returns error 153 without a `Referer` (proven on the TV, 2026-09-29). Updates ADR-008; each bridge page is listed in ADR-012 |

Plus `REQUISITOS-FUNCIONAIS.md` (RF-001 to RF-019) and
`ESPECIFICACAO-TRAILERS.md` (RF-019 detail).

**Client-first (ADR-008): the TV owns import, catalog and playback** — no
always-on backend in the loop:

- **Frontend (Tizen app)**: TypeScript, React, CSS, Vite (targeted at
  the reference Samsung QN50Q60DAGXZD — measured on 2026-09-29 as Tizen
  9.0 / Chromium 120, origin `file://`; older docs say 8.0 / 108, and the
  build still targets `chrome108` as a safe floor — not generic web). Parses M3U and talks the Xtream JSON protocol directly from
  the browser (`tv-web/src/lib/catalog/xtreamConnector.ts`,
  `m3uParser.ts`), classifies, and stores the result in IndexedDB via Dexie
  (`db.ts`, `catalogRepository.ts`) — no backend round-trip for any of this.
  Import runs in a Web Worker (`importWorker.ts`/`importRunner.ts`) so a
  large source never blocks the UI thread; it falls back to the main thread
  if the Worker fails to load (R-002 in the 005 spec). Playback goes through
  a `PlayerService` abstraction backed by `webapis.avplay`, never the HTML
  `<video>` tag (a `<video>` adapter exists only for desktop dev; in `npm run
  dev` it falls back to `mpegts.js` for `.ts` channels the `<video>` refuses —
  a devDependency that `scripts/check-no-demux-in-build.mjs` keeps out of the
  build, and which proves nothing about the TV, feature 047). Direct
  Play only — nothing proxies or transcodes video.
- **`api/` (frozen fallback)**: Python, FastAPI, SQLAlchemy 2 async,
  PostgreSQL. Kept only for a provider panel that blocks CORS from the TV's
  browser — not a dependency of any client-first feature, and not assumed
  to have TLS, backup/restore or production infrastructure (ADR-006 E4,
  emended). Don't route new work through it without a documented reason.
- **Offline-first (ADR-002)**: the catalog in IndexedDB **is** the source of
  truth, not a cache of something else. The app opens straight from it,
  degrading only the things that genuinely need a live connection (playback
  of a given stream, obtaining a category's items). See "Known deviation"
  below for how far "obtained" currently goes.

### Known deviation, mostly closed

**Update (2026-09-23, feature 010, live/VOD/series categories)**: a
provider source (Xtream JSON protocol) now imports only its **structure**
— the categories the panel declares — and obtains the items of a category
only when the person enters it
(`tv-web/src/lib/catalog/categoryLoader.ts`). This replaced an eager,
whole-catalog import that measurably froze the TV on a large real source
(the write to IndexedDB was the bottleneck, not the network). See
`sdd/specs/010-catalogo-sob-demanda/` for the full design; ADR-002 has a
matching amendment on partial catalog coverage being the normal state now,
not an exception.

**Verified on the physical TV** (T046, 2026-09-23): 6 of 7 scenarios
passed; scenario G (M3U source) wasn't run for lack of an available source
in that session, and is covered by the automated T016 instead. Scenario B
only passed after R-013 (debounced prefetch). `plan.md`'s `## Estado Atual`
stays the authority if you need more detail.

**Update (2026-09-24, feature 014)**: the M3U gap feature 010 left on
purpose — a source imported by URL M3U, or the pre-existing "Modo
limitado" fallback, used to import everything eagerly, in one streaming
pass, because a flat M3U file has no per-category network protocol — is
now closed for the case that matters most (a URL M3U pointing at an
actual Xtream panel: the app detects and confirms it, then follows
feature 010's provider path in full) and narrowed for the rest (avulsa
URL, unconfirmed panel, "Modo limitado"): those still can't ask the
network for one category at a time, but the importer no longer needs to
either — it scans the file once, writes structure only, and keeps the
per-category content in a new `storedEntries` table instead of writing it
straight to `channels`; entering a category reads it from there once per
generation, never the network again. Code-complete; only the SC-001/SC-002
timing measurements against a real user list remain open. See
`sdd/specs/014-m3u-sob-demanda/`.

**Update (2026-09-30, feature 038)**: "obtained only on entry" is no longer
the whole story — a background prefetch now fills every category of the
active list over time, and a same-path update keeps the active generation
(long-lived) instead of replacing it. See feature 038 above.

**Update (2026-09-30, feature 039)**: a category's items are no longer one
`channels` row each — they're one block per category (`categoryBlocks`), read
and written at once; old rows are read as a fallback and converted in the
background. Code that needs a category's or a kind's items must go through
`catalogRepository.ts`, never `db.channels` directly (only episodes are still
rows). See feature 039 above.

## Language

Project documentation (ADRs, planning docs, backlog, specs) is written in
Portuguese. Match that when writing or amending files under `sdd/`,
`.planning/` and `docs/`. This file and code comments stay in the language
already used by their surroundings.
