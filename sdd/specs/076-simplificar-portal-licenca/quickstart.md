# Quickstart — 076 Portal & licença simplificada

## Pré-requisitos

- `tv-web/` com dependências instaladas (`npm ci`).
- Para E2E/legibilidade: `npm run dev` (porta 5173). Para ver tudo ligado no PC: `npm run dev:portal` (emulador + API + site + TV comercial).

## Checagens automatizadas (de `tv-web/`)

```powershell
npx vitest run src/features/settings/tabs/PortalLicenseTab.simplificar-portal-licenca.contract.test.tsx   # 5/5 verdes
npx vitest run src/features/settings/tabs/PortalLicenseTab.redesenho-portal-licenca.contract.test.tsx     # 075 emendado: 3/3 verdes
powershell -NoProfile -ExecutionPolicy Bypass -File ..\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 076-simplificar-portal-licenca
powershell -NoProfile -ExecutionPolicy Bypass -File ..\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 075-redesenho-portal-licenca
npm run lint
npx tsc -b
npm run test
npm run build
node e2e/run.mjs --only portal-configuracao,portal-avancado,licenca-anual,configuracoes-lista-global,compra-licenca-pix
npm run test:e2e
node e2e/legibilidade-tv.mjs
```

Roteiros opt-in (exigem `gcloud`/emulador/`api/.venv`; fora do SUITE): `node e2e/entrada-listas-gerenciador.mjs`, `node e2e/desvincular-backup.mjs`, `node e2e/consulta-sob-demanda.mjs`, `node e2e/portal-dev-server.mjs`.

## Cenário ponta a ponta (navegador, só teclado — `npm run dev:portal`)

1. Perfis → Configurações → aba **Portal & licença**.
2. Sem apertar nada: QR, site, ID e chave `123 456 7890`; no comercial, cartão Licença com Comprar/Atualizar; **nenhum olho, nenhum código**; uma linha "Guarde seu código de recuperação em Avançado."; botão **Avançado**. Foco inicial: Comprar (teste/vencida), Atualizar (ativa).
3. Build não comercial (`npm run dev`, sem portal): sem cartão Licença; foco em Avançado.
4. Avançado → subtela com quatro itens e um texto de "para que serve" em cada um (leia em voz alta: dá para entender sem apertar nada?). O foco entra no olho do **Código de recuperação**; focar não revela; OK mostra; OK oculta.
5. Revelar o código e apertar RETURN: volta à principal com o foco em Avançado; reabrir mostra o código oculto. RETURN de novo sai de Configurações como sempre.
6. Gerar nova chave e código → Cancelar (nada muda, continua no Avançado) → de novo → confirmar: volta à principal, chave e QR novos, código oculto, mensagem de acesso atualizado.
7. Recuperar pelo site: volta à principal com o QR temporário e a contagem no lugar do fixo; sair da aba e voltar → QR fixo.
8. Desvincular: confirmação 072 → principal mostra a TV desvinculada e **Vincular de novo**.
9. Aba **Backup** inalterada.
10. Idiomas: trocar para en e es (Configurações → idioma) e conferir que nenhum texto diz "license code"/"código de licencia".

## TV física (opcional — não é gate)

- Ler o QR a ~2 m; revelar o código, apertar HOME e voltar → código oculto.
- Formatar o app/TV e confirmar se **Recuperar pelo site** com o código guardado fora da TV volta ao mesmo cadastro (o identificador do aparelho depois de formatar não foi verificado — R-006).
