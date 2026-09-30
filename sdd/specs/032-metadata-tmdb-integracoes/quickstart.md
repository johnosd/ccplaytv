# Quickstart — 032 Metadata de Filmes e Séries + TMDB (BYOK)

## Pré-requisitos

- `tv-web/`: `npm install` feito; `npm run dev` rodando (Vite em :5173) para E2E e checagem manual.
- `.env` na raiz com `CCPLAY_PROBE_*` (lista real) — só para o roteiro real, nunca impresso.
- Para US2/US3 manual: uma chave TMDB própria (v3 ou token v4). Nunca colar em spec, log, commit ou prompt.

## Checagens automatizadas

```powershell
cd tv-web
npx vitest run src/lib/metadata src/features/movies/MovieDetailScreen.metadata-tmdb.contract.test.tsx   # contrato 5/5
cd ..; .\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 032-metadata-tmdb-integracoes; cd tv-web
npx tsc -b; npm run lint; npx vitest run; npm run build:tizen
npm run test:e2e        # inclui e2e/metadata-tmdb.mjs
node e2e/metadata-tmdb-real.mjs         # fora do test:e2e; lê .env (lista real), imprime só contagens — SC-001
node e2e/metadata-tmdb-real-match.mjs   # fora do test:e2e; lista real + TMDB_API_KEY do .env — SC-003 (precisão do casamento)
```

## Cenários (navegador; ✱ = também na TV física, recomendado)

1. **US1 sem chave** — abrir lista Xtream real → Filmes → categoria → abrir um filme. Hero mostra backdrop e sinopse; ↑ a partir de "Assistir" foca "Ver mais" (se a sinopse > 220 caracteres); OK abre "Sinopse completa"; RETURN fecha com foco em "Ver mais". Aba Detalhes: Gênero, Duração, Direção, País, Elenco. Mesmo em Séries (sem País).
2. **US1 "Assistir" não espera** — com rede lenta (DevTools throttling), abrir detalhe e apertar OK imediatamente: o player abre.
3. **US1 sem dado** — filme de lista M3U avulsa sem chave: detalhe igual ao de antes, sem campos vazios nem texto de preenchimento.
4. **US2 chave** — Configurações › Integrações & BYOK: "Não configurado" + atribuição TMDB + cards "Em breve". Configurar → chave inválida → "Chave recusada", nada salvo; chave válida → "Conectado", chave só mascarada. Testar; Remover (confirma) → "Não configurado". Dock da Home reflete cada estado e OK abre o card.
5. **US3 lacunas** — com chave: filme M3U "Título (Ano)" único no TMDB ganha sinopse/backdrop com "Dados: TMDB"; título ambíguo continua sem. Reabrir sem rede: dados do cache.
5b. **Aba Elenco e sinopse do episódio** — filme ou série → aba **Elenco** → OK: lista dos nomes (sem "Em breve"); título sem elenco informado → "O elenco deste título não foi informado."; "Semelhantes" segue "Em breve". Em série, aba Episódios: focar um episódio mostra a sinopse dele quando o provedor a mandou (~4–30 % dos episódios na lista real), sem requisição ao mover o foco.
5c. **Selo do backdrop** — título cujo backdrop veio do TMDB mostra "Dados: TMDB" no canto do hero; o do provedor, não.
6. ✱ **Backdrop × plano de vídeo** — na TV, abrir filme com backdrop e dar play: o vídeo aparece (backdrop não pinta por cima do AVPlay), fechar o player devolve o hero.
7. ✱ **IME** — digitar a chave com o teclado da TV (32 caracteres), "Mostrar" temporário, "Salvar e testar".

## Itens cross-cutting da constitution

- [ ] Foco visível e ativável por OK em todo estado novo (Integrações, TmdbKeyScreen, "Ver mais", modal, aba Elenco).
- [ ] RETURN fecha o modal antes de sair do detalhe.
- [ ] Nenhuma requisição de metadata disparada por foco (Network do DevTools ao navegar a grade).
- [ ] Chave nunca inteira em tela, console, Network para host ≠ `api.themoviedb.org`, nem em `localStorage`.
- [ ] Categoria da fonte continua a categoria exibida (gênero só como fato adicional).
- [ ] Revisão de segredos antes do commit (constitution, Fluxo de Desenvolvimento).
