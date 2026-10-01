# Quickstart — verificação manual da feature 021

Os passos automatizados vêm primeiro. Os manuais cobrem o que nenhum teste
prova: aparência, leitor de tela real e TV.

## Pré-requisitos

- `tv-web/`: `npm install` feito. Nenhuma dependência nova é esperada.
- Um terminal com `npm run dev` rodando em http://localhost:5173.
- Chromium do Playwright disponível. No Windows, override temporário do
  `executablePath` nos scripts `e2e/*.mjs` (R-006), sem commit.

## 1. Checagens automatizadas (em `tv-web/`)

```powershell
npx tsc -b
npm run lint
npx vitest run scripts/pacoteTizen.fundacao-visual.contract.test.mjs src/lib/stage.fundacao-visual.contract.test.ts src/components/Toast.fundacao-visual.contract.test.tsx src/lib/motionPreference.fundacao-visual.contract.test.ts
npx vitest run
..\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 021-fundacao-visual-ds-v14   # rodar da raiz do repo
npm run build:tizen          # deve passar pela guarda D-009 sem faltantes
npm run test:e2e             # comparar com a baseline registrada na Fase 1 (R-005)
node e2e/paridade-visual.mjs depois
```

Esperado:
- 5/5 contratos verdes.
- Suíte completa verde (instabilidades conhecidas confirmadas isoladas).
- `build:tizen` sem lista de faltantes.
- `CCPlayTv/index.html` regenerado sem `fonts.googleapis.com` e com
  `lang="pt-BR"`.

## 2. Fontes sem internet (US1, SC-001/SC-002)

1. No DevTools do navegador, aba Network: bloquear os domínios
   `fonts.googleapis.com` e `fonts.gstatic.com` (ou pôr a aba em
   **Offline** depois do carregamento inicial do dev server).
2. Recarregar e percorrer lista de fontes → hub → Live → Filmes → Séries →
   detalhes → player.
3. Conferir:
   - no painel **Computed → Rendered Fonts** de um título, `Poppins`;
   - no texto corrido, `Inter`;
   - na aba Network, nenhuma requisição de fonte externa, e 8 `.woff2`
     servidos localmente no máximo.
4. Renomear temporariamente um `.woff2` em `src/assets/fonts/` e recarregar:
   o texto daquele peso cai para Arial/Helvetica e a tela continua
   navegável. Desfazer depois.

## 3. Palco (US2, SC-003/SC-004)

1. Abrir `evidencias/antes/` e `evidencias/depois/` lado a lado e comparar
   as 8 telas em 1920×1080: posição, tamanho e quebra de linha iguais.
   Registrar o veredito no Registro da Fase de Polish.
2. Conferir as capturas `depois` em 1280×720 e 3840×2160: interface
   inteira, proporcional, centralizada, sem rolagem.
3. Com o app aberto numa janela comum, redimensionar a janela com foco num
   card: a interface acompanha, e o foco continua no mesmo card.
4. Numa janela bem mais larga que 16:9: faixas laterais neutras, sem
   distorção.
5. Abrir um filme no player de dev (`<video>`) em janela 1280×720: o vídeo
   ocupa o palco inteiro e os controles ficam alinhados sobre ele.

## 4. Leitor de tela (US3, SC-007)

1. Ativar um leitor de tela no navegador (NVDA no Windows, ou a extensão
   Screen Reader do Chrome).
2. Em Live TV, focar um canal e segurar OK (ou a tecla amarela, `F2` no
   teclado de dev, se mapeada): o leitor diz "Adicionado aos favoritos" uma
   vez, em português, e o foco fica no canal.
3. Favoritar e desfavoritar em sequência, e depois favoritar de novo o
   mesmo item: cada toast é anunciado.

## 5. Reduzir movimento (US4)

1. DevTools → Rendering → **Emulate CSS prefers-reduced-motion: reduce**.
   Navegar entre cards: o foco muda sem animação, e borda, halo e escala
   final continuam visíveis.
2. Desligar a emulação. No console, rodar
   `localStorage.setItem('ccplaytv:reduce-motion','true')` e recarregar: o
   mesmo comportamento, e `<html>` tem a classe `reduce-motion`.
3. Rodar `localStorage.removeItem('ccplaytv:reduce-motion')` e recarregar:
   animação de foco de volta.

## 6. TV física (recomendado, não obrigatório)

Via skill `tizen-tv`, depois do `build:tizen`:
1. Com a TV sem acesso à internet (ou com DNS bloqueando Google Fonts), os
   títulos aparecem em Poppins. Isso prova que os `.woff2` estão no `.wgt`.
2. A interface ocupa a tela exatamente como antes (escala 1, sem
   `transform`).
3. Foco e glow iguais ao da versão anterior.
4. Um canal ao vivo e um filme continuam mostrando **imagem** (plano de
   hardware, R-002), e o toast de favoritar aparece por cima.

Registrar o resultado no `plan.md`. Se não for executado, registrar como
**não executado**, nunca como aprovado.
