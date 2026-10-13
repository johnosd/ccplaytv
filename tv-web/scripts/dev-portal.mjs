// `npm run dev:portal`: sobe a pilha local do portal e deixa a TV (app) no navegador para uso manual.
// Abra a URL da TV no Chrome e use o teclado (setas, Enter=OK, Esc=RETURN). Ctrl+C encerra tudo.
import { startPortalStack } from '../e2e/lib/portalStack.mjs'

// Porta padrão do Vite (5173): é a URL que já se usa no `npm run dev`. Pare o `npm run dev` antes (a porta é única).
const stack = await startPortalStack({ log: message => console.log('›', message), tvPort: Number(process.env.TV_PORT ?? 5173) })
console.log(`
  TV (app, modo comercial):  ${stack.tvOrigin}
  Portal (site / QR):        ${stack.portalOrigin}
  API local (emulador):      ${stack.apiOrigin}
  Identidade de dev (DUID):  ${stack.devDuid}   (só neste modo; o build da TV nunca tem identidade alternativa)

  Fluxo: abra a TV → Configurações/“Adicionar pelo site” → “Gerar QR para o portal” → abra a URL do Portal
  e entre pelo convite (o QR da tela contém o endereço) ou por ID/chave da TV. Dados somem ao encerrar.
`)
const shutdown = () => { stack.stop(); process.exit(0) }
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
await new Promise(() => {})
