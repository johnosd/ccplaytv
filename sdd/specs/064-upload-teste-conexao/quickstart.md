# Quickstart: 064-upload-teste-conexao

## Pré-requisitos

- Em `tv-web/`: `npm install` feito e Chromium do Playwright instalado (o mesmo dos E2E).
- Nenhuma fonte real nem `.env`. O teste real fala com `speed.cloudflare.com` (internet necessária só para a verificação manual do passo 3).

## 1. Checagens automatizadas

```powershell
cd tv-web
npx vitest run src/lib/network/connectionTest.upload-teste-conexao.contract.test.ts src/lib/network/speedTestRepository.upload-teste-conexao.contract.test.ts
npx vitest run src/lib/network src/features/settings src/features/home/HomeContent.speedTest.test.tsx
npx tsc -b
npm run lint          # a catraca (063): arquivos novos <= 300 linhas; messages/settings.ts não pode crescer
npm run test
npm run build
cd ..
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 064-upload-teste-conexao
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 062-teste-conexao-tv
```

As cinco travas da 062 (C1–C5) **têm de continuar verdes sem edição**: elas provam que o motor de download não mudou.

## 2. E2E

```powershell
cd tv-web
npm run dev                                           # outro terminal
node e2e/run.mjs --only teste-conexao-tv --jobs 1     # PowerShell: o `--` do npm se perde
npm run test:e2e                                      # gate da constitution antes de qualquer TV
```

O E2E `teste-conexao-tv` simula o destino: depois desta feature ele também atende o `POST /__up`, confere que o envio não leva headers nem credenciais, e confere as quatro métricas no resultado e no card.

## 3. Verificação manual (internet real, navegador)

1. `npm run dev`, abrir Configurações › Integrações & BYOK, abrir o teste e iniciar.
2. Conferir: a etapa "Medindo upload…" aparece depois do download, com "MB enviados"; o resultado mostra Download, Upload, Latência HTTP e Jitter com unidades; o card mostra os mesmos quatro valores ao fechar.
3. Repetir cancelando durante o upload: a camada fecha, o foco volta ao card e o resultado anterior continua.
4. No DevTools › Network, conferir que o `POST …/__up` não tem `Authorization`, `Cookie` nem cabeçalhos próprios, e que não há outro destino.
5. Conferir que um resultado gravado antes da feature (com a base de uma versão anterior) mostra "Não medido neste teste" no Upload, sem número.

## 4. TV física (recomendação, não gate)

Rodar o teste no app empacotado e registrar aparelho, versão, destino, duração, consumo e valores, sem credenciais. Pontos que só a TV prova: o `POST` cross-origin a partir de `file://`, o corpo de 20 MB e o tempo da etapa de upload. Se o `POST` falhar na TV, o app mostra o resultado parcial com "Amostra insuficiente" no Upload, sem derrubar o resto.

## 5. Itens transversais da constitution

- Segredos: o envio só leva bytes gerados pelo app, sem URL de fonte, credencial, chave ou identificador; nenhuma URL no resultado, nas mensagens de erro ou nos logs.
- Documentação canônica: a 062 ganha uma nota apontando que o upload entrou pela 064; `CLAUDE.md` não muda (nenhum comando novo).
- Textos novos em pt/en/es (`messages/speed.ts`).
