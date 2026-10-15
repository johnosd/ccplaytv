# Quickstart: Qualidade, aspecto e preferências do player

## Pré-requisitos

- `tv-web/`: `npm install` feito; `npm run dev` rodando (porta 5173) para os E2E.
- Para a passada na TV (gate): TV de referência ligada, Developer Mode, e o
  skill `tizen-tv` (`.\.planning\scripts\powershell\deploy-tv.ps1`).
- Uma lista com: um **filme** e um **canal** quaisquer; de preferência um
  stream **HLS multi-variante** (para qualidade real) — sem ele, a qualidade só
  pode ser verificada no caso "só uma disponível".

## Checagens automatizadas

```powershell
cd tv-web
npx vitest run src/components/PlayerLayer.qualidade-aspecto.contract.test.tsx src/features/settings/SettingsScreen.player-reproducao.contract.test.tsx src/components/PlayerLayer.player-chrome.contract.test.tsx src/components/PlayerLayer.audio-legendas-info.contract.test.tsx
cd ..
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 041-player-qualidade-aspecto
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 027-player-chrome-ds-v14
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 029-audio-legendas-info-player
cd tv-web
npx tsc -b --noEmit; npm run lint; npm run test; npm run build:tizen
node e2e/qualidade-aspecto.mjs        # com npm run dev rodando
npm run test:e2e
```

## Cenários no navegador (dev)

A. **Aspecto real no `<video>`**: abrir um filme, revelar o chrome, ir até
   "Aspecto", OK: painel com Ajustar/Preencher/Original/Zoom, Ajustar marcado e
   focado; escolher Zoom: a imagem corta as bordas na hora; RETURN volta ao
   botão "Aspecto".
B. **Qualidade indisponível no PC**: o controle aparece "Qualidade —
   indisponível"; OK só mostra o aviso.
C. **Sem Velocidade**: percorrer a linha de controles do filme e do canal: não
   há "Velocidade".
D. **Preferências**: Configurações › Player & reprodução (também a partir de
   "Gerenciar listas", sem lista ativa): mudar Aspecto padrão para Preencher;
   abrir um filme: começa em Preencher; mudar no player para Zoom, trocar de
   canal/episódio: continua Zoom; fechar e abrir outro: volta a Preencher;
   voltar à aba: continua Preencher (o player não gravou).
E. **Idioma ausente**: Legenda padrão = Português num conteúdo sem legenda em
   português: começa sem legenda e sem aviso.

## Passada na TV física — GATE OBRIGATÓRIO (SC-002, SC-005)

Rodar depois de `npm run test:e2e` verde (constitution, Fluxo de
Desenvolvimento). Registrar quem viu cada item; cenário não visto = "não
executado".

1. **Aspecto** num filme e num canal: cada modo oferecido muda a imagem em até
   1 s (SC-002); nenhum modo oferecido deixa de fazer efeito (SC-005). Modo
   ausente no painel = o spike provou que o aparelho não o aplica.
2. **Aspecto na sequência**: escolher Zoom num canal, trocar por CH±/↑/↓ e
   pelo zapping: segue Zoom; no próximo episódio (autoplay e botão): segue.
3. **Qualidade** num HLS multi-variante: painel com Auto + só as resoluções
   anunciadas; escolher uma: a imagem muda e "Info do stream" mostra a nova
   resolução; Auto volta ao adaptativo; sem tela de erro em nenhum passo.
4. **Qualidade única** num canal MPEG-TS: "Qualidade — só uma disponível", OK
   só explica.
5. **Preferências** (Máxima, áudio Inglês, legenda Português) aplicadas ao
   abrir um conteúdo que tenha as três; conteúdo sem inglês: áudio padrão, sem
   aviso.
6. **Sem áudio residual / imagem sobre o plano de hardware**: abrir e fechar os
   painéis de Aspecto/Qualidade sobre o vídeo AVPlay: o painel aparece, o vídeo
   continua atrás, fechar devolve o foco ao botão.
7. **Velocidade**: não existe em nenhum tipo de conteúdo.

## Itens transversais (constitution)

- Foco visível em todo estado (painel aberto, controle soft disabled, aba sem
  lista ativa) e SELECT funcional em cada um.
- Nenhuma URL, credencial ou host de provedor em aviso, painel ou log (os
  painéis só mostram rótulos de modo/resolução).
- Capacidades reais: nenhum modo/resolução exibido que o motor/stream não
  ofereça (SC-001).
