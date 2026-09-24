# Quickstart: Favoritos em Canais, Filmes e Séries

Roteiro de verificação da feature `013-favoritos`. Cenários A–C rodam no
navegador; **D é na TV física e é gate obrigatório de SC-001** (plan.md
R-001).

## Pré-requisitos

- `tv-web/` com dependências instaladas (`npm ci`).
- Checagens automatizadas limpas:

```bash
cd tv-web
npm run test
npm run lint
npx tsc -b
```

- Para B/C com fonte de provedor: uma fonte Xtream real já cadastrada no
  aparelho/navegador. **Nunca** copiar credenciais de `docs/m3u/dados.md`
  para comandos, logs ou este arquivo.

## A. Roteiro E2E automatizado (gate da constitution v1.4.0)

```bash
cd tv-web
npm run dev          # terminal 1
npm run test:e2e     # terminal 2 — roda e2e.mjs e e2e/favoritos.mjs
```

`e2e/favoritos.mjs` sobe um servidor HTTP local servindo
`e2e/fixtures/favoritos.m3u` (dados fictícios, com cabeçalho CORS),
adiciona a fonte por URL e cobre:

1. Live TV → categoria → segurar Enter 1 s sobre um canal → aviso
   "Adicionado aos favoritos" e estrela; nenhum player abre.
2. Enter curto no mesmo canal → player abre; Escape fecha.
3. Trilha → "★ Favoritos" no topo → Enter → o canal aparece.
4. Filmes → segurar Enter sobre um filme → estrela, detalhe **não** abre;
   Enter curto → detalhe abre.
5. Séries → idem com uma série.
6. Recarregar a página → estrelas e "Favoritos" iguais (persistência).
7. Desfavoritar tudo em "Favoritos" → estado vazio com botão focado;
   Enter nele devolve o foco à trilha.

Resultado esperado: script termina com código 0.

## B. Manual no navegador — gesto e foco

1. Em cada seção, OK curto × OK demorado sobre 10 itens seguidos: nenhuma
   ação dupla, nenhum toque acidental.
2. Na trilha de categorias, segurar Enter: entra na categoria como OK comum
   (FR-004).
3. Dentro de "Favoritos", desfavoritar o item focado no meio da lista: foco
   vai ao seguinte; no último, ao anterior; no único, ao estado vazio
   (FR-018).
4. Live TV: tocar um canal a partir de "Favoritos", RETURN → foco volta ao
   mesmo canal (FR-019).
5. Uma categoria da fonte chamada "Favoritos" (se houver) coexiste com
   "★ Favoritos" e as duas navegam de forma independente.

## C. Manual — fonte de provedor e fonte M3U grande

1. Provedor: favoritar itens em duas categorias, ressincronizar a fonte,
   **não** abrir as categorias → "Favoritos" mostra a nota de "outros
   favoritos aparecem ao abrir a categoria" (FR-009); abrir uma delas →
   seus favoritos voltam a aparecer (FR-015, SC-003).
2. Medir o tempo de entrar numa categoria sob demanda antes/depois da v9
   (R-004) — anotar em `Execution Notes`.
3. M3U grande: favoritar 5 filmes, entrar em "★ Favoritos" de Filmes;
   medir a espera (R-003) e anotar. O estado de carregamento tem saída
   focável.
4. Remover a fonte na Home e readicioná-la: nenhum favorito antigo aparece
   (D-007).

## D. TV física (QN50Q60DAGXZD) — gate de SC-001

Instalar com o skill `tizen-tv` (`npm run build:tizen` antes).

1. Em Live TV, 20 OK curtos e 20 OK demorados alternados sobre canais: 100%
   com a ação certa (SC-001). Anotar se o controle entrega `keyup` e se a
   auto-repetição gera ação dupla.
2. Estrela + aviso aparecem sem atraso perceptível após o limiar (SC-002).
3. Filmes e Séries: mesmo teste com 10 + 10.
4. "★ Favoritos" com muitos itens rola sem travar (SC-004).
5. Percepção do OK curto ao soltar nas três seções (R-002): aceitável ou
   ajustar `LONG_SELECT_MS`.
6. Fechar o app pelo Home do controle e reabrir: favoritos intactos.

Fechar a feature sem o cenário D exige decisão explícita do usuário,
registrada em `plan.md` → `Riscos e Decisões` (R-001).
