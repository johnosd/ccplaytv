# Quickstart — 090 legendas externas

Verificação manual e automatizada. Ordem: A (automático) → B (navegador) → C (TV física, gate G-2). Os gates G-1
(cota/condições) e G-4 (BYOK) são decisões externas e não são validados aqui.

## Pré-requisitos

- Constitution emendada (T001) — sem ela nada que chame o serviço existe.
- `tv-web/`: `npm install`; `api/`: `uv sync --locked`.
- Chaves de **desenvolvimento**: no `.env` da raiz como `OPEN_SUBTITLES_API_KEY` e `SUBDL_SUBTITLES_API_KEY`. Para o
  serviço local, exporte-as como `CCPLAY_PORTAL_OPENSUBTITLES_API_KEY` e `CCPLAY_PORTAL_SUBDL_API_KEY` no processo da
  API **sem imprimir os valores** (nunca `echo`, nunca em log, nunca em arquivo versionado). Os testes automatizados
  **não** usam as chaves reais (fixtures sintéticas da T014c). O plano gratuito do SubDL tem cota diária pequena por
  chave (~50 downloads, R-013): não gaste em teste manual repetido.
- Testes do serviço que tocam Firestore: emulador + `PORTAL_TEST_FIRESTORE=1` (ver `docs/portal/operacao.md`).

## A. Automático

```powershell
# Contratos travados (5/5 verdes) e integridade da trava
cd tv-web; npx vitest run src/components/PlayerLayer.legendas-externas.contract.test.tsx src/lib/subtitles
cd ..; .\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 090-legendas-externas
# Travas de outras features que esta toca (player 029/041/042, portal 071/077, orçamento 082)
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 029-audio-legendas-info-player

# Frontend
cd tv-web; npx vitest run src/lib/subtitles src/components src/lib/portal src/lib/catalog
npm run lint; npm run build

# Backend
cd ..\api; uv run pytest tests/portal/test_subtitles.py; uv run ruff check .

# E2E (com `npm run dev` rodando em outro terminal)
cd ..\tv-web; node e2e/run.mjs --only legendas-externas,audio-legendas-info,legibilidade-tv
```

## B. Navegador (dev server)

O `<video>` do desktop não tem API de faixas: é o caso em que "Áudio e legendas" só existe por causa da legenda
externa. Rode o E2E `legendas-externas` (serviço simulado por `context.route`) ou, com a pilha local do portal
(`e2e/lib/portalStack.mjs`) e a chave de desenvolvimento, faça à mão:

| # | Passo | Esperado | Origem |
| --- | --- | --- | --- |
| B1 | Abrir um filme e tocar; observar a aba Network | Nenhuma requisição `/device/subtitles/*` | FR-002, SC-002 |
| B2 | `→ →` até "Áudio e legendas" → OK → descer até "Buscar legenda online" → OK | Diálogo com "Buscando…" focável, depois resultados em pt-BR | US1/AC1 |
| B3 | `→` no idioma, OK em "Inglês" | Nova busca em `en`; foco no primeiro resultado ou no vazio | US1/AC2 |
| B4 | OK num resultado | Volta ao painel com "Externa — Português (Brasil)" marcado; a fala aparece no tempo | US1/AC3 |
| B5 | Pausar, avançar 30 s, retroceder 30 s | Sem fala residual depois do salto | US1/AC4, SC-004 |
| B5b | Na linha "Sincronização", ← ×4 e → ×24; depois OK | −2,0 s; para em +10,0 s (não passa); OK volta a "Sem atraso"; a fala acompanha a cada tecla; vídeo não pausa | US1/AC7, FR-008, SC-010 |
| B6 | "Desativadas" | Legenda some; reabrir o painel mostra "Externa…" desmarcada | US1/AC5 |
| B6b | OK em "Externa — Português (Brasil)" | Legenda volta na hora, com o ajuste que tinha; nenhuma requisição | US1/AC8 |
| B6c | Filme em inglês com pt-BR ativa: "Buscar legenda online" → idioma Inglês → OK num resultado; depois OK em "Externa — Português (Brasil)" | Duas linhas "Externa…", uma marcada por vez; a volta ao português não faz requisição | US1/AC9, R-011 |
| B7 | Fechar e reabrir o mesmo filme | Legenda volta sozinha, sem requisição | US2/AC1, SC-003 |
| B8 | Série sem chave TMDB: episódio → buscar | Aviso "Busca por nome — confira a sincronia" | US1/AC6 |
| B9 | Próximo episódio | Atalho "Buscar legenda (pt-BR)", nenhuma requisição até OK | US2/AC3, FR-003 |
| B10 | Desligar a rede → buscar | Erro com "Tentar de novo" focado; o vídeo segue | FR-015, SC-006 |
| B11 | Remover a lista | `externalSubtitles` sem linhas dessa fonte (DevTools → IndexedDB) | FR-021 |
| B12 | Inspecionar corpo das requisições de legenda | Só `language`/IDs/`query`/`year`/`season`/`episode`/`id`/`providers` — nada de host, usuário, senha, URL; respostas sem URL de fornecedor nem `api_key` | FR-017, FR-012, SC-005, R-012 |
| B12b | Buscar um filme com os dois fornecedores ligados | Lista única: OpenSubtitles (com downloads) e depois SubDL, cada um com o nome do fornecedor | FR-026, US1/AC1 |
| B12c | Desligar a chave do SubDL no serviço (ou simular erro) e buscar | Resultados do OpenSubtitles + aviso "SubDL indisponível agora"; não é tela de erro | FR-026 |
| B12d | Episódio cuja busca no SubDL traga pacote de temporada → escolher o pacote | Marca "Temporada inteira"; a fala do episódio certo aparece | FR-027 |
| B13 | Integrações → Legendas → SubDL → Adicionar chave (a de desenvolvimento, digitada pelo IME) | Testada antes de guardar; estado "Sua chave — válida"; campo oculto | US3/AC2 |
| B14 | Com a chave pessoal do SubDL e o serviço do portal parado, buscar | Resultados do SubDL direto da TV; OpenSubtitles aparece em "indisponível agora" | US3/AC1 |
| B15 | Trocar a chave por uma inválida e buscar | Aviso na linha do SubDL e ação "Usar o padrão do ccplayTv"; nada troca sozinho | US3/AC3 |
| B16 | Remover a chave | Volta a "Padrão do ccplayTv"; a chave some do IndexedDB (`subtitleCredentials`) | US3/AC4 |

## C. TV física (gate G-2 e SC-009) — pedir autorização antes de instalar (`tizen-tv`)

| # | Passo | Esperado |
| --- | --- | --- |
| C1 | Filme com legenda pt-BR baixada | Fala visível, acentos corretos, acima do chrome quando ele aparece |
| C2 | Pausa / seek ±30 s / retomar depois de sair e voltar | Fala certa na primeira atualização; sem resíduo |
| C3 | Medir com o `PerfOverlay` (`lib/perf/`) 60 s tocando com e sem legenda externa ativa | Thread presa, pior quadro e fps dentro do ruído entre rodadas |
| C4 | Sonda de navegação (`lib/perf/autopilot.ts`, só `→`/`↓` — regra da 089) antes e depois da feature, mesmas condições | Diferença dentro do ruído; registrar em `evidencias/` |
| C5 | Tempo até começar a tocar um filme, antes/depois | Sem aumento além do ruído |
| C6 | Escolher legenda e reproduzir 10 min | Sem travada perceptível ao trocar de fala; memória estável |
| C7 | Alternar pt-BR ↔ en já guardadas, 10 vezes | Cada troca ≤ 100 ms (leitura + descompressão + parse); acima disso, aplicar o descarte do R-011 |

Registrar os números em `sdd/specs/090-legendas-externas/evidencias/` (como a 088). Diferença acima do ruído
**reprova** o G-2.

## Checklist cross-cutting (constitution)

- [ ] Nenhuma chave padrão no pacote (`rg -i opensubtitles CCPlayTv/` e no `dist/` só podem achar código, nunca uma chave), em variável `VITE_*`, em resposta ou em log.
- [ ] Revisão de segredos antes de commit (toca `.env`/configuração do serviço).
- [ ] Todo estado do diálogo tem foco; RETURN fecha primeiro o diálogo, depois o painel.
- [ ] Build base (sem `VITE_PORTAL_ORIGIN`): a opção não aparece (nada de "em breve").
- [ ] Textos novos nos três idiomas e no `legibilidade-tv.mjs`.
