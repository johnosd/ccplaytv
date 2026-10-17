# Portal CCPlayTV

Site para gerenciar a mesma TV pelo celular ou pelo computador: **Listas** (adicionar, editar, excluir), **Licença** (comprar ou renovar) e **Ajustes** (chave TMDB, backup, código de recuperação, recuperar acesso, ajuda). Mobile first: barra inferior até 960 px, menu lateral a partir daí, com o resumo da TV sempre no topo. Estrutura em `src/features/{shell,session,lists,license,settings}` e estilos em `src/styles/`.

Comandos: `npm ci`, `npm run dev` (5174), `npm run lint`, `npm run test` (Vitest, só lógica pura), `npm run build`, `npm run test:e2e` (Playwright). Proxy da API `/portal/v1` para 3001. A produção serve o `dist` pelo entrypoint `portal_main.py`. Sem segredos `VITE_*`, Firebase SDK ou acesso direto ao banco.

O E2E usa o servidor já iniciado: execute `npm run dev` em outro terminal antes de `npm run test:e2e`. Os projetos `mobile`, `tablet` e `desktop` rodam só `layout.spec.ts` (`npx playwright test e2e/layout.spec.ts --project=mobile --project=tablet --project=desktop`); o projeto `default` roda o resto. Textos em `src/lib/i18n` (pt/en/es; `areas/novoPortal.ts` e `faq.ts`).

A chave TMDB digitada aqui só trafega no corpo do `PUT` e nunca é devolvida (ADR-020). A venda real continua desligada até os gates de segurança, pagamento, restauração e TV física.