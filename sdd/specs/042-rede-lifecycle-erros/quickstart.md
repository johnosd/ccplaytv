# Quickstart — verificação da feature 042

## Pré-requisitos

- `cd tv-web` · `npm install` feito · **reinicie** `npm run dev` se estiver de pé há horas (E2E fica instável).
- `.env` na raiz só é necessário para o roteiro com a lista real (opcional). Nunca colar valores dele em lugar nenhum.

## Checagens automatizadas

```powershell
npx tsc -b
npm run lint
npx vitest run src/lib/player/playbackDiagnosis.rede-lifecycle.contract.test.ts src/components/PlayerLayer.rede-lifecycle.contract.test.tsx src/lib/catalog/prefetch/prefetchScheduler.rede-lifecycle.contract.test.ts
..\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 042-rede-lifecycle-erros
npm run test
npm run build:tizen
npm run test:e2e
```

## Cenários (navegador, com `e2e/rede-lifecycle-erros.mjs` ou à mão)

1. **Queda do stream com rede** (adaptador falso emite `PLAYER_ERROR_CONNECTION_FAILED`): aparece "Reconectando… (tentativa 1 de 3)", depois 2 e 3; ao fim, tela de erro com **código `PLAY-01`**, "Tentar de novo" focado e "Info técnica". Filme reabre da posição que estava (não do zero).
2. **Sem rede de verdade** (DevTools → Offline): nenhuma tentativa automática; banner "Sem conexão com a internet."; RETIRAR o mouse e navegar só por teclado: ←/→ na topbar chega a **"Tentar de novo"** (último item); OK → "Verificando rede…" e depois "Ainda sem conexão.". Ligar a rede de novo: o banner some e o foco cai em "Início".
3. **Ocultar e voltar sem rede** (filme tocando): ao ocultar pausa; ao voltar com `verifyNetwork` falhando aparece o aviso + "Tentar de novo"; `MediaPlay` **não** retoma. Com rede e OK no botão: a URL é reconfirmada e `MediaPlay` retoma.
4. **Info técnica**: abre com 5 campos (código, categoria, mídia, motor, hora); nada de URL/usuário/senha; RETURN volta à ação de origem; segundo RETURN fecha o player.
5. **429 do painel** (painel falso devolvendo 429): a pré-carga pausa por 60 s, a linha do Início diz "Pré-carga em pausa — o painel pediu um intervalo", nenhum toast por categoria; entrar numa categoria funciona.
6. **Formulário de lista** (P3): endereço inválido, painel fora do ar, senha errada, painel que não fala Xtream → quatro mensagens e códigos diferentes.
7. **Varredura de segredos**: nas telas acima, `document.body.innerHTML` e os `aria-*` não contêm usuário, senha nem a URL do stream.

## Pre-acceptance checklist da constituição

- Todo estado novo tem elemento focável ou saída por RETURN.
- Nenhum erro cru, URL ou credencial em tela, `aria-*` ou log.
- Foco e posição restaurados ao fechar o painel/voltar.
- Progresso real (posição do motor), nunca inventado.

## Na TV (recomendado, não gate — R-001/R-008)

- Anotar os **nomes reais de erro** que o AVPlay emitir (derrubar o Wi-Fi com um stream tocando) e ampliar a lista branca.
- Reconexão numa queda de verdade; aviso/Info técnica sobre o plano de hardware; o item "Tentar de novo" da topbar com o controle físico.
