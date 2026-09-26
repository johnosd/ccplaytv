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
deviation" below).

**Also code-complete, converged**: `011-assistir-filme-retomada` (movie
playback with capability contract, controls, and resume) — the
physical-TV gate is **partially closed**, see
`sdd/specs/011-assistir-filme-retomada/plan.md` → `## Estado Atual` for
the exact scenario-by-scenario status. Two real bugs only surfaced on
real hardware: the single-flight seek gate used to *accumulate* pending
jumps while one was in flight, which froze the app when a remote button
was held down (fixed: it now discards instead); and `MovieDetailScreen`'s
backdrop panel painted over the AVPlay hardware plane because the
transparency rule only covered `.screen`-rooted screens, not
`.movie-detail-layout` (fixed).

**In execution**: `012-series-episodios-temporadas` — series episodes now
play. `SeriesDetailScreen` obtains episodes on demand (Xtream
`get_series_info`, gated by the same 24 h freshness window as feature
010's categories) and, separately, groups M3U/"Modo limitado" episodes
(`S01E02`-style filenames, or files typed only by their `/series/` URL
segment) into a synthetic series — closing a pre-existing bug where the
latter graved a `kind:'series'` orphan per file, never reproducible.
Season tabs + a virtualized episode list, resume and a per-episode
"watched" mark (independent of movie's own resume, which is untouched),
and next-episode autoplay with a 10 s cancellable countdown that can
cross a season boundary. All four user stories are code-complete and
covered by the automated suite; `sdd/specs/012-series-episodios-
temporadas/plan.md` → `## Estado Atual` has the phase-by-phase detail.
The physical-TV scenarios (real AVPlay conclusion firing autoplay,
imagery on the hardware plane, no residual audio across the session
swap) are **recommended, not a mandatory gate** for this feature — see
that plan's R-005.

**In execution**: `013-favoritos` — favoriting across all three catalog
types (channel/movie/series). All five phases of code are done: a new
opt-in gesture in `useRemoteNav` (`onLongSelect`, hold-OK, keydown+keyup
with an 800ms threshold — legacy screens that don't pass it are
untouched, see the ADR-009 amendment), a Dexie v9 index to resolve a
favorite back into a catalog record, `resolveFavorites`/`useFavoriteIds`/
`useFavoritesContent`/`useToggleFavorite`, a shared `features/favorites/`
(toast + focus-to-neighbor + empty/unresolved states), a "★ Favoritos"
entry pinned atop the category rail in Live TV/Movies/Series, and
`deleteSource` now clears a removed source's favorites and resume state.
A first physical-TV pass found that a test remote control didn't deliver
`keydown`/`keyup` the way the browser does, which made the hold gesture
unusable on it — so favoriting now has a second, independent path: a
single tap of the remote's yellow key (`tizenColorKey.ts`,
`registerFavoriteColorKey`, `useRemoteNav`'s `onFavoriteKey`), never a
replacement for the hold gesture (FR-020/FR-021, D-010 in that plan).
565/565 tests, `tsc`/lint/build clean, one Playwright E2E script
(`tv-web/e2e/favoritos.mjs`) covering the core flows headless, including
the yellow-key path via a synthetic keyboard event. **The one gate still
open is the physical-TV verification of both paths — the hold gesture
(SC-001) and now also the yellow key (SC-006, plus whether the key name
`ColorF2Yellow` and the `tvinputdevice` privilege are correct, R-011)** —
this feature explicitly elevates that to a mandatory gate (constitution's
"Validação em hardware real" exception, same pattern as feature 011),
because a browser can't prove how the real remote's `keydown` auto-repeat
and `keyup` behave. See `sdd/specs/013-favoritos/plan.md` →
`## Estado Atual` and R-001/R-011.

**Converged**: `014-m3u-sob-demanda` — closes the gap feature 010 left
on purpose: an M3U source (URL or "Modo limitado") used to import every
item eagerly, because a flat M3U file has no per-category network
protocol. Code is now complete for two paths, chosen per import: (1) if
the URL matches an Xtream panel's shape
(`…/get.php?username=…&password=…`, `tv-web/src/lib/catalog/
m3uPanelUrl.ts`) and the panel confirms the protocol, the source follows
feature 010's provider path in full — structure only, items on entry,
`readCredential` derives dns/user/password straight from the stored URL
(never copied to another field); (2) otherwise (avulsa URL, unconfirmed
panel, or the pre-existing "Modo limitado" fallback), the importer scans
the file once, writes **only structure** to `categories`, and stores the
already-classified, per-category content in a new `storedEntries` table
(`fetchMode: 'stored'`) — entering a category reads and writes it to
`channels` exactly once per generation, no network, no re-scan
(`categoryLoader.ts`). ADR-010 is what allows the full source URL, each
item's playback URL, and the stored file's content to live in IndexedDB —
it extends ADR-008's provider-credential exception. The "Modo limitado"
badge on Home now comes with an explanation in the list hub
(`LimitedModeNotice.tsx`): the real reason, what the source loses versus
the full protocol, and what to do about it — previously the badge alone
gave no way to understand or act on it. Along the way, a pre-existing bug
surfaced and was fixed with the user's explicit approval: the "Tentar de
novo" retry button on all three category screens (Live/Movies/Series,
present since feature 010) looked focused (`tv-focus`) but SELECT never
activated it — only a mouse click did. Three E2E scenarios
(`tv-web/e2e/m3u-sob-demanda.mjs`) green; the two performance
measurements that need the user's real list (SC-001/SC-002) remain open,
tracked in the spec, not a convergence blocker. See
`sdd/specs/014-m3u-sob-demanda/plan.md` → `## Resultado Final`.

**In execution**: `015-capa-real-filmes-series` — closes a real gap the
user noticed: no cover art loaded anywhere, for either movies or series.
The connector/parser never captured it and the grid always drew the same
placeholder. Now `stream_icon`/`cover` (Xtream) and the M3U `tvg-logo`
attribute are captured into a new `iconUrl` field (`CatalogRecord`, no
Dexie version bump — it's an unindexed value field) through both import
paths (provider `on_demand`, M3U `stored`), and a new shared component,
`PosterArt` (`tv-web/src/components/PosterArt.tsx`), renders it with a
fallback to the existing placeholder — for a missing cover or a failed
load, never the browser's own broken-image icon. Live TV is deliberately
untouched. Loading follows the grid's existing virtualization window
(feature 009) by construction, not a new mechanism — confirmed by E2E
with 500 items in one category. Along the way, a real pre-existing bug
surfaced and was fixed with the user's explicit approval: `useCategory
FocusPrefetch` (feature 010's debounced trail-prefetch) kept a timer tied
to the trail's focused category even after the person had already
entered it; for a `stored` category (feature 014), that stale timer could
re-read already-consumed `storedEntries` blocks and overwrite the good,
already-displayed content with `source_missing` — content silently
vanishing ~300ms after entry, no user action needed. Fixed by cancelling
that timer once the focused category is the entered one. See
`sdd/specs/015-capa-real-filmes-series/plan.md` → `## Estado Atual`.

**Code-complete**: `016-zapping-live-tv` — pressing OK while a channel
plays fullscreen brings the category rail and channel list back on top of
the video, which keeps playing, dimmed behind it; picking another channel
switches the session, and only once it's actually playing does the list
close — never before, so there's no perceptible black/frozen frame during
the swap. A real hardware constraint shaped the design: `webapis.avplay`
is a singleton (only one video session can ever be open), so "no gap" is
achieved by keeping the zapping list itself as the opaque layer during the
swap, not by holding two concurrent sessions. `PlayerLayer.tsx` stayed
generic — it gained an optional `topLayer` (content + redirected
direction/select/back/longSelect/favoriteKey handlers, since its
`useRemoteNav({modal:true})` can only own one keyboard registration at a
time), `onIdleSelect` (fires when SELECT arrives with no control action
available, i.e. always true for a live channel), `onEnteredPlaying` and
`onSessionError` — it never learns what a "channel" is. All of that logic
lives in `LiveScreen.tsx`, reusing the exact same navigation functions as
the non-zapping path (extracted, not duplicated). Session swapping itself
is untouched — the existing `useEffect` on `[itemId, attempt,
createAdapter]` already closes-then-opens sequentially, and already
discards superseded in-flight switches, so rapid channel-hopping was free.
Holding OK (or the yellow key) inside the zapping list favorites the
focused channel without triggering a switch, per the spec's edge case —
this required extending `PlayerLayerTopLayer` with the same gesture
`LiveScreen` already had outside of zapping. 679 tests passing,
`tsc`/lint/build clean, a new Playwright E2E script
(`tv-web/e2e/zapping-live-tv.mjs`, 11 assertions) verified end-to-end in a
real Chromium (note: its `executablePath` targets the Linux sandbox path
already hardcoded by every other `e2e/*.mjs` script — running locally on
Windows needs a temporary path override, same as the others). See
`sdd/specs/016-zapping-live-tv/plan.md` → `## Estado Atual` and
`logic/zapping.md` for the full contract.

**Superseded by feature 018 below**: `017-busca-local-catalogo` shipped
local search as a single "🔍 Buscar" entry pinned atop each section's
category trail, searching that whole catalog type at once regardless of
category. It converged `Implementada` in that shape, but the user asked
for a redesign right after (recorded as R-006 in that feature's `plan.md`)
— the design actually in production is `018-busca-por-categoria` below.
What 017 still contributes unchanged: the `CategoryScreenSnapshot`
mechanism (restoring the exact category/search term, scroll position and
focused item when going back from a movie/series detail screen instead of
resetting to the top) and the `useRemoteNav` editable-target guard that
lets a text field coexist with remote-control navigation (ADR-009
amendment) — both reused as-is by 018. See
`sdd/specs/017-busca-local-catalogo/plan.md` → `## Estado Atual` and its
`R-006` for the full history.

**Code-complete**: `018-busca-por-categoria` — redesigns search per the
user's explicit request: instead of one catalog-wide entry, search is now
a 44×44px icon that appears inside each already-entered trail item — a
real category, "★ Favoritos", or a new virtual "Todos" category — once
that entry has at least one item loaded. Typing filters only what's
already loaded there (no debounce, unlike 017 — pure client-side filter
over in-memory items). "Todos" is a fixed second trail entry (right after
"★ Favoritos", `VIRTUAL_TRAIL_COUNT = 2`) that aggregates every category's
items already read into `channels` and lets search span all of them,
still excluded from Live TV zapping's search icon (FR-018) though "Todos"
itself is a normal zappable category (D-009). A category/Favorites never
entered, or a `stored` M3U category (feature 014) never opened, is left
out of "Todos" and the screen says so ("Busca em X de Y categorias") even
before typing anything, never silently narrowing without explanation.
`CategoryScreenSnapshot` gained a `{kind:'all'}` trail key and a
`searchActive` flag, replacing 017's separate `{kind:'search'}` state —
removed everywhere, along with the now-dead `useCatalogSearch` hook and
the orphaned `useDebouncedValue` helper it was the last caller of.
`searchIndex()` (the lower-level scan) survives unchanged as the engine
behind "Todos"; only the React hook wrapping it for the old design is
gone. 712 tests passing (one pre-existing `LiveScreen.favorites.test.tsx`
flake, confirmed 15/15 isolated), `tsc`/lint/build clean, a new Playwright
E2E script (`tv-web/e2e/busca-por-categoria.mjs`, 17 assertions) replacing
017's `busca-local.mjs`. See
`sdd/specs/018-busca-por-categoria/plan.md` → `## Estado Atual` for the
phase-by-phase detail.

**Code-complete**: `019-historico-continuar-assistindo` — closes the RF-014
gap left after `UserStateRepository` (008), movie resume (011) and
per-episode "watched" (012) shipped: a finished movie kept only losing its
resume position, never gaining an explicit "watched" mark, series had no
aggregated view of how many known episodes were seen, and
`getContinueWatching()` (008) had no consumer anywhere in the UI. Movie
reuses the exact same `completedAt` field episode already uses (no Dexie
migration) with its own auto-completion threshold, `MOVIE_WATCHED_RATIO =
0.9` (`resumePolicy.ts`), distinct from the pre-existing `RESUME_MAX_RATIO
= 0.95` that only clears resume — `isPastEnd`/`ProgressRecorderOptions`
both gained an optional ratio parameter, defaulting to the old constant so
episode behavior is untouched. `MovieDetailScreen` gained a manual
"Marcar/Desmarcar assistido" action, always last in the action array so the
primary action's fixed index never shifts. Series aggregation
(`summarizeSeriesWatched`, a pure function with no React/DB) treats episode
coverage as binary — "known" means every episode from that source's last
read, never partial, because `fetchSeriesInfo`/M3U category reads always
bring all episodes at once — and only ever reports "Em dia" with full
coverage and everything watched, never with partial or zero data. The hub
screen (`ListHomeScreen`) gained a "Continuar assistindo" section above the
three tiles, present only when at least one item has progress; an episode
never resolves to itself there (the app has no standalone episode route) —
`resolveContinueWatching` swaps it for its parent series record before
returning, reusing `resolveFavorites`' resolution core. Two real
concurrency/invalidation bugs surfaced only through the E2E script and were
fixed: `PlayerLayer`'s completion handler called `recorder.onExit
('completed')` fire-and-forget, so the cheaper 1-op `user-state`
invalidation could resolve before `markCompleted`'s 2-op (get+put)
transaction committed, leaving a still-mounted `MovieDetailScreen` stuck
showing "not watched"; `onExit` is now `async`/awaited before `onClose`/
`onCompleted` fire. Separately, `useToggleWatched` didn't invalidate the
`continue-watching` query key, so manually marking an item watched didn't
remove it from the hub section until an unrelated navigation forced a
refetch. 732 tests (5 pre-existing `*.favorites.test.tsx`/`LiveScreen.
test.tsx` flakes under full-suite parallelism, confirmed 64/64 passing
isolated), `tsc`/lint/build clean, a new Playwright E2E script
(`tv-web/e2e/historico-continuar-assistindo.mjs`, 11 assertions). See
`sdd/specs/019-historico-continuar-assistindo/plan.md` → `## Estado Atual`
for the phase-by-phase detail.

**Code-complete**: `020-ciclo-vida-player` — closes the last item of backlog
Phase 1 ("MVP: do catálogo real até assistir"): the system screensaver stays
off for as long as `PlayerLayer` reports `playing` (any of the three media
kinds), and turns back on on any other transition (pause, error, completion,
close, unmount) — one `useEffect` keyed on that single boolean, so zapping
(feature 016) never re-triggers it since the underlying channel session
never leaves `playing` while the list is open on top. Separately,
`document.visibilitychange` is now handled inside `PlayerLayer`'s existing
session-lifecycle effect (no new effect, reusing its own cleanup): hiding
the app pauses a movie/episode for real (`session.togglePause()`, guarded to
only act while genuinely `playing`/`buffering` — never re-toggling an
already-paused session, which would have resumed it) — but a live channel
has no real pause capability (`canPause=false`, decided by feature 011's
capability model), so hiding it instead closes the whole layer exactly like
RETURN would, with no automatic reopening (there's no position to resume
for live anyway). Becoming visible again with a still-open session
(movie/episode only — a channel's session already closed) re-confirms the
item's playback URL is still valid (`fetchPlayback`, a confirmation call
that never rebuilds the paused session) before allowing a resume attempt,
falling into the exact same error screen an initial open failure would use
if that confirmation rejects. A completion detected while the app was
hidden is handled exactly like a foreground one, for free — the existing
completion path in `PlayerLayer` was already agnostic of
`document.visibilityState`, so it needed no new code. 739 tests (2
pre-existing `SeriesScreen.favorites.test.tsx` flakes under full-suite
parallelism, confirmed passing isolated), `tsc`/lint/build clean, a new
Playwright E2E script (`tv-web/e2e/ciclo-vida-player.mjs`) that injects a
`tizen.power` mock via `page.addInitScript` (feature-detected the same way
`screenSaver.ts` checks for it in production) to prove the real screensaver
API gets called at the right moments in an actual browser, not just through
a spied-on TypeScript module. See
`sdd/specs/020-ciclo-vida-player/plan.md` → `## Estado Atual` for the
phase-by-phase detail, including a real screensaver-API-name risk (R-001)
and the closing-instead-of-pausing decision for live channels (R-003) that
are worth a second look before the physical-TV pass (recommended, not a
mandatory gate for this feature).

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
  `<video>` adapter for desktop dev), each engine declaring a capability
  contract (pause/seek/position/duration) the UI reads instead of ever
  branching on which engine is active. `src/components/PlayerLayer.tsx` is
  the one fullscreen playback layer shared by Live TV, Filmes and Séries
  (moved out of `features/live/` in feature 011; `SeriesDetailScreen`
  became its third consumer in feature 012) — any screen that mounts it
  needs its root covered by the hardware-plane CSS rule in `screens.css`
  (`.screen`-rooted screens already are; a screen with a different root,
  like `MovieDetailScreen`'s `.movie-detail-layout`, needs its own line
  added there — `SeriesDetailScreen` avoided this by staying `.screen`-
  rooted), or the video paints behind whatever that screen renders on top
  of it. The build targets `chrome108` explicitly, because Vite 8's
  default is Chrome 111 — above the TV's engine. Don't drop that from
  `vite.config.ts`.
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
npm run test:e2e       # Playwright E2E script against the dev server (tv-web/e2e.mjs)
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

`.planning/memory/constitution.md` (v1.5.0) holds 13 non-negotiable
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
  credentials). TMDB/OpenAI keys never reach the client at all.
  **Exception (ADR-008, extended by ADR-010)**: provider credentials (dns,
  username, password), the full source URL, each item's playback URL and
  the downloaded M3U file may live in the device's IndexedDB — that's what
  lets the client re-authenticate and play without a backend — but still
  never in a log, a rendered card, an error message, a third-party request,
  or an export/backup.
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
snapshot (a 671 KB single-line-per-block bundled page — reading it whole
fails on size; `Grep` with a narrow pattern and a small capture window,
e.g. `.{0,30}keyword.{0,80}`, pulls out one screen's markup/state logic
without loading the rest). **Before planning or architecting any new
screen, check both `docs/design/` (does the 9-screen prototype already
draw this screen or a close analogue — layout, focus flow, interaction —
before inventing one from scratch) and `docs/guia-praticas-app-tv/` (does
a Samsung/Tizen guideline constrain it — input method, focus, text entry,
media player chrome). Not every screen is covered (see backlog item 20 for
the known gaps: full-screen player controls, busca, favoritos, "continuar
assistindo", "Não classificados", import progress, error/offline states),
but check before assuming there's nothing there.** **New screens consume
tokens; they never hardcode a color, radius or font size.**

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
| `check-contract-tests.ps1 -Slug <slug> [-Write [-Paths <files>]] [-Json]` | Locks a feature's contract tests (written by `sdd-plan`, max 5 test cases) in `contract-tests.lock` by SHA256; without `-Write` it verifies nothing changed — `sdd-execute` must make them pass, never edit them |
| `resolve-assessment.ps1 [-Slug <slug>] [-Title "<description>"] [-Json]` | Creates/finds `sdd/assessments/<slug>/`, reports next phase (`define`/`decide`/`complete`) |

The `.specify/` / `.github/skills/speckit-*` tooling, if present in a
checkout, is a separate legacy system this one deliberately coexists with
and never reads or modifies.

## Architecture (from `sdd/adr/`)

ADR-001 to ADR-010 are accepted decisions — read the relevant one in full
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
| ADR-010 | Full source URL, per-item playback URLs and the downloaded M3U file may be stored on the device (extends ADR-008's credential exception); still never logged, displayed, sent to third parties or exported |

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

## Language

Project documentation (ADRs, planning docs, backlog, specs) is written in
Portuguese. Match that when writing or amending files under `sdd/`,
`.planning/` and `docs/`. This file and code comments stay in the language
already used by their surroundings.
