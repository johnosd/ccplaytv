# 05 — Reuso de Documentação

Escopo: o que a estrutura e as convenções de documentação do IPTVnator
(`docs/architecture/`, `CLAUDE.md`/`AGENTS.md`) ensinam para a documentação do
CCPlay — que já tem `sdd/adr/`, `.planning/` e `docs/`. Foco em como manter a
documentação viva, canônica e anti-drift, não em copiar conteúdo.

## Tabela-resumo

| # | Item | Prioridade |
| --- | --- | --- |
| 1 | Um doc de arquitetura canônico por subsistema | P1 |
| 2 | Contratos registram o "porquê" e o "como", não só o "o quê" | P1 |
| 3 | Documentação é canônica mesmo quando escrita por LLM | P0 |
| 4 | Documentos anti-drift: `CLAUDE.md`/`AGENTS.md` espelhados | P1 |
| 5 | Roadmap de capacidade como backlog de follow-up | P1 |
| 6 | Registro de veredito honesto ("não entregue", "a avaliar") | P0 |

---

## 1. Um doc de arquitetura canônico por subsistema

- **O que é:** cada subsistema tem **um** documento de arquitetura que é a
  referência única (módulo M3U, portal Xtream, portal Stalker, TMDB, player
  controls, etc.), com "Related docs" cruzando entre eles.
- **Onde está no IPTVnator:** `docs/architecture/` (32 arquivos, cada um com
  seção "Related docs"; ex. `stalker-portal.md` lista 10 docs relacionados).
- **Por que reutilizar:** o CCPlay tem ADRs por decisão (bom), mas ainda não
  tem um lugar para o **contrato corrente** de cada subsistema (importer,
  player, navegação). As ADRs registram decisões; os docs de arquitetura
  registram o estado resultante. São camadas complementares.
- **Como adaptar/melhorar:** criar `docs/architecture/` no CCPlay com um doc
  por subsistema conforme ele nascer (importer-m3u, player-avplay,
  navegacao-dpad, cache-offline), começando só quando houver código. Manter o
  cabeçalho "Related docs" cruzando ADRs e specs.
- **Prioridade: P1** — quando os subsistemas do MVP ganharem corpo.

---

## 2. Contratos registram o "porquê" e o "como", não só o "o quê"

- **O que é:** os docs do IPTVnator registram o **racional** de decisões
  sutis (ex.: por que `URL.origin` e não `URL.host` na chave do circuit
  breaker; por que TS antes de HLS no catch-up), com o número da issue quando
  existe.
- **Onde está no IPTVnator:** `docs/architecture/host-connectivity-guard.md`
  e `xtream-portal-compatibility.md` (decisões com "issue #..."). O CCPlay já
  faz isso muito bem nas ADRs (alternativas rejeitadas com motivo concreto).
- **Por que reutilizar:** contratos sem racional levam a futuros
  "simplificações" que reintroduzem o bug. O CCPlay já tem a cultura nas ADRs;
  estendê-la aos docs de subsistema fecha o ciclo.
- **Como adaptar/melhorar:** ao escrever docs de arquitetura, registrar o
  porquê de cada regra não-óbvia (linkando à ADR ou à spec que a motivou).
- **Prioridade: P1** — reforça uma prática que o CCPlay já tem.

---

## 3. Documentação é canônica mesmo quando escrita por LLM

- **O que é:** política explícita de que docs de repositório são canônicos
  "mesmo quando originalmente rascunhados por um LLM" — eles são mantidos e
  atualizados como qualquer artefato de código.
- **Onde está no IPTVnator:** `AGENTS.md` ("Repo docs are canonical even when
  they were originally drafted by an LLM") e a seção "Documentation After
  Changes".
- **Por que reutilizar:** o CCPlay é um projeto dirigido por SDD assistido por
  IA. Essa regra evita que a documentação seja tratada como "rascunho
  descartável" e garante que ela acompanhe o código.
- **Como adaptar/melhorar:** adotar a mesma frase na `CLAUDE.md` do CCPlay ou
  no `.planning/README.md`, e tornar o `sdd-converge` (que já atualiza o
  README) responsável por manter os docs de subsistema em dia.
- **Prioridade: P0** — alinha o processo SDD existente com a manutenção da doc.

---

## 4. Documentos anti-drift: `CLAUDE.md`/`AGENTS.md` espelhados

- **O que é:** dois arquivos de instruções para agentes mantidos em espelho
  (seções de processo idênticas), com regra explícita de não deixar caminhos
  ou rotas desatualizados ("a stale path poisons every future agent session").
- **Onde está no IPTVnator:** `CLAUDE.md` e `AGENTS.md` (seções espelhadas:
  Plan Mode, Documentation After Changes, etc.).
- **Por que reutilizar:** o CCPlay tem `CLAUDE.md` + skills em `.gemini/` e
  `.claude/` que precisam permanecer coerentes. A regra de espelhamento e o
  aviso contra drift são diretamente aplicáveis.
- **Como adaptar/melhorar:** manter `CLAUDE.md` e o `.planning/README.md` (ou
  um futuro `AGENTS.md`) espelhados nas seções de processo; quando mover um
  arquivo, atualizar todos os apontadores na mesma tarefa.
- **Prioridade: P1** — reduz o risco de instruções conflitantes.

---

## 5. Roadmap de capacidade como backlog de follow-up

- **O que é:** um doc de roadmap que lista o que a API/subsistema ainda
  oferece e não é usado, com custo estimado, e o que é **deliberadamente não
  construído** — separando "defeitos" de "features".
- **Onde está no IPTVnator:** `docs/architecture/tmdb-roadmap.md` (produzido
  por auditoria multi-agente, com defeitos A1/A2/F1 em destaque e top-8
  ranqueado).
- **Por que reutilizar:** o CCPlay tem `.planning/backlog.md` ("Ideias
  Futuras" e "A avaliar"), que cumpre papel parecido para features. Um
  roadmap por subsistema (ex.: "o que o TMDB ainda pode dar ao CCPlay") evita
  que capacidade disponível fique invisível.
- **Como adaptar/melhorar:** quando o enriquecimento TMDB do CCPlay existir,
  manter um `tmdb-roadmap.md` equivalente, com a mesma honestidade
  (o que não vamos construir e por quê).
- **Prioridade: P1** — para quando TMDB entrar (pós-MVP).

---

## 6. Registro de veredito honesto ("não entregue", "a avaliar")

- **O que é:** a documentação distingue explicitamente o que está
  implementado do que é planejado/avaliando, sem inflar status — "funcionalidades
  planejadas não são apresentadas como entregues".
- **Onde está no IPTVnator:** os docs marcam status com precisão ("Current
  status", "deliberately will not build"). O CCPlay já é exemplar nisso:
  `README.md` ("nenhuma entregue ainda"), ADRs com "proposta técnica", e o
  `backlog.md` com "A avaliar".
- **Por que reutilizar:** é uma convergência, não uma cópia. O CCPlay já
  aplica; o IPTVnator confirma que é a prática correta para projetos assistidos
  por IA.
- **Como adaptar/melhorar:** manter a disciplina atual nas ADRs e specs; nada
  novo a adotar.
- **Prioridade: P0** — já em vigor; preservar.
