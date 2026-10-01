# Repository Guidelines

## Project Structure & Module Organization

`tv-web/` is the active React, TypeScript, and Vite application. Put screens in `src/features/`, shared UI in `src/components/`, catalog, focus, and playback logic in `src/lib/`, and CSS in `src/styles/`. Keep unit and component tests beside their subjects; browser flows and fixtures live in `tv-web/e2e/`. `CCPlayTv/` is the Tizen packaging project populated by the frontend build. `api/` is a frozen Python/FastAPI fallback for providers that block TV browser CORS, not the normal application path. Product decisions and work status live in `sdd/` and `.planning/backlog.md`; design references live in `docs/design/design-system/`.

## Build, Test, and Development Commands

Run frontend commands from `tv-web/` after `npm install`:

- `npm run dev` starts Vite for local development.
- `npm run test` runs Vitest unit and component tests; `npm run lint` runs Oxlint.
- `npm run build` type-checks and builds; `npm run build:tizen` also syncs output into `CCPlayTv/`.
- `npm run test:e2e` runs the Playwright flow scripts against an already running dev server.

For changes to the fallback API, run `uv sync --locked`, `uv run pytest`, and `uv run ruff check .` from `api/`. Its local server also needs PostgreSQL; see `CLAUDE.md` for setup.

## Coding Style & Naming Conventions

Follow neighboring files: two-space indentation in TypeScript/TSX, four spaces in Python, single quotes and no semicolons in frontend code. Use PascalCase for React components, camelCase for functions and hooks (`useRemoteNav`), and descriptive kebab-case names for E2E scripts. Ruff sets a 100-character Python line length.

## Testing Guidelines

Name colocated frontend tests `*.test.ts(x)` or `*.contract.test.ts(x)`; API tests use `api/tests/test_*.py`. There is no configured coverage percentage. Test the affected behavior, including remote-control focus and SELECT/RETURN paths for TV UI changes. The repository constitution requires passing stack-specific tests per completed task and a Playwright flow before feature completion or TV validation. Browser tests cannot establish AVPlay or hardware behavior; record any required device check in the feature plan.

## Commits & Pull Requests

Recent commits commonly use `feat(025): ...` or `docs(026): ...`, with the numbered SDD feature as scope; follow that pattern when applicable. In a PR, describe the user-visible change, link the relevant `sdd/specs/<number>-<slug>/` or backlog item, list commands run, and attach screenshots for UI changes. Update the spec, tasks, and backlog when their status changes. Review configuration and logs for secrets before committing; never commit real provider credentials or `.env` files.
