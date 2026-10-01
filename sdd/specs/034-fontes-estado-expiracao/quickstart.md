# Quickstart — 034 Fontes IPTV completas

## Pré-requisitos

- `tv-web/` com dependências instaladas; `npm run dev` rodando para o E2E.
- Para a medição real (SC-006): `.env` da raiz com `CCPLAY_PROBE_*` do painel
  Xtream (nunca impresso — o script só mostra a data derivada e contagens).

## Checagens automatizadas

```powershell
cd tv-web
npx vitest run src/lib/catalog/sourceAccount.fontes-estado.contract.test.ts src/lib/catalog/accountCheck.fontes-estado.contract.test.ts src/lib/catalog/importPipeline.fontes-estado.contract.test.ts src/features/sources/SourceAccessGate.fontes-estado.contract.test.tsx
cd ..; .\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 034-fontes-estado-expiracao; cd tv-web
npx tsc -b
npm run lint
npx vitest run
node e2e/fontes-estado.mjs          # com npm run dev rodando
npm run test:e2e
npm run build:tizen
```

## Cenários ponta a ponta (navegador, painel falso do E2E)

1. **Vencimento na linha e no cartão** (US1): painel falso com `exp_date` em
   +30 dias → Configurações › Fontes IPTV mostra "Conta válida até …"; o
   cartão em "Quem está assistindo?" sem chip. Trocar para +3 dias e
   ressincronizar → chip "Vence em 3 dias" nos dois.
2. **Lista vencida não abre** (US2): `exp_date` no passado, ressincronizar
   (a sincronização falha com "assinatura expirada" e grava a conta) →
   escolher o cartão → tela "A assinatura desta lista venceu em …", foco em
   "Editar lista". RETURN volta ao cartão da lista. "Verificar de novo" com o
   painel já renovado → Início abre.
3. **Sem internet** (US2 AC6): com a conta guardada vencida, cortar a rede
   (`navigator.onLine`/rota bloqueada) → escolher a lista → bloqueio com
   "Não foi possível confirmar agora".
4. **Painel lento** (SC-003): rota do painel sem resposta → escolher uma lista
   com verificação > 24 h → a tela "Verificando…" some em ≤ 5 s e decide pelo
   dado guardado.
5. **Credencial inválida** (US3 AC3): painel respondendo 401 → ressincronizar
   → linha e cartão "Credencial inválida"; escolher a lista → tela de
   recusa.
6. **Sincronizando** (US3 AC1): durante uma ressincronização, linha e cartão
   dizem "Sincronizando".
7. **Contagem** (US4): fonte Xtream → "N categorias de canais · N de filmes ·
   N de séries"; fonte M3U avulsa → totais de itens.

## Itens transversais

- Varredura de segredo (SC-004): o E2E procura `usuario`, senha e host do
  painel falso no `textContent` e em todos os atributos `aria-*`/`title` das
  telas tocadas — zero ocorrências.
- Foco: toda tela/estado novo (verificando, bloqueio, reconsulta) tem um
  elemento com `.tv-focus` que OK ativa.
- TV física: **recomendada, não gate** (nada aqui depende de AVPlay nem de
  tecla especial). Na próxima passada do item 58, conferir a tela de acesso
  e os chips no aparelho.
