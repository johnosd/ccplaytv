# Quickstart — 075 Redesenho da tela Portal & licença

## Pré-requisitos

- `tv-web/` com dependências instaladas (`npm ci`).
- Para E2E/legibilidade: `npm run dev` rodando (porta 5173); os roteiros de portal sobem o portal fictício sozinhos (`e2e/lib/portalStack.mjs`).

## Checagens automatizadas (de `tv-web/`)

```powershell
npx vitest run src/features/settings/tabs/PortalLicenseTab.redesenho-portal-licenca.contract.test.tsx   # 5/5 verdes
powershell -NoProfile -ExecutionPolicy Bypass -File ..\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 075-redesenho-portal-licenca
powershell -NoProfile -ExecutionPolicy Bypass -File ..\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 067-configuracoes-lista-global
npm run lint
npx tsc -b
npm run test
npm run build
node e2e/run.mjs --only portal-configuracao,portal-dev-server,portal-pacote-file,consulta-sob-demanda,entrada-listas-gerenciador,licenca-anual,desvincular-backup,configuracoes-lista-global,compra-licenca-pix
npm run test:e2e
node e2e/legibilidade-tv.mjs
```

## Cenário ponta a ponta (navegador, só teclado)

1. Perfis → Configurações → aba **Portal & licença** → OK.
2. Sem apertar nada: QR, endereço, ID (`AA:BB:…`) e chave `123 456 7890` visíveis; nenhuma requisição no DevTools.
3. Foco inicial: Comprar licença (comercial, teste/vencida) / Atualizar (ativa) / olho (não comercial).
4. ↑/↓ até o olho: o código continua mascarado; OK mostra; OK oculta. Revelar, trocar de aba e voltar → oculto.
5. ↓ até **Mais opções** → OK → três itens; RETURN fecha e o foco volta a Mais opções.
6. Gerar nova chave e código → Cancelar (nada muda) → de novo → confirmar → chave e QR novos na tela, código oculto.
7. Recuperar pelo site → QR temporário com contagem no lugar do fixo; sair da aba e voltar → QR fixo.
8. Aba **Backup** (logo abaixo de Portal & licença): estado + Fazer backup agora / Restaurar backup / Apagar backup; nenhuma ação de backup resta em Portal & licença.
9. Desvincular (em Mais opções) → confirmação 072 → tela reflete a TV desvinculada.

## TV física (opcional — não é gate, R-003)

- Ler o QR com o celular a ~2 m e entrar no painel.
- Revelar o código, apertar HOME e voltar ao app → código oculto, QR fixo presente.
- Navegar a tela inteira só com o controle.
