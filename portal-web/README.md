# Portal CCPlayTV

Bootstrap da feature 069. `npm ci`, `npm run dev` (5174), `npm run lint`, `npm run test`, `npm run build`, `npm run test:e2e`. Proxy API `/portal/v1` para 3001. A produção serve dist pelo entrypoint portal_main.py. Sem segredos VITE_*, Firebase SDK ou acesso direto ao banco. Compra/configuração/recuperação serão implementadas nas respectivas fases; este bootstrap não habilita venda.

O E2E usa o servidor já iniciado, como a suíte da TV: execute `npm run dev` em outro terminal antes de `npm run test:e2e`. Isso evita o plugin de subprocesso do runner no ambiente Windows desta execução.
