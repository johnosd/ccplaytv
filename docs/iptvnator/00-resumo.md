# 00 — Resumo Executivo: o que reutilizar do IPTVnator

Consolidação dos 5 relatórios. Aqui estão os itens de maior valor para o
CCPlay TV, organizados por área priorizada e por fase de adoção (MVP / pós-MVP
/ futuro), alinhados ao `.planning/backlog.md`.

> Legenda de prioridade: **P0** = adotar agora (MVP), **P1** = pós-MVP,
> **P2** = futuro.

## Top itens por área

### EPG / XMLTV / guia de programação
- **Bulk por fonte + preview sob demanda** — carregar a janela inteira uma vez
  e usar consulta curta só como fallback. Padrão do Stalker EPG do IPTVnator,
  aplicável ao XMLTV do CCPlay (item 23 do backlog). **[P1]** → `03-apis.md` #10
- **Mapeamento de campos e normalização** de "tempo" para início/fim. **[P1]**
- **Offset de exibição** (`epgDisplayTimeMs` × `epgProviderClockMs`): separar
  "deslocar o programa" de "deslocar o agora". **[P2]** (não detalhado nos
  relatórios; registrado para quando EPG existir)

### Xtream Codes (provedor por credenciais)
- **Normalização de URL de servidor** — `normalize_xtream_server_url()`.
  **[P0]** → `03-apis.md` #3
- **Status de conta com fallback de actions** (`get_account_info` → sem action
  → `get_profile`). **[P0]** → `03-apis.md` #4
- **User-Agent VLC para WAF** — já parcialmente no CCPlay, completar cobertura.
  **[P0]** → `03-apis.md` #5
- **`allowed_output_formats`** para construir URL de stream por formato.
  **[P0]** → `03-apis.md` #6
- **Expiração de conta** (`exp_date`). **[P1]** → `03-apis.md` #7
- **Catch-up: variantes + probe TS/HLS** — quando o item 24 for aprovado.
  **[P1]** → `03-apis.md` #8

### TMDB / enriquecimento de metadados
- **Match confidence conservador** (id do provedor é dica; 404 → busca por
  título). **[P1]** → `03-apis.md` #11
- **Merge por campo, provider autoritativo.** **[P1]** → `03-apis.md` #12
- **Fallback de idioma original** para títulos não-latinos. **[P1]** →
  `03-apis.md` #13
- **Retenção de cache conforme ToS (6 meses).** **[P2]** → `03-apis.md` #14
- **Roadmap TMDB** como backlog do que não vamos construir. **[P1]** →
  `05-documentos.md` #5

### Player e reprodução (AVPlay)
- **Abstração engine-neutra** (capabilities/state/commands) — contrato menor e
  mais preciso para AVPlay. **[P0]** → `02-arquitetura.md` #1
- **Identidade lógica de reprodução independente da URL.** **[P0]** →
  `02-arquitetura.md` #2
- **Diagnóstico + ações ranqueadas de recuperação.** **[P1]** →
  `02-arquitetura.md` #6

### Remote control + voz
- O IPTVnator confirma o modelo de comandos compartilhados que o CCPlay já
  definiu na ADR-001 §5 (`playItem`/`pause`/`seek`/`search` + WebSocket
  autenticado + pareamento explícito na TV). Sem item novo de código — é
  convergência de decisão. **[P2]**

### UI/UX e navegação por foco remoto
- **Foco direcional 2D gerenciado por tela** (matemática de grade pura e
  testável). **[P0]** → `01-ui-ux.md` #1
- **Virtualização com identidade estável + foco explícito.** **[P0]** →
  `01-ui-ux.md` #2
- **Linguagem visual única de seleção via tokens.** **[P0]** → `01-ui-ux.md` #3
- **Restaurar foco/posição ao voltar.** **[P0]** → `01-ui-ux.md` #7
- **Um dono de scroll por painel.** **[P1]** → `01-ui-ux.md` #4
- **Dashboard em rails + estados por superfície.** **[P1]** → `01-ui-ux.md` #5, #6
- **Rótulo de escopo global × local.** **[P2]** → `01-ui-ux.md` #8

### Skills e processos (SDD)
- **Formato canônico de skill de domínio** (gatilho + Read First + Validation).
  **[P1]** → `04-skills.md` #1
- **Skills apontam para doc canônico.** **[P1]** → `04-skills.md` #2
- **Mapa de validação por área.** **[P1]** → `04-skills.md` #3
- **"Dívida de migração, não precedente"** e **limite de tamanho de arquivo.**
  **[P2]** → `04-skills.md` #4, #5

## Plano de adoção sugerido

### Fase MVP (agora) — os P0
1. **Player:** formalizar `PlayerController` (capabilities/state/commands) com
   `AvPlayAdapter` + identidade lógica de reprodução (itens 1 e 2 de
   `02-arquitetura.md`).
2. **Provedor Xtream:** normalizar URL, resolver status com fallback de
   actions, aplicar User-Agent VLC em todas as chamadas e construir URL por
   `allowed_output_formats` (`03-apis.md` #3–6).
3. **Navegação:** manter `useRemoteNav`/`gridNextIndex` puros e testados;
   adotar tokens globais de seleção/foco; restaurar foco ao voltar
   (`01-ui-ux.md` #1–3, #7).
4. **Segurança:** consolidar redação de credenciais num helper único
   (`03-apis.md` #16) e manter a política SSRF por hop (#15).

### Fase pós-MVP — os P1
5. **Trabalho pesado:** mover importação de `BackgroundTasks` para worker
   durável com `operationId` (`02-arquitetura.md` #3, #5).
6. **TMDB:** match confidence conservador + merge por campo + fallback de
   idioma, já nascendo com os fixes A1/A2 (`03-apis.md` #11–13).
7. **EPG/XMLTV:** bulk por fonte + preview sob demanda (`03-apis.md` #10).
8. **Dashboard em rails** e **estados por superfície** (`01-ui-ux.md` #5, #6).
9. **Skills de domínio** + **mapa de validação** (`04-skills.md` #1–3).
10. **Docs de arquitetura por subsistema** (`05-documentos.md` #1, #2, #4).

### Fase futura — os P2
11. Stalker (modo por comportamento + EPG), catch-up, IMDb, benchmarks de
    importação, roadmap TMDB, higiene de código (limites de arquivo), releases.

## Observação de segurança (não bloqueia os relatórios)

Os relatórios não reproduzem credenciais. Há credenciais reais de provedor em
texto puro em `ccplayTv/docs/m3u/dados.md` (usuário, senha e URLs com senha na
query string). Recomenda-se **removê-las do repositório** e substituir por
placeholders ou mover para um arquivo fora do controle de versão — item a
tratar à parte, fora do escopo destes relatórios.
