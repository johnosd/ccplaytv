# Passada na TV física — feature 091 (parcial)

- Data: 2026-10-23. Aparelho: TV de referência QN50Q60DAGXZD (192.168.0.12), Tizen 9.
- Instalado: `build:tizen` com `VITE_PORTAL_ORIGIN` e `VITE_PORTAL_SITE_URL` = `https://portal.ccplaytv.com`, instalado por
  `deploy-tv.ps1 -SkipBuild` (reinstalação com o mesmo certificado; IndexedDB preservado). `applist` e o lançamento confirmaram a
  instalação; o veredito de tela é do usuário.
- Pedido ao usuário (verificação local): (1) a seção Legendas mostra a linha "Atualizar"; (2) o foco percorre OpenSubtitles →
  SubDL → Atualizar → cards "Em breve" → teste de conexão; (3) apertar o Atualizar da seção mostra um resultado sem travar.
- Relato do usuário: "Tudo testado com sucesso". Quem viu: o usuário. O relato **não detalha** quais cenários cobriu.

## O que NÃO está provado

- C1–C4 do quickstart (chave enviada pelo portal e aplicada no Atualizar, recusada não troca, remoção, TV sem rede mantém
  pendente) exigem o serviço e o site do portal publicados com a 091. Não foi feita nenhuma publicação nesta sessão; não há
  evidência de que esses cenários tenham sido executados.
- Portanto o gate G-2 (T036) segue **aberto** até o usuário confirmar o escopo do teste e/ou a publicação.

## Esclarecimento (2026-10-23)

O usuário confirmou que **não publicou** o serviço nem o site do portal. O "tudo testado com sucesso" vale, portanto, só para a
verificação local da TV (pontos 1–3). C1–C4 **não foram executados**. T036/G-2 permanece aberto.

## Implantação (2026-10-23) — parcial

- Imagem construída no Cloud Build (projeto `ccplaytv-511322`, build `04fc198b-10db-4123-ae13-dce5c88c6b8b`, SUCCESS, 1m36s):
  `us-central1-docker.pkg.dev/ccplaytv-511322/portal/ccplaytv-portal:091-20261023-1356` (serviço + site do portal, sem alterar nenhum serviço).
- **Não atualizados**: `ccplaytv-portal` (revisão `00023-vtt`) e `ccplaytv-portal-jobs` (revisão `00022-g7d`) continuam na imagem `:staging` anterior, com 100% do
  tráfego. O classificador de permissões do Claude Code bloqueou `gcloud run services update` como "Production Deploy"; nada foi contornado.
- Rollback (se algum dia for preciso): `gcloud run services update-traffic <serviço> --to-revisions <revisão anterior>=100 --region us-central1`.

## Correção da implantação (2026-10-23)

- O projeto `ccplaytv-511322` (staging; serviços `ccplaytv-portal` rev. `00024-bbg` e `ccplaytv-portal-jobs` rev. `00023-65p`, imagem `…:091-20261023-1356`)
  **recebeu** a 091 (rotas de legenda respondem 401 no endereço `run.app` desse projeto).
- `https://portal.ccplaytv.com` **não** é atendido por ele: o domínio ainda serve o bundle antigo e responde 404 às rotas de legenda. Existe o projeto
  `ccplaytv-prod` (serviços `ccplaytv-portal` rev. `00006-pv7` e `ccplaytv-portal-jobs` rev. `00006-x56`, imagem `…:081-t047`), com imagem e projeto próprios.
  A afirmação anterior de que `ccplaytv-511322` era "o serviço de produção que atende portal.ccplaytv.com" estava **errada**.
- Nada foi alterado em `ccplaytv-prod`. A TV instalada aponta para `https://portal.ccplaytv.com`, portanto C1–C4 ainda não podem ser executados.

## Implantação em produção (2026-10-23, autorizada pelo usuário: "publicar em prod")

- Projeto `ccplaytv-prod`, região `us-central1`. Build `9a9d33d9-e7eb-47ea-89cf-71f76f75ad5a` (SUCCESS, 1m37s):
  `us-central1-docker.pkg.dev/ccplaytv-prod/portal/ccplaytv-portal:091-20261023-1408`.
- `ccplaytv-portal`: revisão `00007-dsn` com 100% do tráfego (antes `00006-pv7`, imagem `081-t047`).
  `ccplaytv-portal-jobs`: revisão `00007-f9t` com 100% (antes `00006-x56`, imagem `081-t047`). Atualizado só `--image`; variáveis e segredos intactos.
- Verificação em `https://portal.ccplaytv.com`: `/health` 200; `/portal/v1/integrations/subtitles` e `/portal/v1/device/integrations/subtitles` 401 sem
  autenticação (antes 404), como as rotas da TMDB e `/configurations`; o site serve o bundle novo (`index-DRozhA4Y.js`).
- Rollback: `gcloud run services update-traffic ccplaytv-portal --project=ccplaytv-prod --region=us-central1 --to-revisions ccplaytv-portal-00006-pv7=100` e,
  nos jobs, `ccplaytv-portal-jobs-00006-x56=100`.
- Não verificado: fluxo autenticado de ponta a ponta (envio pelo celular, TV aplicando) — é o C1–C4 que o usuário ainda precisa fazer na TV.

## Passada na TV com a 091 em produção (2026-10-23) — relato do usuário

Quem viu: o usuário, na TV de referência, com o pacote instalado e o serviço de produção já na 091.

- **Observado (relato):** (1) enviou a chave pelo portal; (2) apertou **Atualizar** na TV e a chave **apareceu** na TV; (3) **validou** a chave (teste na TV);
  (4) entrou num filme e **confirmou que baixa legendas dos dois provedores**.
- **Cobre do quickstart:** C1 (chave enviada pelo portal e aplicada no Atualizar) e o uso real da legenda depois dela. O relato não diz qual(is) fornecedor(es)
  recebeu(ram) a chave pelo portal, nem se o portal mostrou "Aplicada na TV".
- **Não relatado / não executado:** chave recusada que não troca a anterior (C2/recusa), remoção pelo portal aplicada no Atualizar (C3) e TV sem rede mantendo a
  operação pendente (C4). Sem evidência, ficam como "não executado", não como aprovado.

## Decisão de fechamento do G-2 (2026-10-23)

O usuário decidiu **fechar o G-2 com o caminho principal** (envio pelo portal → Atualizar → validação → legendas dos dois provedores num filme).
Recusa, remoção e TV sem rede **não foram executadas na TV**; a prova delas é automatizada (testes do serviço e da TV, `portal-web/e2e/subtitulos.spec.ts` e
`tv-web/e2e/chave-legenda-portal.mjs`). Este é um fechamento com cobertura parcial na TV, aceito pelo usuário — não uma aprovação dos três cenários.
