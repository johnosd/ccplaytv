# 04 — Reuso de Skills e Processos

Escopo: o que os skills de repositório do IPTVnator ensinam de **padrão de
processo** para o CCPlay — estrutura de `SKILL.md`, gates de validação e
convenções de "documentação viva". Não se trata de copiar o conteúdo dos
skills (são Angular/Nx-específicos), mas do formato e da disciplina que eles
impõem, em contraste com o sistema SDD que o CCPlay já tem.

## Tabela-resumo

| # | Item | Prioridade |
| --- | --- | --- |
| 1 | Formato canônico de skill: frontmatter de gatilho + "Read First" + "Validation" | P1 |
| 2 | Skills apontam para um doc de arquitetura canônico (não duplicam conteúdo) | P1 |
| 3 | Gates de validação explícitos por área (mapa de comandos) | P1 |
| 4 | "Dívida de migração, não precedente" como rótulo anti-drift | P2 |
| 5 | Regra de tamanho máximo de arquivo + baseline que só encolhe | P2 |
| 6 | Skill de bugfix/release com veredito nunca inflado | P2 |

---

## 1. Formato canônico de skill: frontmatter de gatilho + "Read First" + "Validation"

- **O que é:** todo skill tem (a) frontmatter com `name` e `description`
  começando por "Use when..." (gatilho apenas, sem duplicar o conteúdo), (b)
  uma seção "Read First"/"Inspect First" apontando para a doc canônica, (c)
  seções de Ownership e (d) uma seção "Validation" com comandos concretos.
- **Onde está no IPTVnator:** `.codex/skills/iptvnator-ui-design/SKILL.md`,
  `iptvnator-nx-architecture/SKILL.md`,
  `iptvnator-sqlite-db-worker/SKILL.md`, `xtream-electron/SKILL.md`,
  `stalker-portal/SKILL.md`. Regra "frontmatter descriptions are trigger-only
  and begin with `Use when`" em `AGENTS.md`.
- **Por que reutilizar:** o CCPlay tem 8 skills SDD em `.gemini/skills/`
  (e espelhos em `.claude/skills/`) com um padrão diferente — eles são
  **procedimentos completos** (o fluxo inteiro do `sdd-specify`, por exemplo).
  O padrão do IPTVnator é complementar: skills de **domínio** curtos que
  apontam para docs canônicos e dizem **como validar**. O CCPlay ainda não tem
  skills de domínio (ex.: "quando mexer no player AVPlay", "quando mexer no
  importer").
- **Como adaptar/melhorar:** criar skills de domínio curtos no CCPlay
  (`player-avplay`, `importer-m3u`, `navegacao-dpad`) seguindo o formato:
  frontmatter de gatilho + "Read First" → doc canônico + "Validation" → testes
  do projeto. Limitar a ~500 palavras (regra do IPTVnator) para não virar
  duplicata da documentação.
- **Prioridade: P1** — útil assim que houver mais de uma área de código.

---

## 2. Skills apontam para um doc de arquitetura canônico (não duplicam conteúdo)

- **O que é:** o skill não reescreve a política; ele cita o doc canônico e só
  adiciona "o que fazer agora" + "como validar".
- **Onde está no IPTVnator:** `iptvnator-ui-design/SKILL.md`
  ("Inspect First → Policy: `docs/architecture/iptvnator-ui-guidelines.md`") e
  `xtream-electron/SKILL.md` ("Read First → 4 docs"). Os docs são "canonical
  even when drafted by an LLM".
- **Por que reutilizar:** o CCPlay tem o mesmo valor: as ADRs e o
  `.planning/README.md` são a fonte canônica; um skill de domínio que duplica
  a política cria drift. O `sdd-*` do CCPlay já segue isso (cada SKILL.md é a
  spec do procedimento, e os scripts são a execução).
- **Como adaptar/melhorar:** ao criar skills de domínio, cada seção de
  política deve apontar para a ADR/README correspondente, nunca reescrevê-la.
- **Prioridade: P1** — evita o drift que o próprio IPTVnator combate.

---

## 3. Gates de validação explícitos por área (mapa de comandos)

- **O que é:** um documento único mapeia cada área de código para o comando de
  validação mais barato (unit/lint/e2e) antes de rodar a suíte inteira.
- **Onde está no IPTVnator:** `docs/architecture/validation-map.md`
  ("Unit And Type Checks", "Lint", "E2E", "Coverage Tiers") e a seção
  "Validation" de cada skill (`pnpm nx test shared-interfaces` etc.).
- **Por que reutilizar:** o CCPlay tem pytest (backend) e Vitest/Playwright
  (frontend), mas ainda não tem um mapa de "qual comando para qual área". O
  IPTVnator mostra o valor: o menor comando que valida a mudança, antes do
  run completo.
- **Como adaptar/melhorar:** criar um `validation-map` (ou seção no
  `.planning/README.md`) com `pytest api/tests/test_importer...`, `ruff`,
  `vitest`, etc., por área (importação, classificador, navegação, player).
- **Prioridade: P1** — barato e reduz atrito diário.

---

## 4. "Dívida de migração, não precedente" como rótulo anti-drift

- **O que é:** quando um padrão antigo contradiz o padrão novo, os docs rotulam
  o antigo como "migration debt, not precedent" — a nova regra é a única
  referência, e o antigo é listado explicitamente como não-imitar.
- **Onde está no IPTVnator:** `xtream-electron/SKILL.md`
  ("A generic `window.electron` check is not the capability contract; existing
  ... branches that still use one are migration debt") e
  `iptvnator-ui-guidelines.md` ("Treat those references as migration debt,
  not patterns to copy").
- **Por que reutilizar:** o CCPlay está no início e pode evitar acumular esse
  tipo de dívida. Quando uma decisão mudar (ex.: trocar `m3u-ipytv`), rotular
  o padrão antigo evita que o código novo copie o errado.
- **Como adaptar/melhorar:** adotar o vocabulário nas ADRs do CCPlay: quando
  uma ADR substituir outra, escrever explicitamente "o padrão antigo é dívida
  de migração, não precedente".
- **Prioridade: P2** — útil a médio prazo.

---

## 5. Regra de tamanho máximo de arquivo + baseline que só encolhe

- **O que é:** limite de linhas por arquivo (produção 300–400, testes 1200),
  com baseline de arquivos pré-existentes que só pode encolher; novo arquivo
  grande usa `eslint-disable` justificado em vez de entrar na baseline.
- **Onde está no IPTVnator:** `AGENTS.md` ("ESLint enforces `max-lines`"),
  `tools/eslint/max-lines-config.mjs` e skill `iptvnator-nx-architecture`
  ("Validate the Change").
- **Por que reutilizar:** o backend do CCPlay já tem arquivos coesos
  (`m3u_parser.py`, `classifier.py`, `ssrf_guard.py`). A regra formaliza o
  que já é prática e evita que o `App.tsx` (hoje navegação centralizada)
  cresça sem limite.
- **Como adaptar/melhorar:** no CCPlay, adotar um limite soft (ex.: 300 linhas
  para arquivos React/TS, 400 para Python) via ruff/eslint config, sem
  baseline inicial — começar limpo é mais simples que o IPTVnator, que herdou
  uma base grande.
- **Prioridade: P2** — higiene de código a longo prazo.

---

## 6. Skill de bugfix/release com veredito nunca inflado

- **O que é:** fluxos de bug (assess→fix→test) e de release com regras de
  honestidade de veredito (nunca marcar "verified" sem reexecutar a
  reprodução) e gates de changelog/release notes.
- **Onde está no IPTVnator:** `.codex/skills/release-cut/SKILL.md` e
  `release-notes/SKILL.md` (mais o "Release note gate" em CI). No CCPlay o
  equivalente já existe e é mais maduro: `sdd-bugfix` (assess→fix→test) e o
  sistema de backlog com veredito honesto.
- **Por que reutilizar:** o CCPlay **já tem** essa disciplina melhor que o
  IPTVnator (veredito `go`/`kill`/`needs-clarification`, bugfix com
  reexecução obrigatória). Não há o que copiar — só reconhecer que o padrão
  é convergente.
- **Como adaptar/melhorar:** nada a fazer agora; quando o CCPlay tiver
  releases públicas, considerar um gate de "release note" no estilo do
  IPTVnator (`.changes/` + CI) como evolução.
- **Prioridade: P2** — para quando houver distribuição pública.
