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

**Code-complete**: `021-fundacao-visual-ds-v14` — Onda 0 of the migration to
Design System V14 "Spectrum" (`docs/design/design-system/`), per
`.planning/migracao-design-system-v14.md` and **ADR-011** (product
decisions for the whole migration: profile = IPTV list, single active
source, topbar without Esportes/Infantil yet, channel number = source
order — none of those land until the Onda 2 shell feature). This wave is
foundation only, with **zero layout change** on any existing screen
(proven by before/after screenshots of 8 core screens, `tv-web/e2e/
paridade-visual.mjs`, plus the full unit suite and all E2E scripts staying
green): Poppins/Inter now ship as local `.woff2` files
(`tv-web/src/assets/fonts/`, Fontsource v5, OFL licenses alongside) instead
of Google Fonts — `tv-web/scripts/sync-tizen.mjs` gained a guard
(`tizenFiles.mjs`'s `findUnlistedFiles`) that refuses to sync if the build
emits a file `tizen_web_project.yaml`'s `files:` doesn't list, the exact
failure mode that used to only surface on the TV. `index.css` now carries
the full V14 token set (spacing, radius, elevation, motion, semantic
colors, z-layers, safe zone) with every pre-existing token name kept as an
alias resolving to the same value. A new `Stage` component
(`tv-web/src/components/Stage.tsx` + `src/lib/stage.ts`) wraps the whole
app in a 1920×1080 logical stage, scaled uniformly to the real viewport —
identity (no `transform`) at 1920×1080, so the reference TV is pixel-for-
pixel unchanged; recalculates only on `resize`, never remounting children,
so focus survives. A single persistent `aria-live="polite"` region
(`AnnouncerRegion` + `useAnnounce`, `tv-web/src/lib/announcer.ts`) now
hosts `Toast` via `createPortal` when mounted — the naive approach (a
separate `sr-only` region echoing the toast text) would have duplicated
the toast's text node and broken `getByText`-based assertions across 6
screen test files plus the Playwright E2E; instead `Toast` renders
exactly as before when no region is in the tree (screen tests stay
untouched) and moves inside the region, remounted per `useToast()`'s
`toastKey`, only when one exists — see `sdd/specs/021-fundacao-visual-ds-
v14/logic/regiao-de-anuncio.md`. Reduced motion now has two independent
sources (`tv-web/src/lib/motionPreference.ts`): the system's
`prefers-reduced-motion` media query and a persisted internal preference
(`ccplaytv:reduce-motion` in `localStorage`, applied before first paint,
no UI toggle yet), either one collapsing animation/transition duration to
near-zero without hiding the final focus state. A 17-icon local SVG set
(`iconPaths.ts` + `Icon.tsx`) and state utilities
(`.no-scale`/`.pressed`/`.is-soft-disabled`/`.is-hard-disabled`,
`tv-web/src/styles/utilities.css`) are ready but consumed by no screen yet
— that starts with Onda 1 (feature 022). All 5 contract tests green,
858+ unit tests passing (a handful of pre-existing `*.favorites.test.tsx`/
`LiveScreen.test.tsx` flakes under full-suite parallelism, confirmed
passing isolated — same pattern already documented for earlier features).
Two real pre-existing bugs, in *other* features' E2E scripts, surfaced
only by finally running them and were fixed as small approved deviations:
`e2e/favoritos.mjs` pressed `ArrowUp` once to reach "★ Favoritos", stale
since feature 018 inserted "Todos" as a second fixed trail entry (needs
two); and `e2e/capa-real.mjs`'s virtualization scenario assumed a viewport-
sized layout window that the new fixed 1920×1080 stage genuinely changes
(confirmed experimentally: identical item count pre-loaded whether the
real viewport is 1280×720 or 1920×1080, proving the stage's logical area —
not the browser viewport — now decides it), so its fixed scroll-key count
went from 10 to 40. See `sdd/specs/021-fundacao-visual-ds-v14/plan.md` →
`## Estado Atual` and R-009/R-011 for both. Next: Onda 1 (feature 022,
component library) consumes the icons/utilities built here.

**Code-complete**: `022-biblioteca-componentes-ds-v14` — Onda 1 of the DS V14
migration: a library of 16 isolated components in `tv-web/src/components/`
(`Modal`, `EmptyState`, `ErrorState`, `Rail`, `ContentCard`, `ChannelRow`,
`SideCategoryNav`, `Tabs`, `Button`, `IconButton`, `Chip`, `Spinner`,
`Skeleton`, `OfflineBanner`, `TextField`, `ComingSoon`) plus two small libs
(`lib/onlineStatus.ts`, `lib/comingSoon.ts`) and one CSS layer
(`styles/components.css`, imported in `main.tsx` between `utilities.css` and
`screens.css`). **No screen consumes any of them yet** — that starts with
Onda 2 — and no file under `tv-web/src/features/` changed (SC-006); the
proof is each component's own tests, not a new screen. Design points worth
knowing before reusing them: `Modal` is a thin shell over
`useRemoteNav({modal:true})` (capture phase + `stopImmediatePropagation`), so
the screen behind never sees a key while it's open and "focus returns to the
opener" is free — but it does **not** move focus or pick which child starts
focused (focus here is state, owned by whoever renders the content; R-006),
and a second `Modal` mounted while one is active renders nothing (module-level
singleton, FR-009). `Rail` is the project's first *horizontal* use of
`@tanstack/react-virtual`, with fixed, **both required**, `itemWidth`/
`itemHeight` props instead of the `ResizeObserver` measuring the vertical grid
needs (R-002) — its items are absolutely positioned, so without `itemHeight`
the rail collapses to height 0 and nothing shows (R-007; the contract tests
passed anyway because jsdom computes no layout — only a real-browser check
caught it), and its edge fade only appears on a side that actually has more
content. Interactive components take `focused` (`focusedId` on `Tabs`/
`SideCategoryNav`, `focusedActionIndex` on `ErrorState`) to show `.tv-focus`
for state-driven focus, the app's usual pattern (ADR-009). `ContentCard` and
`ChannelRow` wrap the existing `PosterArt` rather than re-implementing its
cover/fallback logic. `EmptyState`/`ErrorState` use a plain
`<button className="button-secondary">` on purpose — importing `Button` would
make a P1 story depend on a P3 one; both converge on the same CSS class
instead. `ComingSoon` announces "Em breve — {message}" itself through
`useAnnounce()` (feature 021), so it satisfies FR-035 even with no `onSelect`
from the consumer; `getComingSoon(id)` throws on an unregistered id, in any
environment. `OfflineBanner` reads real `navigator.onLine` + the
`online`/`offline` events. 927 tests (925 passing; 2 `*.favorites.test.tsx`
flakes under full-suite parallelism, confirmed 20/20 passing isolated — same
known pattern as earlier features), `tsc`/lint clean, 5/5 contract tests
green, 7/8 E2E scripts green against a freshly started dev server (`e2e.mjs`
fails on the same pre-existing "Sair" dialog bug as before, feature 021's
R-005; against a dev server left running for ~9 h the sequence became
intermittently unstable, also on the previous commit — restart it before
running E2E). `sdd-converge` then found 8 gaps, all fixed in a Phase 13
(`Rail` height above all; the `Modal` focus question was resolved by amending
spec/plan — state-driven focus, no DOM focus — not by adding code). Two things came up
during execution: the locked contract C5 asserted `getByText('pôster')`,
which can never match `PosterArt`'s label (the `<br/>` splits it, so Testing
Library sees `"pôsterFilme Exemplo"`) — fixed with the user's explicit
approval by switching to `{exact:false}` and re-locking (R-005); and
`SC-005` (Skeleton vs ContentCard identical dimensions) is only partially
provable until a screen renders both together (R-004). Not done here, by
design: no physical-TV pass (nothing user-visible ships in this wave), no
`TextField` field chaining, no new icons (`Chip` uses a literal `✓` because
none of the 17 icons is a check). See
`sdd/specs/022-biblioteca-componentes-ds-v14/plan.md` → `## Estado Atual` and
`## Riscos e Decisões` (R-001–R-006).

**Code-complete**: `023-shell-navegacao-entrada-ds-v14` — Onda 2 of the DS V14
migration, per ADR-011: the app's entry point changes from "Home of sources →
source hub (3 tiles) → Live/Movies/Series" to **Splash → "Quem está
assistindo?" (profile = list) → Início (hub content) of the active source,
under a persistent topbar** — Live TV, Filmes, Séries and the detail screens
keep today's full-screen layout unchanged (that redesign is Ondas 3/4); only
where their root-level RETURN goes changes. Navigation moved out of inline
`setNav` calls in `App.tsx` into a pure reducer
(`tv-web/src/navigation/appNav.ts`, `logic/navegacao-app.md`) — `App.tsx` now
only dispatches actions and renders `state.screen`, which is what let RETURN-
in-layers (modal → detail-restore-by-snapshot → Início-with-origin-focus →
Início-is-base → exit modal) and "picking a list zeroes the stack" become
unit-testable without mounting the whole app. `ProfilesScreen.tsx` replaces
the old `HomeScreen.tsx` (source list): same cards, now with a focusable
`ErrorState`+"Tentar de novo" on read failure (closes a backlog bug) and
delete-with-confirmation through a `Modal` (feature 022) instead of the old
immediate delete. `HomeScreen.tsx` was repurposed into the **Início**: an
`AppShell`+`TopBar` shell (`tv-web/src/features/shell/`) wrapping the same
hub content (`ListHomeScreen.tsx`, restyled, now one of two keyboard scopes
alongside the topbar — `logic/foco-shell.md`). The topbar, active, registers
in the capture phase and stops propagation on the keys it handles
(`useRemoteNav({...}, {modal: active})`) — without that, a Chromium key
event's `setState` flush between two `document`-level listeners let the
content scope double-process the same key that just handed it focus back (a
real, reproducible race the E2E scripts caught; jsdom never shows it because
`act()` batches differently). A real, in-scope bug surfaced only through that
same E2E pass: when the focused "Continuar assistindo" item disappears while
the screen is still mounted (completed elsewhere, the query revalidates), the
keyboard-focus state used to stay pinned to the now-empty row with nothing
rendered to hold it — no visible focus anywhere, a real "Foco Visível e Sem
Becos Sem Saída" violation — fixed by deriving an effective row (falls back
to the shortcuts row whenever the row it's set to no longer has content)
instead of reading the raw state, the same pattern `ProfilesScreen` already
used for its own focus-by-id. Onboarding, the import-progress screen and the
Splash got the V14 visual, with one behavior change requested by the spec:
progress no longer advances on its own — it ends on a focused "Abrir lista"
action, so import warnings can actually be read before the person moves on.
All 9 `e2e/*.mjs` scripts plus the root `e2e.mjs` (fully rewritten — the old
one tested an exit dialog that hadn't existed in `AddSourceScreen` since
before this repo's single squashed initial commit, closing that backlog bug
too) pass green in a real Chromium. 1049/1051 unit tests (the 2 failures are
the same `*.favorites.test.tsx` flake-under-parallelism pattern already
documented for earlier features, confirmed 20/20 passing isolated),
`tsc`/lint/build/`build:tizen` clean, all 5 contract tests green. Not done
here, by design: Configurações, global search and the definitive Home (all
Onda 5); the topbar over Live/Filmes/Séries (Ondas 3/4); real phone/QR
pairing (item 22 of the backlog — the onboarding card is a soft-disabled
mock). Along the way, a **pre-existing, out-of-scope** gap surfaced by
accident and was **not** fixed here, only logged: feature
`017-busca-local-catalogo`'s contract lock references two screen-level test
files that no longer exist (dead code removed, most likely, when
`018-busca-por-categoria` replaced that whole search UI without re-locking
017's now-stale contract) — see the backlog's Bugs section. See
`sdd/specs/023-shell-navegacao-entrada-ds-v14/plan.md` → `## Estado Atual`
and `## Riscos e Decisões` for the full detail.

**Converged**: `024-live-tv-ds-v14` — Onda 3 of the DS V14 migration: Live TV
moves under the persistent topbar shell (feature 023), with the V14 side
nav/toolbar/states it shares with the rest of the app from here on. The
channel number shown next to a channel is never the provider's own `num`
field (ADR-011) — verified against a real Xtream panel and refuted as a
stable global position, so it stays the app's own derived rule
(`logic/numero-do-canal.md`), exactly as the plan's fallback already
anticipated. Two real, out-of-scope bugs surfaced during execution and were
fixed: the Fase 3 CSS cleanup removed rules that `MoviesScreen`/
`SeriesScreen` (not yet migrated at the time) also depended on, caught only
by the E2E script (jsdom doesn't apply CSS); and `e2e/capa-real.mjs`
(feature 015) also exercised Live TV without being listed in any task,
fixed as an ad-hoc task. Converged clean by `sdd-converge` (2026-09-27): all
33 functional requirements and 6 measurable outcomes met, 1113 unit tests
(3 pre-existing flakes, confirmed passing isolated), 5/5 of this feature's
own contract tests plus 4 other features' locks intact,
`tsc`/lint/build/`build:tizen` clean, 9 E2E scripts green including a new
`live-tv-ds-v14.mjs` (27 assertions). The physical-TV pass stays
recommended, not a gate, for this feature — not done this session for lack
of device access. See `sdd/specs/024-live-tv-ds-v14/plan.md` →
`## Resultado Final`.

**Converged**: `025-filmes-series-ds-v14` — Onda 4 of the DS V14 migration:
`MoviesScreen`/`SeriesScreen` became thin wrappers over one shared
`VodCatalogScreen`, under the same topbar shell, with the V14 side nav
("Sua biblioteca": ★ Favoritos, ↺ Histórico; "Catálogo": Todos + the
source's own categories), a toolbar (search/sort), a fixed non-focusable
hero band, and a virtualized grid of `ContentCard`. `↺ Histórico` reads
`lastWatched` already written by features 011/012 (never a network call),
series aggregated by their most-recently-watched episode. Year/added-date
(movie and series) and episode duration/image now come from the provider's
own dedicated fields, never parsed out of a title or reused from
`last_modified`. Sort (source order/A–Z/Year/Recently added) is a
per-session, per-section choice, never persisted, and absent where there's
no real data to sort by. Both detail screens
(`MovieDetailScreen`/`SeriesDetailScreen`) gained the V14 hero, pill
actions (primary action now at index 0 — a real content deviation from the
old layout, where Trailer used to be first), tabs, a season picker in a
modal (replacing the old arrow-driven tabs), and episodes as landscape
`ContentCard`s with real progress (a duration-backed bar, or "Continuar de
mm:ss" when there's no known duration — never an invented percentage).
Converged clean by `sdd-converge` (2026-09-27): all nine phases built as
planned, no new deviation found in the audit beyond what execution already
logged (R-003). Two risks stay open, not gates: real provider field names
(no live panel access this session) and grid height with a large item count
(no fixture with enough items to confirm two full rows visually) — both
need an environment this session didn't have. See
`sdd/specs/025-filmes-series-ds-v14/plan.md` → `## Resultado Final`.

**Converged**: `026-home-busca-configuracoes-ds-v14` — Onda 5 of the DS V14
migration, closing the migration's shell/navigation arc: `HomeContent.tsx`/
`HomeScreen.tsx` fully replace the old provisional hub (`ListHomeScreen` is
confirmed gone from the codebase, surviving only in explanatory comments) —
a hero cascade (continue-watching → favorite → welcome), real rails
("Continuar assistindo"/"Minha Lista"/"Canais favoritos") with
skeleton+virtualization, "Ver todos (N)"/"Filmes (N)"/"Séries (N)" opening
the right destination's `★ Favoritos`, and two honestly-labeled mocks (AI
curation, a service dock) — never fake content passed off as real.
`SettingsScreen.tsx` ships all 6 tabs in the right order (Fontes IPTV
first), full source management (Edit/Resync/Delete-with-confirmation/Add),
a Modo-limitado badge with no credential ever visible, a real persistent
"Reduzir movimento" toggle, and "Gerenciar listas" from the profiles screen
opening Configurações with no topbar and no active source. `SearchScreen.tsx`
is the app's first global search: a real IME field, a permanent coverage
notice, a 2-character threshold, rails by content type, an empty state, and
layered RETURN (keyboard → screen). One pre-existing, out-of-scope bug
surfaced by accident and was fixed with the user's explicit approval:
`MovieDetailScreen.tsx`'s `formatShortDate` formatted in local time instead
of UTC. Converged clean by `sdd-converge` (2026-09-28): all three user
stories built exactly as specified, no scope deviation, all Decisões
Invariantes held without amendment. The physical-TV pass isn't a gate for
this feature (no exception declared) — rail render cost, the TV's real IME
and hardware-plane confirmation stay open as recommendations. See
`sdd/specs/026-home-busca-configuracoes-ds-v14/plan.md` → `## Resultado
Final`.

**Code-complete**: `027-player-chrome-ds-v14` — Onda 6 of the DS V14
migration: replaces `PlayerLayer`'s old controls bar (feature 011) with the
V14 chrome for all three media kinds. VOD (movie/episode) keeps every key
behavior from feature 011 unchanged (↑/↓/OK reveal, ←/→ jump ∓10s when
hidden, the 5s auto-hide, pause never hiding) but now shows title/subtitle,
a real timeline (only with `canSeek` **and** known duration — a real
deviation from FR-002 caught writing this feature's own tests: the old code
already required both, the first draft of the new chrome only checked
duration), and a row of controls built by a new pure function,
`chromeControls()` (`components/chromeControls.ts` — renamed from the
plan's original `playerChrome.ts`, see below), covering real seek/pause,
episode-neighbor buttons (soft disabled at the boundary, crossing seasons)
and five "Em breve" mocks (Áudio, Qualidade, Velocidade, Aspecto, Info).
Live gained the two-level chrome the spec asked for: a **band** (live bug,
channel number, logo, name — deliberately zero `<button>`, the one
`Complexity Tracking` deviation in the plan) shown on entry and after every
channel switch, and a **row** (Guia + four mocks, never Velocidade/never
play-pause) revealed by ←/→; ↑/↓/CH± switch channels directly even with the
chrome hidden, via a new `onChannelStep` prop `LiveScreen` implements with
a `zapSequenceRef` snapshot of whatever list the channel started from
(category, "★ Favoritos", or "Todos" — the mechanism doesn't care which).
Media keys (`MediaPlayPause/Play/Pause/Stop/Rewind/FastForward`,
`ChannelUp/Down`) are registered by a new `lib/tizenMediaKeys.ts`, strictly
(unlike the yellow-key precedent: an empty/missing `getSupportedKeys()`
list registers nothing here, not "assume supported") and routed through a
new optional `useRemoteNav` handler, `onMediaKey`. Two real bugs surfaced
during execution, both fixed: a Windows-only module-resolution collision
(`playerChrome.ts` and the new `PlayerChrome.tsx` differ only in the first
letter's case — on a case-insensitive filesystem, Vite's extension-probe
order resolved the extension-less import to the wrong file, silently
returning `undefined`; the logic module was renamed to `chromeControls.ts`
to remove the collision entirely) and a stale-closure race
(`chromeMedia`/`chromeLevel`/`focusedIndex`/`seekBarFocused` were
`useState`, but `sessionRef.current` — a ref — updates synchronously the
moment a new session is created; a key landing in the gap between that and
the next React commit read the new session through the *old* render's
closure, executing the wrong branch — reproduced by 11 zapping tests in
`LiveScreen.test.tsx`; fixed by moving all four to refs, the same pattern
`sessionRef.current.state` already used in this file for exactly this
reason). Contract 5/5 green, 1269/1273 unit tests (the same
flake-under-parallelism pattern already documented for earlier features,
confirmed passing isolated), `tsc`/lint/`build`/`build:tizen` clean, a new
Playwright E2E script (`tv-web/e2e/player-chrome.mjs`, 33 assertions) plus
every existing `e2e/*.mjs` and `npm run test:e2e` green (one, `ciclo-vida-
player.mjs`, needed a small timing-wait addition — the new chrome's extra
render cycle from the ref+forced-render pattern above left a real, if
narrow, race against the screensaver-effect check that script already
made). `quickstart.md`'s five scenarios were exercised: 1–3 and 5 through
the new E2E script in a real browser, and scenario 4 (channel neighborhood
scoped to "★ Favoritos") interactively via Playwright MCP, since
`LiveScreen.test.tsx` doesn't mock `useFavoritesContent` — confirmed
working end to end. **The one gate still open is the physical-TV pass**
(SC-004, explicitly mandatory per this feature's spec, same pattern as
013/011): media-key names/`keyCode`s, `getSupportedKeys()` on the real
QN50Q60DAGXZD, chrome/toast over the AVPlay hardware plane, and whether
↑=previous/↓=next feels natural all only provable there. A **pre-existing,
out-of-scope** gap surfaced by accident and was **not** fixed here, only
logged: `CLAUDE.md` itself was never updated by the convergence of
features 024, 025 or 026 (this section jumps from 023 straight to this
paragraph) — see the backlog's Bugs section. See
`sdd/specs/027-player-chrome-ds-v14/plan.md` → `## Estado Atual` and
`## Riscos e Decisões` (R-008/R-009/R-010) for the full detail.

**Code-complete**: `028-limpeza-qa-ds-v14` — Onda 7 of the DS V14 migration
and its closing wave: cleanup and QA, not new UI. `features/screens.css`
(754 lines, the last pre-V14 CSS file) is gone — its live rules moved to a
new `styles/shared.css` (same import slot in `main.tsx`) or to the owning
screen's own file, 13 dead rules deleted, and the playback-layer block
moved verbatim to the top of `player.css`. A real CSS collision surfaced
and was fixed along the way (`.search-field-row`/`.search-coverage`, same
bare selector and specificity in two files — resolved per property, not by
picking a file). `findUnnamedControls` (`tv-web/src/testing/
accessibleNames.ts`, built on `dom-accessibility-api`) is now applied
across every screen's main states, closing 8 real FR-015/FR-016 gaps (a
soft/hard-disabled control with no `aria-disabled` and no "em breve" in its
name, or an interactive element with no accessible name at all) —
`ComingSoon`, `HomeContent`, `AccessibilityPanel`, `LiveScreen`,
`VodCatalogScreen` and the shared `Tabs` component (the last one closing
the gap for `MovieDetailScreen`/`SeriesDetailScreen` for free).
`PlayerLayer`/`PlayerChrome` needed no fix — already correct since feature
027. The full §34 Tizen QA matrix (`sdd/specs/028-limpeza-qa-ds-v14/
matriz-qa.md`) was run across every screen, finding and fixing this
feature's own absorbed bug — native scrollbars visible on a D-pad-only
app — in 6 more places beyond the Filmes/Início cases the bug report named
(`Modal`, the Live TV channel list, Busca's body, the Configurações panel,
the shared movie/series detail root, and the episode list), each with
`.no-scrollbar` and its own unit test; one related, smaller gap (the season-
picker modal has no dedicated "more below" indicator for an unrealistically
long season list) was logged to the backlog instead, since it needs a
design decision. The stale contract lock on feature `017-busca-local-
catalogo` (flagged by accident during feature 023 — it referenced two
screen-level test files removed when feature 018 replaced that whole search
UI) was retired down to the two files that still exist and still matter.
1329/1333 unit tests (4 flakes matching the same parallelism pattern
documented for earlier features, confirmed passing isolated), all 12
contract locks in the repository intact, `tsc`/lint/`build`/`build:tizen`
clean, every `e2e/*.mjs` script green including a new `limpeza-qa.mjs`
(now part of `test:e2e`) and `paridade-limpeza.mjs` (21 screens/states,
zero unintended pixel diff across every phase). **The physical-TV pass is
this feature's own explicitly mandatory gate (SC-008)** — done, in a
follow-up session, once the reference QN50Q60DAGXZD became reachable
(`deploy-tv.ps1` auto-discovered its real IP and installed/launched the
app). The user ran a script covering splash, Início, Live TV/zapping,
Filmes/Séries, detail screens, player chrome and rapid-repeat (holding
down ↓). See `sdd/specs/028-limpeza-qa-ds-v14/plan.md` →
`## Estado Atual` and `## Riscos e Decisões` (R-009/R-016) for the full
detail.

**Code-complete**: `029-audio-legendas-info-player` — backlog item 55a: the
player chrome's "Áudio e legendas" and "Info do stream" buttons (feature 027
mocks `player-tracks`/`player-info`, now removed from `comingSoon.ts`) are
real, in VOD and Live. `PlayerAdapter` gained **optional** methods
(`getTracks`, `selectAudioTrack`, `selectTextTrack`, `getStreamInfo`) and an
`onSubtitle` callback; a missing method means a missing capability, and the
button shows soft-disabled "— indisponível" (`chromeControls` got an
`availability: 'unavailable'` and a `features` parameter), never a fake
option. The AVPlay adapter mutes subtitles on `open()` (they start **off**)
and never forwards the raw engine error. Subtitles are drawn by the app
(`SubtitleOverlay`, fixed style — configurable appearance is backlog item
56), and the panel shows only what the engine reports: no invented codec,
FPS, buffer or protocol, and protocol is never derived from the URL.
Advancing an embedded subtitle (−500/−1000 ms) is soft disabled — the AVPlay
reference says `setSubtitlePosition` only applies to external subtitles — so
only delaying (+500/+1000 ms) is real. The audio/subtitle/delay choice is
kept in memory and re-applied **by language** (never by track id) on the next
channel (zapping/CH±, the layer stays mounted) or episode (autoplay's
countdown unmounts the layer, so `SeriesDetailScreen` holds it in a ref and
clears it when the sequence ends). A real design constraint: `PlayerLayer`
already intercepts the keyboard in the capture phase, so a child `Modal`
would never receive a key — the two panels are the layer's own state
(`panelRef`, priority `topLayer` → panel → error → chrome), with `Modal`'s
CSS but not the component. Contract `PlayerLayer.audio-legendas-info.
contract.test.tsx` 5/5 locked; the 027 contract was amended, with the
user's explicit approval, only on the line requiring the two mocks
(recorded as R-011 in that plan) and re-locked. 1433/1437 unit tests (the 4
failures are the same `*.favorites.test.tsx`/`LiveScreen.test.tsx`
flake-under-parallelism pattern already documented, confirmed 106/106
passing isolated), `tsc`/lint/`build`/`build:tizen` clean, a new Playwright
E2E script (`tv-web/e2e/audio-legendas-info.mjs`, 39 assertions, part of
`test:e2e`) that injects a **fake** `webapis.avplay` to exercise the real
adapter mapping in Chromium, and the full `npm run test:e2e` (12 scripts)
green. **Not verified, deliberately**: the user deferred the AVPlay spike
(Phase 1, T001/T002) because the TV wasn't reachable — the real
`getTotalTrackInfo`/`extra_info` shape, `setSelectTrack` while paused,
`onsubtitlechange` and the subtitle over the hardware plane are all built
from Samsung's reference only (R-001–R-004 stay "não testado"; the physical
pass is recommended, not a gate, per the spec). See
`sdd/specs/029-audio-legendas-info-player/plan.md` → `## Estado Atual` and
`## Riscos e Decisões`.

**Code-complete**: `030-epg-dados-agora` — items 42a+42b of the backlog: EPG
data and "Now" everywhere it was reserved. Each source now gets XMLTV
programming stored on the device: from the Xtream panel's own `xmltv.php`
(URL derived from the source's credential at read time, never stored), from
an M3U's `url-tvg`/`x-tvg-url` header, or from an address the person types
(manual wins). Read as a stream in a dedicated Web Worker
(`assets/epgWorker.js`, listed in `tizen_web_project.yaml` — the sync guard
refuses to build without it), gzip detected by the body's magic bytes, only
the −12h…+48h window kept in a new Dexie v11 `epgPrograms` table replaced
per generation (a failed sync never wipes the previous programming).
Channel↔programme matching is by **exact id only** (`epg_channel_id`/`tvg-id`,
new `epgChannelId` on channel records) — never by name. Sources imported
before this feature have no stored channel ids, so opening one triggers a
single silent resync (`decideOnOpen` → `'migrate'` by `epgIdsCapturedAt`);
that differs from the spec's FR-007 wording ("renew the category on entry"),
recorded as R-002. Surfaces: `ChannelRow` "Agora" + real progress bar in every
Live list (categories, ★ Favoritos, Todos, search, zapping — they share
`renderColumns`), preview with "Agora"/"A seguir"/synopsis, the Live player
band (`PlayerIdentity.now`, PlayerLayer stays EPG-agnostic) and the Home
"Canais favoritos" rail. No EPG for a channel = empty slot, never invented
text. Settings › Fontes IPTV › EPG is a real screen (`EpgSettingsScreen`,
real DOM focus with ± 1 h buttons — R-011 — instead of the ←/→ design in
`logic/`), the `settings-epg` mock is gone, `SourceView` still carries no
URL (only the manual address's hostname), every failure is `EPG-02` with a
categorized reason and never logs the raw error. ADR-010 was amended inline
to cover the stored EPG addresses (the constitution's exception text was not
changed). "Guia completo"/"Guia" were still `epg-guide` mocks at this point
(they became real in feature 031, below).
Contract 5/5 locked, 1534/1537 unit tests (the 3 failures are the known
`*.favorites.test.tsx` parallelism flakes, 27/27 isolated), `tsc`/lint/
`build:tizen` clean, `npm run test:e2e` green including the new
`e2e/epg-dados-agora.mjs` (fake server, gzip XMLTV, Worker, all four
surfaces, the settings screen) plus `e2e/epg-dados-agora-real.mjs` (kept out
of `test:e2e`; reads the root `.env`, prints only counts) which passed
against the real panel. Worth knowing before touching this: the reference
panel's XMLTV only carries programming for **10 channel ids** in the window
(954/954 channel ids match, but few have programmes), and the channel lists
are virtualized, so a "Now" row can be dozens of rows down. Two real
pre-existing bugs surfaced through the E2E and were dealt with: `Modal`
activated in a `useEffect`, so a key pressed right after the dialog appeared
leaked to the screen underneath (`home-busca-configuracoes.mjs` failed ~36%
of runs on the pre-030 code before the fix — measured on a `HEAD` worktree;
fixed with the user's explicit approval by switching to `useLayoutEffect`,
regression test `Modal.teclas-na-montagem.test.tsx`); and the same script's
"com progresso salvo… vira Continuar" step still fails ~19% of runs on the
pre-030 code (unfixed, awaiting a decision). **Still open**: the physical-TV
pass is recommended, not a gate — real `DecompressionStream` on Chromium 108
(R-007), the Worker loading without falling back (R-005), navigation staying
fluid during a large sync (SC-002, R-006), and the `.env`'s external XMLTV
URL, which timed out from the dev machine (R-001). See
`sdd/specs/030-epg-dados-agora/plan.md` → `## Estado Atual` and
`## Riscos e Decisões`.

**Code-complete**: `031-epg-guia-completo` — backlog item 42c: the full-screen
programme guide, so "Guia completo" (Live preview) and "Guia" (player chrome)
are real and the `epg-guide` mock is gone. `EpgGuide`
(`features/live/guide/`) is a channel × programme grid over the data feature
030 already stores: a pure model (`guideGrid.ts`, `guideRows.ts` — focus is
`{channelId, programStart|null}` plus a `refTime` column, a 2 h visible window
inside the stored −12 h…+48 h, block geometry in % of that window, local-calendar
Hoje/Amanhã) and one component with two hosts. **Stopped**: it replaces the Live
screen's content, no topbar (`.epg-guide-screen`). **Playing**: it is the
`PlayerLayer` `topLayer`, opaque, with the channel session alive behind it; it
closes only once the channel picked in it is actually playing
(`guideWatchPendingRef`, so a buffering blip never closes it). The guide
registers no keyboard of its own — the host forwards keys through
`EpgGuideHandle` (`onDirection/onSelect/onBack/onPage`), because `PlayerLayer`
captures the keyboard and a child `Modal` would never receive a key (same
constraint as feature 029; the list selector is therefore the guide's own
panel, not `Modal`). `PlayerLayerTopLayer` gained an optional `onMediaKey` so
CH±/ChannelUp/Down reach the guide (page = visible rows − 1); the chrome's
"Guia" is real only when the screen passes `onGuide`, otherwise it stays
"Guia — em breve" without a mock id (this keeps feature 027's locked contract
intact). OK on a current/future programme plays that channel and makes the
guide's list the zapping neighbourhood; OK on a finished one only says so;
focus is state + `.tv-focus`/`.no-scale`, one focus at all times, every state
(loading/error/empty/no-EPG) has a focusable action, and moving focus never
fires a request. A real CSS bug only a browser could show: overriding
`.screen` to `position: relative` collapsed the guide to 0 px height (jsdom
computes no layout; found by the new E2E). One real logic bug found by a
locked contract: `onGuide` had been wired into the VOD branch of the chrome's
`onSelect` instead of the Live one. Contract 5/5 locked, all 15 repository
locks intact, 1579/1583 unit tests (the 4 failures are the known
`*.favorites.test.tsx`/`LiveScreen.test.tsx` parallelism flakes, 106/106
isolated in 3 runs), `tsc`/`build:tizen` clean, new
`e2e/epg-guia-completo.mjs` (part of `test:e2e`) and
`e2e/epg-guia-completo-real.mjs` (kept out of it; reads the root `.env`,
prints only counts/ms) both green — the real run found a channel with real
programming (p95 key→focus 128 ms) but its "Todos" only covered 2 of 41
categories, so **R-003 (performance with thousands of channels) is not proven**.
**Open, not gates**: the physical-TV pass (opaque guide over the AVPlay
hardware plane with audio following — R-002; holding ↓/→ on a real list; CH±
delivery), and "Configurar EPG" opened while a channel plays closes the player
(R-010). See `sdd/specs/031-epg-guia-completo/plan.md` → `## Estado Atual` and
`## Riscos e Decisões`.

**Code-complete**: `032-metadata-tmdb-integracoes` — backlog item 28, with a
scope the spec revised after measuring the real panel: the Xtream provider
**already ships** synopsis, backdrop, genre, cast, director, country and
`tmdb_id` (movies in `get_vod_info`, series in `get_series_info.info` — and
in `get_series` itself), and the app captured none of it. Now the movie/series
detail shows backdrop (a real `<img>` inside the hero — never a
`background-image` on the `.screen`, or it paints over the AVPlay plane),
synopsis truncated at ~3 lines with a focusable "Ver mais" (rule: more than
220 characters, never a layout measurement) opening a modal, and
Gênero/Duração/Direção/País/Elenco (text) in the Detalhes tab, all fetched
**only when the detail opens** (never on focus, never in bulk — verified in
a real Chromium: walking the grid makes zero metadata requests) into a new
`titleMetadata` table keyed by `stableId` (Dexie v12; 24 h for the provider,
6 months for TMDB). The TMDB (`lib/metadata/`) only fills fields the
provider left empty (provider always wins, merged at read time), by the
provider's `tmdb_id` (dropped if its year is off by more than 1 or the TMDB
404s) or by normalized title + year with exactly **one** plausible
candidate — no year, zero or several candidates means no enrichment, cached
as "no match". Series episodes now also keep the provider's own `plot`
(FR-028, the user's request) shown for the focused episode — from data
already stored, so moving focus never hits the network; on this provider only
~4–30 % of episodes carry one. `fetchSeriesDetail` returns `{episodes,
info}` from the SAME response the episode loader already made
(`fetchSeriesInfo` keeps its signature), so opening a series is one request,
not two — `ensureTitleMetadata` defers to that loader and
`useSeriesEpisodes` re-reads metadata when it lands. **The constitution was
amended to 1.6.0**: a key the person typed on the TV (BYOK — TMDB, later
OpenAI) may live in the device's IndexedDB, with the provider-credential
mitigations (never logged, shown whole, put in a query key, toast or `aria-*`,
or sent to any host but its own service); a developer-owned or shared key
stays forbidden. Settings › **Integrações & BYOK** is real (TMDB card:
state, masked key, capabilities, the attribution TMDB requires,
Configurar/Testar/Editar/Remover, plus "Em breve" cards for AI/weather/speed
test reusing the dock mocks), `TmdbKeyScreen` types the key through the TV's
IME with an always-empty field, and the Home dock's TMDB icon shows the real
state (name + `data-state`, never colour alone) and opens that card. The mocks
`settings-integrations` and `dock-tmdb` are gone. Failures (401/429/offline)
update the TMDB state shown in Integrações/dock without a toast per detail and
are never cached or retried in a loop; a 429 pauses calls for 10 min; removing
the key drops the TMDB half of the cache **and the in-memory query cache**
(invalidating alone flashed the stale TMDB synopsis on the next open — a real
bug the E2E found). Real-panel measurement (`e2e/metadata-tmdb-real.mjs`):
synopsis+backdrop on 90 % of all 9 663 series and 87–93 % of sampled movies
(SC-001 met). 5/5 contract tests locked, `tsc`/lint clean, the new
`e2e/metadata-tmdb.mjs` (part of `test:e2e`, 3/3 green runs) covers the whole
flow in Chromium. **Verified on the physical TV** (QN50Q60DAGXZD, 2026-09-29,
seen by the user): CORS of `api.themoviedb.org` from the WebView, typing the
key with the TV's IME, and the backdrop not painting over the AVPlay plane.
SC-003 was measured with a real key (`e2e/metadata-tmdb-real-match.mjs`): 80
movies matched by title + year without the `tmdb_id`, 74 right / 0 wrong /
6 no match against the provider's own id as ground truth. After the physical
pass the user asked for the **Elenco tab** to stop saying "Em breve": it is now
a real tab listing the cast names as text (provider, or TMDB where the
provider was silent; an honest empty message otherwise — ad-hoc T044, R-012;
the `cast` mock is gone). Out of scope and still mocks: Semelhantes and
navigable actor pages (item 45), Trailer (32), any rating (29), TMDB per
episode. See
`sdd/specs/032-metadata-tmdb-integracoes/plan.md` → `## Estado Atual` and
`## Riscos e Decisões`.

**Code-complete**: `033-trailers-filmes-series` — backlog item 32: the detail
screens' "▶ Trailer" button is real (the `trailer` mock is gone from
`comingSoon.ts`; the Início hero keeps its own `home-trailer` mock, out of
scope). Candidates come from data feature 032 already fetches when a detail
opens — no new request, never on focus: the provider's `youtube_trailer`
(`get_vod_info` / `get_series_info.info`) first, then the TMDB `videos`
(`append_to_response=credits,videos` with `include_video_language=pt,en,null`,
without which TMDB only returns pt-BR videos). Only a valid 11-character id
counts (`isYoutubeVideoId`); a teaser never becomes "Trailer"; a `matched`
TMDB record saved before this feature is re-asked once, and provider metadata
saved with an older `PROVIDER_FIELDS_VERSION` counts as expired.
`TrailerLayer` (`components/`, generic — knows no catalog, no user state, no
AVPlay) is a full-screen layer that loads **ADR-012's bridge page**
(`bridge/trailer/index.html`, served by GitHub Pages from the repo's `bridge/`
folder via `.github/workflows/bridge-pages.yml`) in an `<iframe>`; the app
**never** loads YouTube directly (`file://` sends no `Referer`, so YouTube
answers error 153 — proven on the TV, and hidden on a PC browser). Only the
video id travels in the bridge URL; app ↔ bridge is a validated `postMessage`
protocol v1 (`lib/trailer/bridgeConfig.ts`: origin **and** the current
iframe's window), and a pure state machine (`lib/trailer/trailerSession.ts`)
decides loading/playing/paused/error, the 15 s start limit, the single swap to
the reserve candidate (only 100/101/150/2; 153 never swaps) and the error
codes. `PlayerLayer`'s lessons apply: session state read through a ref, a seek
that arrives while one is pending is discarded, never queued. Two real bugs
only the E2E showed: React StrictMode's dev-only mount/unmount/remount made an
unmount cleanup mark the layer "closed" for good (the end of the video stopped
closing it), and the `stop` sent on unmount needs a `useLayoutEffect` because
React detaches the iframe ref before passive cleanups. A third, pre-existing
bug surfaced through the same E2E and was fixed with the user's approval
(ad-hoc T043, R-011): `ensureCategory` judged freshness by the category
snapshot the screen holds (never re-read after a fetch, so no
`itemsFetchedAt`), so coming back from a detail screen to the grid re-called
`get_vod_streams` and swapped the channel ids under the cards — it now trusts
the persisted `itemsFetchedAt`. 5/5 contract tests
locked (C1 amended with the user's approval: the example "invalid id"
`nao-e-um-id` has 11 characters — R-009), unit + component tests, and
`e2e/trailers.mjs` (part of `test:e2e`) serves the REAL bridge from disk under
the production URL with a fake YouTube player. Measured on the real panel
(`e2e/trailers-real.mjs`, counts only): the provider carries `youtube_trailer`
for 12/60 sampled series and 8/60 sampled movies; the TMDB share is not
measured (no `CCPLAY_PROBE_TMDB_KEY` in `.env`). **The gate still open is the
physical TV** (SC-001: ≥ 9/10 trailers start within 15 s; SC-002: 10/10 RETURN
closes with focus back and no leftover audio). The bridge is **published**
(2026-09-29, with the user's confirmation): `main` carries only `bridge/` +
`bridge-pages.yml` (the generic `static.yml`, which published the whole repo and
raced the same Pages deploy, was removed there), and the URL answers 200 with
the real official player mounted under `https://johnosd.github.io`.
Also pending, not gates: ads/autoplay behavior (R-005/R-008) and the TV
actually reporting Tizen 9.0 / Chromium 120 (measured by the spike; the build
stays `chrome108`, which is safe). See
`sdd/specs/033-trailers-filmes-series/plan.md` → `## Estado Atual` and
`## Riscos e Decisões`.

The four top-level directories:

- **`tv-web/`** — React 19 + TypeScript + Vite. Splash, the "Quem está
  assistindo?" profile screen (one card per IPTV list plus "Adicionar
  lista", ADR-011 §2), the Add-list form, the Início (hub content under a
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
  became its third consumer in feature 012) — any screen that mounts it
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

`.planning/memory/constitution.md` (v1.6.0) holds 13 non-negotiable
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
  (sequenced by dependency, phases 0–6 plus `A avaliar` and process items),
  `## Features`, `## Bugs`, `## Melhorias Ad-hoc`. **The status/progress
  columns are maintained by the PowerShell scripts — don't hand-edit them.**
  The idea list above them is hand-maintained prose.
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
