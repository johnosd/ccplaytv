# Quickstart — verificação da feature 060 (Home "Vitrine expandida")

## Pré-requisitos

- `tv-web/`: `npm install` feito; `npm run dev` na 5173 para E2E e verificação no navegador.
- Uma lista com: pelo menos 2 títulos em andamento (um filme e um episódio de série), 1 filme concluído, 2+ favoritos, 3+
  canais favoritos com EPG, e categorias de filmes/séries já obtidas no aparelho. Para TMDB: chave BYOK conectada
  (Configurações › Integrações & BYOK). Credenciais de teste reais: `CCPLAY_PROBE_*` do `.env` da raiz (nunca expor).
- TV física (gate, D-015): skill `tizen-tv`.

## Checagens automatizadas (de `tv-web/`)

```powershell
npx vitest run src/features/home/HomeContent.home-vitrine-expandida.contract.test.tsx src/lib/catalog/becauseSeed.home-vitrine-expandida.contract.test.ts src/features/vod/vodShowcaseRows.home-vitrine-expandida.contract.test.ts
npx vitest run src/features/home src/features/vod src/features/catalog src/lib/catalog src/lib/metadata src/components src/navigation src/lib/i18n
npx tsc -b
npm run lint
npm run build
npm run test:e2e                     # com npm run dev rodando
```

Travas (da raiz): `check-contract-tests.ps1 -Slug` para `060-home-vitrine-expandida`, `026-home-busca-configuracoes-ds-v14`,
`052-vitrine-filmes-series`, `053-carrosseis-filmes-series`, `056-bem-avaliados`, `057-top10-dica-tmdb`,
`059-detalhe-cinema-filme-serie`, `022-biblioteca-componentes-ds-v14` (contrato do `Rail`).

## Cenários (navegador, depois TV)

1. **Billboard** (US1/AC1): abrir a lista → Início com o título em andamento em tela cheia, backdrop (ou cor da capa),
   sinopse, "▶ Continuar" focado com barra e "faltam X" (só se a duração for conhecida). A 1ª fileira aparece no rodapé.
2. **Sem backdrop** (US1/AC2): título do billboard nunca aberto num detalhe e sem fundo da listagem → cor da capa ou
   gradiente neutro; nunca área vazia.
3. **Recolher** (US1/AC3): ↓ → billboard e dock somem, "Continuar assistindo" sobe para logo abaixo da topbar, o fundo
   passa a ser o do card focado. ↑ → billboard volta com a última ação focada; ↑ → dock; ↑ → topbar.
4. **Fundo sem consulta** (US1/AC4): DevTools › Network aberto; andar pelos cards (inclusive com a seta segurada) → nenhuma
   requisição de API (imagens de capa/fundo já carregadas podem aparecer); o fundo só muda quando o foco para.
5. **Voltar** (US1/AC6): OK num card de "Dica de filme" → detalhe → RETURN → Início já na fileira e no card de origem,
   sem varrer a tela a partir do billboard.
6. **Trailer** (US1/AC7): no billboard, Trailer com TMDB conectado → abre a camada de trailer; sem candidato → toast do
   estado, botão soft-disabled.
7. **Boas-vindas** (US1/AC8): lista sem progresso nem favoritos → billboard de boas-vindas com os atalhos.
8. **Cards** (US2/AC1–AC5): pôster 250×375 com nome e selos; `NOVO` só nos adicionados nos últimos 7 dias; ★ só com nota;
   card focado expande para 16:9 com sinopse quando houver; sem imagem → pôster + cor; Continuar 16:9 com barra real;
   Em alta com numeral 1, 2, 3…
9. **Ponta da fileira** (US2/AC6): → no último card não sai da fileira; o card focado fica na 1ª posição visível.
10. **Fileiras novas** (US3/AC1–AC2, AC4–AC5): "Filmes adicionados"/"Séries adicionadas" com cobertura parcial indicada;
    "Porque você assistiu <título>" com o último concluído (some sem chave TMDB, sem concluído ou sem semelhantes na
    lista); "Ao vivo agora" com programa e barra (sem EPG: sem barra); ordem de FR-018.
11. **Filmes/Séries** (US3/AC3, SC-008): tela de Filmes → "Porque você assistiu <filme>" real (ou ausente); nenhum
    "Em breve" de "Porque você assistiu".
12. **Player** (FR-027): Continuar no billboard → vídeo sem nada da Home pintado por cima; fechar → foco em "Continuar".
13. **Idiomas** (FR-025): trocar para en/es → todos os textos novos traduzidos; nomes de título/canal/categoria intactos.

## TV física — gate (D-015, SC-009)

Cenários 1, 3, 4 (seta segurada), 5, 8 (fluidez da expansão), 10 e 12 na QN50Q60DAGXZD com lista real. Medir:
tempo até "Continuar" focável (SC-007, ≤ 1 s), fluidez ao segurar → numa fileira longa e ao trocar de fileira. Se a
expansão animada engasgar, zerar `--home-expand-duration` (FR-028) e repetir.

## Checklist cross-cutting (constitution)

- [ ] Todo estado da Home tem um elemento focável (carregando, sem dados, sem chave TMDB).
- [ ] Focar não reproduz nem consulta API (cenário 4).
- [ ] Voltar restaura por id (cenário 5).
- [ ] Nenhuma URL de capa/fundo em console/erro; nenhuma credencial em tela.
- [ ] Categoria da lista em chip próprio, nunca substituída por gênero.
- [ ] Barra/"faltam" só com posição e duração reais.
- [ ] `npm run test:e2e` verde **antes** da passada na TV.
