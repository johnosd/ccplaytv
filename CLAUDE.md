# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`ccplayTv` is a native Samsung Tizen Smart TV app that plays and organizes
IPTV (M3U/Xtream) catalogs, enriched with TMDB metadata, with a planned
voice control (OpenAI) and Android remote-control companion app.

## Project status

The app is **client-first** (ADR-008, superseding the original backend-first
plan from ADR-001/ADR-003 where relevant): source import, classification,
catalog storage and playback all happen on the TV itself, in IndexedDB via
Dexie, with no always-on backend in the loop. Converged features:
`001-importacao-fonte-m3u`, `002-splash-home-perfis`, `003-live-tv-avplay`
(verified on the Samsung QN50Q60DAGXZD reference TV, closing ADR-006's V1
gate), `004-conector-xtream-live`, `005-import-catalogo-client-first` (the
client-first migration itself), `006-conector-xtream-vod-series`,
`007-higiene-credenciais`, `008-user-state-repo`,
`009-virtualizacao-foco` (grid/list virtualization on all three category
screens; ADR-009 came out of it) and `010-catalogo-sob-demanda`
(structure-first import + per-category on-demand fetch — see "Known
deviation" below). **Nothing is in execution right now.**

Two gaps are worth knowing before picking up new work, because neither is
visible from the converged-feature list:

- **Only live channels actually play.** `resolvePlaybackUrl` already builds
  movie and episode URLs (`playbackUrl.ts`) and `fetchPlayback` already
  returns the item's real `kind`, but `MovieDetailScreen`'s "Assistir" is
  still a toast placeholder, `SeriesDetailScreen` has no episodes at all,
  and `PlayerOverlay` lives under `features/live/` with live-only wording.
  `PlayerAdapter` exposes only `open`/`close` — no pause, seek, position or
  duration — so VOD needs the per-engine capability contract (backlog
  item 4) before it can offer a seek bar without violating the "controls
  match real capabilities" principle.
- **`userStateRepository` (feature 008) has no consumer in production** —
  only its own test imports it. Favorites, progress and continue-watching
  are storage without UI.

The four top-level directories:

- **`tv-web/`** — React 19 + TypeScript + Vite. Splash, Home (sources), the
  Add-source form, the list hub, **Live TV, Filmes and Séries** all read the
  **real local catalog** (`tv-web/src/lib/catalog/`, IndexedDB via Dexie) —
  no mock data remains anywhere in the app. Live TV/Filmes/Séries are
  category-first: a category rail, with items obtained only when the person
  enters a category (feature 010) — never the whole catalog at once. All
  three are virtualized via `@tanstack/react-virtual` (feature 009), with
  focus kept in sync by the project's own `useRemoteNav` + the hooks in
  `src/lib/focus/` — **not** a DOM-ref focus library (ADR-009).
  Playback goes through `src/lib/player/` (`PlayerService` + AVPlay adapter,
  `<video>` adapter for desktop dev). The build targets `chrome108`
  explicitly, because Vite 8's default is Chrome 111 — above the TV's
  engine. Don't drop that from `vite.config.ts`.
- **`api/`** — Python 3.13 + FastAPI + SQLAlchemy 2 (async) + Alembic +
  PostgreSQL, managed with `uv`. **Frozen fallback per ADR-008** — not the
  primary path for any feature. It exists only for a provider panel that
  blocks CORS from the TV's browser; don't build new client-first work on
  top of it, and don't assume it's running.
- **`CCPlayTv/`** — the Tizen web project (`config.xml`, `index.html`,
  assets) that gets packaged into `.wgt`. `tv-web/scripts/sync-tizen.mjs`
  copies the Vite build into it (`npm run build:tizen`). Files listed in
  `tizen_web_project.yaml` must match exactly what Vite emits — a Worker
  chunk (`assets/importWorker.js`) missing from that list fails silently on
  the TV, never in the browser or in tests.
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
npm run test           # vitest run
npm run lint           # oxlint
npm run build          # tsc -b && vite build
npm run build:tizen    # build + sync into CCPlayTv/
```

Prefer the narrowest command that covers the change (a single
`uv run pytest tests/test_classifier.py`, a single vitest file) before
running a whole suite.

## The constitution is a real gate

`.planning/memory/constitution.md` (v1.2.0) holds 13 non-negotiable
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
  credentials). TMDB/OpenAI keys and full source URLs never reach the
  client at all. **Exception (ADR-008)**: provider credentials (dns,
  username, password) may live in the device's IndexedDB — that's what lets
  the client re-authenticate without a backend — but still never in a log,
  a rendered card, or exported/backed up.
- No invented progress percentages, and player controls must match the
  media's real capabilities (no seek bar on live without a DVR window).
- Source-declared groups/categories are never silently replaced by external
  taxonomy (e.g. TMDB genres).

## Design system

ADR-007 is the canonical visual contract: 1920×1080 stage scaled uniformly,
dark theme, brand gradient reserved for identity, `--accent: #ff7a3d` for
state, and one focus recipe (4px outline + offset + glow + `scale(1.06)`,
140ms). The executable form is the tokens in `tv-web/src/index.css`;
`docs/design/CCPlayTv Prototype - Standalone.html` is the design intent
snapshot (a 671 KB bundled page — read ADR-007 instead of trying to parse
it). **New screens consume tokens; they never hardcode a color, radius or
font size.**

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

### Skills are mirrored in `.claude/skills/` and `.gemini/skills/`

All 8 SDD skills (`sdd-assess`, `sdd-adr`, `sdd-bugfix`, `sdd-specify`,
`sdd-plan`, `sdd-execute`, `sdd-converge`, `sdd-adhoc`) exist as
`SKILL.md` under **both** `.claude/skills/<name>/` (so Claude Code invokes
them as `/sdd-*`) and `.gemini/skills/<name>/` (Gemini CLI). Keep the two
copies in sync when editing one.

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
  (sequenced by dependency, phases 0–6 plus `A avaliar` and process items),
  `## Features`, `## Bugs`, `## Melhorias Ad-hoc`. **The status/progress
  columns are maintained by the PowerShell scripts — don't hand-edit them.**
  The idea list above them is hand-maintained prose.
- `docs/` — research inputs, not generated work product:
  - `docs/iptvnator/` — 10 reports on what to reuse from a mature Angular/
    Electron IPTV player (UI/UX, architecture, APIs, per-screen deep dives).
    Each item says where it lives in that repo and how to adapt it here.
  - `docs/guia-praticas-app-tv/` — 13 reports on Samsung/Tizen guidelines
    (design principles, input methods, layout, text input, media player,
    Smart View, UX checklist, distribution, launch checklist, Seller Office,
    web APIs, samples). Normative for anything shipped to a TV.
  - `docs/design/` — the prototype and the prompt that produced it.
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
| `resolve-assessment.ps1 [-Slug <slug>] [-Title "<description>"] [-Json]` | Creates/finds `sdd/assessments/<slug>/`, reports next phase (`define`/`decide`/`complete`) |

The `.specify/` / `.github/skills/speckit-*` tooling, if present in a
checkout, is a separate legacy system this one deliberately coexists with
and never reads or modifies.

## Architecture (from `sdd/adr/`)

ADR-001 to ADR-008 are accepted decisions — read the relevant one in full
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
| ADR-007 | TV design system and visual identity |
| ADR-008 | Client-first architecture — backend only when strictly necessary (VPS/self-hosted backend no longer the default path; confirmed CORS works against the real provider) |
| ADR-009 | Directional navigation is the project's own `useRemoteNav` hook (state + CSS class, no DOM-ref focus library) — Norigin Spatial Navigation, recommended by ADR-006, was never installed |

Plus `REQUISITOS-FUNCIONAIS.md` (RF-001 to RF-019) and
`ESPECIFICACAO-TRAILERS.md` (RF-019 detail).

**Client-first (ADR-008): the TV owns import, catalog and playback** — no
always-on backend in the loop:

- **Frontend (Tizen app)**: TypeScript, React, CSS, Vite (targeted at
  Tizen 8.0 / Chromium 108 on the reference Samsung QN50Q60DAGXZD, not
  generic web). Parses M3U and talks the Xtream JSON protocol directly from
  the browser (`tv-web/src/lib/catalog/xtreamConnector.ts`,
  `m3uParser.ts`), classifies, and stores the result in IndexedDB via Dexie
  (`db.ts`, `catalogRepository.ts`) — no backend round-trip for any of this.
  Import runs in a Web Worker (`importWorker.ts`/`importRunner.ts`) so a
  large source never blocks the UI thread; it falls back to the main thread
  if the Worker fails to load (R-002 in the 005 spec). Playback goes through
  a `PlayerService` abstraction backed by `webapis.avplay`, never the HTML
  `<video>` tag (a `<video>` adapter exists only for desktop dev). Direct
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

### Known deviation, in progress

**Update (2026-09-23, feature 010, live/VOD/series categories)**: a
provider source (Xtream JSON protocol) now imports only its **structure**
— the categories the panel declares — and obtains the items of a category
only when the person enters it
(`tv-web/src/lib/catalog/categoryLoader.ts`). This replaced an eager,
whole-catalog import that measurably froze the TV on a large real source
(the write to IndexedDB was the bottleneck, not the network). A source
imported by URL M3U, or a provider panel that doesn't speak the JSON
protocol (`ProviderImportMode.LEGACY_M3U`, surfaced as "Modo limitado"),
still imports everything eagerly, in one streaming pass — there's no
per-category protocol for a flat M3U file. See
`sdd/specs/010-catalogo-sob-demanda/` for the full design; ADR-002 has a
matching amendment on partial catalog coverage being the normal state now,
not an exception.

**Verified on the physical TV** (T046, 2026-09-23): 6 of 7 scenarios
passed; scenario G (M3U source) wasn't run for lack of an available source
in that session, and is covered by the automated T016 instead. Scenario B
only passed after R-013 (debounced prefetch). `plan.md`'s `## Estado Atual`
stays the authority if you need more detail.

## Language

Project documentation (ADRs, planning docs, backlog, specs) is written in
Portuguese. Match that when writing or amending files under `sdd/`,
`.planning/` and `docs/`. This file and code comments stay in the language
already used by their surroundings.
