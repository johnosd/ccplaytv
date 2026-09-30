# Quickstart: validar a Live TV no DS V14 (feature 024)

## Pré-requisitos

- `tv-web/` com dependências instaladas (`npm ci`).
- Dev server **recém-iniciado** (`npm run dev`, porta 5173). Um servidor
  deixado aberto por horas já deixou a sequência de E2E instável (feature
  022).
- Scripts E2E com o `executablePath` do Chromium Linux fixo: rodar no
  Windows exige override temporário do caminho em cada script (CLAUDE.md,
  R-5 do roteiro). **Nunca commitar o override.**
- Nenhuma credencial real em fixture, log ou print. As fontes de teste dos
  E2E são as já usadas pelos scripts existentes.

## Checagens automatizadas

Rodar em `tv-web/`:

```powershell
# Contratos da 024 (5 testes) + contrato travado da 018
npx vitest run src/features/live/channelNumber.live-tv-ds-v14.contract.test.ts src/navigation/appNav.live-tv-ds-v14.contract.test.ts src/features/live/LiveScreen.live-tv-ds-v14.contract.test.tsx src/lib/catalog/channelLogo.live-tv-ds-v14.contract.test.ts src/features/live/LiveScreen.busca-categoria.contract.test.tsx

# Suíte completa, tipos, lint, builds
npm run test
npx tsc -b
npm run lint
npm run build
npm run build:tizen
```

Integridade das travas, na raiz do repositório:

```powershell
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 024-live-tv-ds-v14
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 018-busca-por-categoria
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 020-ciclo-vida-player
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 022-biblioteca-componentes-ds-v14
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 023-shell-navegacao-entrada-ds-v14
```

E2E (gate da constitution, com o dev server já rodando): `npm run test:e2e`
mais cada `node e2e/<script>.mjs` que toca a Live. No mínimo:
`zapping-live-tv.mjs`, `busca-por-categoria.mjs`, `favoritos.mjs`,
`ciclo-vida-player.mjs`, `m3u-sob-demanda.mjs` e o novo
`live-tv-ds-v14.mjs`. Rodar também os que tocam o shell ou a paridade
visual (`shell-visual.mjs`, `paridade-visual.mjs`), porque a topbar ganhou
um destino atual novo.

## Cenário ponta a ponta (navegador, 1920×1080)

1. Perfis → escolher uma lista com canais → Início → topbar "TV ao vivo".
   - A Live abre sob a topbar, com "TV ao vivo" marcada como atual e o foco
     na 1ª categoria da fonte.
2. ↑ até "★ Favoritos" e ↑ de novo: o foco vai para "TV ao vivo" na topbar.
   ↓ volta a "★ Favoritos". RETURN na topbar volta ao Início.
3. Entrar numa categoria: os canais aparecem com número (se derivável),
   logo ou iniciais, nome e o slot "Agora" vazio. O chip "N canais" aparece.
4. → no canal: foco em "Assistir". ↓ "Favoritar" e OK: toast, estrela na
   linha, rótulo "Favorito". ↓ "Guia completo" e OK: toast "Em breve".
   ← volta ao mesmo canal.
5. OK no canal: player em tela cheia, **sem topbar**. OK durante a
   reprodução: zapping em 2 colunas, sem preview. Trocar de canal: a lista
   só fecha quando o novo toca. RETURN fecha o zapping e depois o player,
   com o mesmo canal focado.
6. Segurar OK e a tecla amarela (simulada) num canal: favorita sem abrir o
   player, na lista e no zapping.
7. Busca: ↑ no 1º canal → ícone → OK → digitar 3 letras → resultados;
   "Todos" mostra "Busca em X de Y categorias".
8. Topbar → "Filmes": abre Filmes; RETURN volta ao **Início**, não à Live.
9. Uma categoria com logo quebrado (URL que falha): iniciais, nunca o ícone
   de imagem quebrada.
10. Numa fonte M3U, o mesmo canal mostra o mesmo número na categoria, em
    "Todos" e em "★ Favoritos".
11. Estados: forçar falha de categoria → "Tentar de novo" aciona com OK;
    Favoritos vazio → estado instrutivo com ação focável.

## Checklist da constitution (pré-aceite)

Executado em 2026-09-27 (T044) — dev server recém-iniciado, Chromium real
via Playwright (sessão manual) e via `live-tv-ds-v14.mjs`/demais scripts de
`npm run test:e2e`. Evidência de cada item:

- [x] Todo estado da Live (carregando, erro, vazio, fonte ausente, Favoritos
      vazio, busca sem resultado, preview) tem um elemento com foco visível e
      acionável ("Foco Visível e Sem Becos Sem Saída"). — SC-002 parametrizado
      (8 estados, `LiveScreen.test.tsx`) + `assertOneFocus` em 5 pontos do
      `live-tv-ds-v14.mjs` num Chromium real.
- [x] RETURN em cada camada devolve o foco ao item de origem, por
      identidade ("Voltar Restaura Foco e Posição"). — confirmado em
      `live-tv-ds-v14.mjs` (topbar→Início, preview←canal) e nos testes
      existentes de foco por id (revalidação/troca de categoria).
- [x] Focar um canal ou uma categoria não inicia reprodução nem consulta
      externa. Só o prefetch com debounce, que já existia, lê categoria. —
      teste "mover o foco entre categorias não consulta o conteúdo" (T028,
      inalterado) + contrato do preview (`fetchPlayback` só após "Assistir").
- [x] Nenhum número de canal, contagem ou texto "Agora" inventado
      ("Progresso e Capacidades São Reais"). — `channelNumberOf`/
      `knownCategoryCount` (contrato + testes T015/T038); slot "Agora" segue
      sempre vazio (`ChannelRow`, inalterado).
- [x] Categorias na ordem e com o nome da fonte ("Categorias da Fonte São
      Preservadas"). — comportamento inalterado (mesma `trail`/`categories`),
      confirmado pelos testes de ordem já existentes.
- [x] Nenhuma URL de logo ou de stream em log, erro ou texto visível. — T037:
      `icon_url` só alimenta `src` de `<img>`, nunca texto/aria-label/log.
- [x] Sem `:has()`, sem `backdrop-filter`, sem `will-change` em massa; glow
      só no item focado. — revisão de `live.css` (nenhuma dessas
      propriedades) + captura de tela confirma glow restrito ao foco.

## TV física (recomendada, não gate)

Com a skill `tizen-tv`: rolagem da lista de canais com logos reais,
zapping sob o novo shell, o plano de hardware do vídeo sem nada pintado por
cima, as teclas amarela e de segurar OK. Registrar a medição de render (R-2
do roteiro de migração) no `plan.md`.
