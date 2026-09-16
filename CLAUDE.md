# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status: pre-code, planning phase

**No application source code exists yet.** This repository currently contains
only the planning/spec-driven-development (SDD) scaffolding and two
architecture decision records. There is no `package.json`, no frontend, no
backend — nothing to build, lint, or test yet. Do not assume a stack beyond
what ADR-001/ADR-002 describe (see below), and do not invent build/test
commands; none exist until the first feature is planned and executed through
the SDD flow described below. This is also not yet a git repository.

`ccplayTv` is a native Samsung Tizen Smart TV app that plays and organizes
IPTV (M3U) catalogs, enriched with TMDB metadata, with a planned voice
control (OpenAI) and Android remote-control companion app.

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

### Important: skills live under `.gemini/skills/`, not `.claude/skills/`

The 8 skill definitions (`sdd-assess`, `sdd-adr`, `sdd-bugfix`,
`sdd-specify`, `sdd-plan`, `sdd-execute`, `sdd-converge`, `sdd-adhoc`) are
written as `.gemini/skills/<name>/SKILL.md` files for Gemini CLI. **There is
no `.claude/skills/` directory**, so Claude Code will not auto-invoke these
as slash-command skills. When the user asks in natural language for one of
these workflows (e.g. "especifica a feature de X", "planeja a feature 001",
"implementa a feature X", "converge a feature X", "documenta essa decisão de
arquitetura", "avalia esse bug", "avalia essa ideia"), **read the matching
`.gemini/skills/<name>/SKILL.md` file and follow its instructions manually**
as the procedure to execute — it is the full, detailed spec for that
workflow (the tables in `.planning/README.md` are a summary of the same
content). Don't skip this: the SKILL.md files encode required gates,
required document updates, and verdict-honesty rules (e.g. never mark a bug
fix `verified` without actually re-running the reproduction) that are easy
to under-deliver on if improvised from memory.

### Where things live

- `.planning/` — shared machinery: PowerShell scripts, doc templates, the
  project constitution (once it exists), and `backlog.md`.
- `sdd/` — generated work product: `sdd/specs/<NNN-slug>/`,
  `sdd/adr/ADR-NNN-slug.md`, `sdd/bugs/<slug>/`, `sdd/assessments/<slug>/`.
  Currently only `sdd/adr/` has content (ADR-001, ADR-002).
- `.planning/memory/constitution.md` — **does not exist yet**. It holds the
  project's non-negotiable, testable principles and is checked as a gate by
  `sdd-plan`. It doesn't need to pre-exist: `sdd-plan` bootstraps it with a
  short interview the first time anyone plans a feature.
- `.planning/backlog.md` — single status panel: `## Ideias Futuras` (unspecced
  ideas/bugs), `## Features` (status/progress of everything under
  `sdd/specs/`), `## Bugs` (status of everything under `sdd/bugs/`),
  `## Melhorias Ad-hoc` (log of `sdd-adhoc` tweaks). Maintained by the
  PowerShell scripts — don't hand-edit the status columns.

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

PowerShell 7+ (`pwsh`), project-agnostic, called by the skills themselves
(you generally don't need to invoke these directly — following a SKILL.md
will call them as needed):

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

## Planned architecture (from `sdd/adr/`)

No code implements this yet — this is the locked-in target shape from
ADR-001 and ADR-002, so future planning/execution should not re-litigate it.
Read the ADRs in full for rationale and rejected alternatives before
proposing anything that conflicts with them.

**Split between a restricted TV front and a dedicated backend** — the TV
never does heavy processing or holds external API credentials:

- **Frontend (Tizen app on the TV)**: TypeScript, React (screen management
  only), CSS, Vite (configured for Tizen's engine constraints, not generic
  web). Never parses raw M3U or calls TMDB/OpenAI directly — it receives a
  pre-processed catalog ready for virtualization. Video playback goes
  through a `PlayerService` abstraction backed by `webapis.avplay` (Samsung's
  native player, for DRM/audio-track/subtitle support), never the HTML
  `<video>` tag. Direct Play only — the backend never proxies or transcodes
  video streams.
- **Backend**: Node.js, Fastify, TypeScript, PostgreSQL. Single monolithic
  service initially (no early microservices). Owns M3U import/normalization,
  TMDB matching, catalog storage, OpenAI function-calling (API keys live
  only here), and an authenticated WebSocket protocol (`playItem`, `pause`,
  `seek`, `search`) shared by the TV, a future Android remote-control app,
  and voice commands.
- **Offline-first / resilience (ADR-002)**: the TV caches the processed
  catalog in IndexedDB on every successful sync and falls back to it
  immediately on launch or backend timeout ("Modo Offline"), with graceful
  degradation of backend-dependent features (voice, live search, remote
  control) rather than a fatal error screen. Video keeps working offline as
  long as the original M3U source is still reachable, since streams flow
  directly from source to TV.

## Language

Project documentation (ADRs, planning docs, backlog) is written in
Portuguese. Match that when writing or amending files under `sdd/` and
`.planning/`.
