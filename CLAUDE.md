# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`ccplayTv` is a native Samsung Tizen Smart TV app that plays and organizes
IPTV (M3U/Xtream) catalogs, enriched with TMDB metadata, with a planned
voice control (OpenAI) and Android remote-control companion app.

## Project status

Two features delivered (`001-importacao-fonte-m3u`, `002-splash-home-perfis`)
and one implemented pending hardware verification (`003-live-tv-avplay`). The
repo has working code on both sides:

- **`api/`** — Python 3.13 + FastAPI + SQLAlchemy 2 (async) + Alembic +
  PostgreSQL, managed with `uv`. Owns source import (M3U by URL and by
  provider credentials), classification, catalog storage, and the
  `/sources`, `/import-jobs`, `/catalog-items` routes.
- **`tv-web/`** — React 19 + TypeScript + Vite. Splash, Home (lists/sources),
  Add-source form, the list hub and **Live TV** are wired to the real backend.
  Live TV reads the imported catalog and plays a channel through
  `src/lib/player/` (`PlayerService` + AVPlay adapter, `<video>` adapter for
  desktop dev). **Filmes, Séries and the two detail screens still render mock
  data** from `tv-web/src/features/catalog/mockCatalog.ts` — they leave the
  mock in backlog items 9 and 10, which depend on the Xtream connector.
  The build targets `chrome108` explicitly, because Vite 8's default is
  Chrome 111 — above the TV's engine. Don't drop that from `vite.config.ts`.
- **`CCPlayTv/`** — the Tizen web project (`config.xml`, `index.html`,
  assets) that gets packaged into `.wgt`. `tv-web/scripts/sync-tizen.mjs`
  copies the Vite build into it (`npm run build:tizen`).
- **`tizen-app/`** — empty placeholder from the original setup guide; the
  real packaging project is `CCPlayTv/`.

Do not describe planned features as delivered — the backlog and the specs
are the source of truth for status, and honest verdicts are a constitution
principle.

## Commands

Backend (`api/`, needs PostgreSQL — `docker compose up -d postgres` from the
repo root):

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

`.planning/memory/constitution.md` (v1.1.0) holds 13 non-negotiable
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
- Secrets (provider passwords, full source URLs, TMDB/OpenAI keys) never
  reach the Tizen package, the frontend, logs, or visible UI. Never
  interpolate `str(exc)` from httpx — it embeds the URL.
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

ADR-001 to ADR-007 are accepted decisions — read the relevant one in full
before proposing anything that conflicts, and amend with an inline
`**Atualização (ADR-0XX):**` note rather than rewriting history.

| ADR | Subject |
|---|---|
| ADR-001 | Overall architecture and stack; `PlayerService`/AVPlay; Direct Play; voice and Android remote |
| ADR-002 | Cache-first / offline resilience on the TV |
| ADR-003 | Backend moved to Python + FastAPI + `uv` (**supersedes the earlier Node.js/Fastify plan**) |
| ADR-004 | No mandatory account; sources and import |
| ADR-005 | Catalog, preferences, IMDb rating, recommendations |
| ADR-006 | Library/SDK selection, boundaries, adoption increments A–E, validation gates V1–V9 |
| ADR-007 | TV design system and visual identity |

Plus `REQUISITOS-FUNCIONAIS.md` (RF-001 to RF-019) and
`ESPECIFICACAO-TRAILERS.md` (RF-019 detail).

**Split between a restricted TV front and a dedicated backend** — the TV
never does heavy processing or holds external API credentials:

- **Frontend (Tizen app)**: TypeScript, React, CSS, Vite (targeted at
  Tizen 8.0 / Chromium 108 on the reference Samsung QN50Q60DAGXZD, not
  generic web). Never parses raw M3U or calls TMDB/OpenAI directly — it
  receives a pre-processed catalog ready for virtualization. Playback goes
  through a `PlayerService` abstraction backed by `webapis.avplay`, never
  the HTML `<video>` tag (a `<video>` adapter exists only for desktop dev).
  Direct Play only — the backend never proxies or transcodes video.
- **Backend**: Python, FastAPI, SQLAlchemy 2 async, PostgreSQL. Modular
  monolith (no early microservices). Owns M3U import/normalization, TMDB
  matching, catalog storage, OpenAI function-calling (API keys live only
  here), and a planned authenticated WebSocket protocol (`playItem`,
  `pause`, `seek`, `search`) shared by the TV, a future Android remote, and
  voice commands.
- **Offline-first (ADR-002)**: the TV caches the processed catalog in
  IndexedDB on every successful sync and falls back to it immediately on
  launch or backend timeout, degrading backend-dependent features (voice,
  live search, remote control) rather than showing a fatal error screen.
  Video keeps working as long as the original source is reachable, since
  streams flow directly from source to TV.

### Known deviation to be aware of

`api/app/services/provider_connector.py` currently builds a
`get.php?...&type=m3u_plus` URL and reuses the M3U parser for provider
sources. This **contradicts ADR-006 §4.3**, which requires separate
`M3USourceConnector` and `ProviderSourceConnector` with a common normalized
output, and it discards the provider's `stream_id`/`series_id`/category
hierarchy. Fixing it is Fase 0, item 1 of the backlog — don't build more on
top of the current shape without reading that item.

## Language

Project documentation (ADRs, planning docs, backlog, specs) is written in
Portuguese. Match that when writing or amending files under `sdd/`,
`.planning/` and `docs/`. This file and code comments stay in the language
already used by their surroundings.
