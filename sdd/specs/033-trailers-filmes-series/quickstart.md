# Quickstart: verificação da feature 033 (trailers)

## Pré-requisitos

- `tv-web/`: `npm install` feito; dev server com `npm run dev` para E2E.
- Para cenários com dados reais: `.env` da raiz com `CCPLAY_PROBE_*` (nunca
  imprimir os valores) e uma chave TMDB configurada em Integrações.
- Para a TV (gate): página-ponte **publicada** em
  `https://johnosd.github.io/ccplaytv/trailer/` (Pages habilitado pelo usuário —
  `logic/pagina-ponte.md` §6) e a TV acessível pelo skill `tizen-tv`.

## Checagens automatizadas

```powershell
cd tv-web
npx vitest run src/lib/trailer src/lib/metadata/titleMetadata.trailers.contract.test.ts src/components/TrailerLayer.trailers.contract.test.tsx src/features/movies/MovieDetailScreen.trailers.contract.test.tsx
cd ..; .\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 033-trailers-filmes-series
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 032-metadata-tmdb-integracoes
cd tv-web
npx tsc -b; npm run lint; npx vitest run; npm run build:tizen
node e2e/trailers.mjs          # com npm run dev rodando
npm run test:e2e               # todos
```

`npm run build:tizen` deve continuar sem arquivo novo emitido (o trailer é
código do bundle; a ponte fica fora do `.wgt`).

## Cenários no navegador (dev server)

A — **Série com trailer do provedor, sem chave TMDB** (US1): abrir o detalhe →
"Trailer…" e depois "▶ Trailer" → OK → camada com "Carregando trailer" e
"Cancelar" focado → vídeo toca → RETURN → foco no "▶ Trailer"; "Continuar
assistindo"/histórico/assistido inalterados.

B — **Filme sem trailer, sem chave** (US1/US2): "Trailer — indisponível" → OK →
toast com "configure o TMDB em Integrações".

C — **Filme com chave TMDB** (US2): rótulo segue `logic/candidatos-de-trailer.md`
(ex.: "▶ Trailer · Inglês" quando só há inglês).

D — **Controles** (US3): OK pausa (faixa com "▶ Continuar"), OK retoma, → avança,
← volta; segurar → não trava.

E — **Falhas** (US3): sem rede → `TRL-REDE` com "Tentar de novo"/"Voltar";
vídeo bloqueado (no E2E, YT fake manda 150) → tenta o reserva; os dois bloqueados
→ só "Voltar".

F — **Foco nunca dispara consulta** (SC-004): percorrer a grade de Filmes/Séries
com o painel de rede aberto → nenhuma chamada a `api.themoviedb.org` nem à ponte.

## Na TV física — GATE OBRIGATÓRIO (SC-001, SC-002)

Via `tizen-tv` (`deploy-tv.ps1`), com a ponte publicada:

1. 10 títulos diferentes com trailer disponível (séries do provedor + filmes via
   TMDB): contar quantos começam a tocar em até 15 s após o OK (meta ≥ 9/10) e
   anotar erros por código.
2. 10 fechamentos por RETURN: foco volta ao botão, sem áudio remanescente (10/10).
3. Tecla de mídia Play/Pause e ←/→ durante o trailer.
4. Sair do app (Home da TV) com o trailer tocando → ao voltar, camada fechada,
   detalhe com foco no botão.
5. Abrir um filme (AVPlay), sair, abrir o trailer do mesmo filme: sem áudio duplo.
6. Registrar no `plan.md` cenário a cenário: aprovado / reprovado / não testado —
   "não testado" nunca vira "aprovado". Nunca registrar id de título real junto com
   dado da fonte.

## Medição (SC-005, sem meta)

`node e2e/trailers-real.mjs` (fora do `test:e2e`, lê o `.env`, imprime só
contagens): fração de séries e de filmes amostrados com pelo menos um candidato,
separando provedor e TMDB.

## Checklist cross-cutting (constitution)

- [ ] Nenhuma credencial, URL de fonte/stream ou chave em log, toast, erro ou na
      URL da ponte (SC-006) — revisão de segredos antes de commit.
- [ ] Todo estado da camada e do botão com um foco visível e ativável.
- [ ] RETURN fecha a camada antes de sair do detalhe.
- [ ] Ver trailer não altera estado do usuário (SC-003).
- [ ] `CLAUDE.md` e `backlog.md` atualizados no Polish.
