# Quickstart: Rádio global

## Pré-requisitos

- `tv-web/` com dependências instaladas (`npm ci`).
- Uma lista IPTV ativa no app (fixture dos E2E ou lista real). A Rádio só aparece com lista ativa.
- Para a passada real: rede com acesso a `*.api.radio-browser.info`.

## Checagens automatizadas

```powershell
cd tv-web
npx vitest run src/features/radio/RadioScreen.radio-global.contract.test.tsx src/lib/radio/radioDirectory.radio-global.contract.test.ts   # 5/5
..\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 074-radio-global          # trava íntegra (rodar da raiz: .\.planning\...)
npx tsc -b
npm run lint            # oxlint + catraca de arquitetura (sem exceção nova)
npm run test
npm run build           # guarda sem demux
npm run build:tizen     # guard do tizen_web_project.yaml (route-radio.js listado)
```

Com `npm run dev` no ar:

```powershell
node e2e/run.mjs --only radio-global,legibilidade-tv
npm run test:e2e
```

`e2e/radio-global.mjs` intercepta `**/*.api.radio-browser.info/**` com `page.route` (fixture local de países e
estações; streams apontam para um áudio local ou falham de propósito). Nunca depende do serviço real.

## Cenário ponta a ponta (navegador, `npm run dev`)

1. Abrir a lista → Início → topbar: "Rádio" aparece depois de "Séries". OK.
2. A tela abre no país da TV (em pt-BR, Brasil), com "100 mais ouvidas de N" e o foco na primeira estação.
3. ↓/↑ na lista; OK → a barra "Tocando agora" mostra a estação; OK de novo → para.
4. RETURN → trilha; ↓ por vários países **sem OK** → a grade não muda (aba Rede: nenhuma `stations/search` nova).
5. OK num país → carregando focável → estações. ←/→ pagina.
6. Segurar OK numa estação → estrela + anúncio, nada toca. `★ Favoritos` → a estação está lá; OK toca.
7. Estação que não toca (fixture com URL quebrada) → barra "Estação indisponível" com "Tentar de novo" / "Próxima
   estação"; ↑ no primeiro item chega na barra; nada toca sozinho.
8. RETURN até o Início → o áudio para; voltar à Rádio → mesmo país, foco na mesma estação.
9. Bloquear `*.api.radio-browser.info` (DevTools) e reabrir → países/estações do cache com aviso; sem cache →
   erro com "Tentar de novo" focado.
10. Repetir 1–3 em en e es (nomes de país traduzidos; nome de estação não).

## Passada na TV física (skill `tizen-tv`) — gate de SC-001/SC-004

O adaptador `<video>` não prova áudio de rádio no AVPlay (R-003). Fechar a feature sem esta passada é decisão
explícita do usuário, registrada em `Riscos e Decisões`.

1. `deploy-tv.ps1` com o build atual.
2. Rádio → Brasil → tocar as 10 primeiras estações, uma a uma: anotar toca/falha, codec (barra) e segundos do OK até o
   som. Meta: ≥ 8/10 com som (SC-001), mediana ≤ 5 s (SC-004).
3. Repetir com mais um país e com "Mais ouvidas no mundo".
4. Deixar uma estação tocando até a proteção de tela ligar: o som continua (FR-018).
5. Tecla Stop do controle para; RETURN até o Início para.
6. Quem viu/ouviu registra o resultado em `plan.md` → `Execution Notes`; sem URL de stream no registro.

## Itens transversais

- Nenhum `console.*` em `lib/radio/` e `features/radio/`; nenhuma URL em mensagem de erro (SC-006).
- Revisão de segredos antes do commit: nada de credencial de lista chega a `lib/radio` (não há import de `lib/catalog`).
- `CCPlayTv/tizen_web_project.yaml` com todo arquivo emitido novo.
