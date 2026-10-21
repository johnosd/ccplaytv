# Handoff — feature 087: Top 10 e Dica produzidos em segundo plano

## Contexto

- Repositório `ccplayTv`, branch `feature/licenca`. TypeScript + React 19 + Vite, app Tizen rodando de `file://`.
- Próximo comando: **`/sdd-execute 087-top10-dica-segundo-plano`**
- Backlog: **Planejada**, 0/31 tasks.
- **Mudou em disco nesta sessão e precisa ser relido**: `lib/catalog/externalRows.ts` (stub novo),
  `lib/catalog/showcaseTypes.ts` (campos novos no registro), `tv-web/vite.config.ts` (nada desta feature, mas mexido
  na 086). A feature **086 acabou de convergir** — o `CLAUDE.md` tem a regra permanente dela, e esta feature a altera
  (T042).

## O que a feature entrega

- **US1 (P1)** — a abertura de Filmes e Séries deixa de percorrer o catálogo: um produtor em segundo plano grava o
  resultado e a tela só lê. É o MVP; se só isso for feito, já há valor.
- **US2 (P2)** — o resultado se mantém correto sozinho: o período guardado é a validade, e falha de rede nunca esvazia
  a fileira.
- **US3 (P3)** — o que a pessoa faz tem efeito imediato: salvar a chave acorda a fila, remover apaga o guardado.

**Decisões do usuário que contrariam a expectativa óbvia:**

1. Sem resultado guardado, a fileira **não existe** — sem esqueleto e sem "Em breve". Não "melhore" isso.
2. Trocar o idioma **mantém** a fileira na tela com o resultado antigo e troca depois. Só **remover a chave** esvazia na
   hora. A assimetria é deliberada.
3. Produzir **não** acontece ao fim da carga por seção, mesmo parecendo o momento natural.

## Leitura obrigatória, em ordem

1. **`spec.md`** — o escopo e, em `## Assumptions`, a **lista das 14 garantias** que precisam continuar cobertas. Essa
   lista é o tamanho real da feature.
2. **`plan.md`** — Technical Context, as 7 Decisões Invariantes e os 5 riscos (R-001 a R-005).
3. **`logic/producao-em-segundo-plano.md`** — onde cada coisa mora e quando roda. **§4 tem a ordem obrigatória dos
   passos do produtor** e o porquê de cada parada antecipada; **§8 tem a tabela garantia → destino**.
4. **`tasks.md`** — 5 fases; a Fase 3 é o MVP.
5. **`quickstart.md`** — verificação manual e o roteiro de TV **de duração fixa**.
6. **`.planning/memory/constitution.md`**.

## Testes de contrato

**5 de 5 do orçamento, em 2 arquivos travados:**

| Arquivo | Testes | Fase |
| --- | --- | --- |
| `tv-web/src/lib/catalog/externalRows.top10-dica-segundo-plano.contract.test.ts` | 3 | 3 (2 deles) e 4 (1) |
| `tv-web/src/features/catalog/catalogApi.top10-dica-segundo-plano.contract.test.tsx` | 2 | 3 (1) e 4 (1) |

```bash
npx vitest run src/lib/catalog/externalRows.top10-dica-segundo-plano.contract.test.ts src/features/catalog/catalogApi.top10-dica-segundo-plano.contract.test.tsx
```

```powershell
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 087-top10-dica-segundo-plano
```

**Travas de outras features que esta pode quebrar — confira as duas:**

- **`057-top10-dica-tmdb`** — a mais arriscada. `discoveryRules.ts` e `tmdbDiscovery.ts` têm contrato travado, e
  `VodShowcaseScreen.top10-dica-tmdb.contract.test.tsx` **mocka `useWeeklyTop10`/`useDailyTip`**: mudar a **forma do
  retorno** desses hooks quebra a trava.
- **`086-montagem-rapida-telas`** — o contrato C3 proíbe a montagem de ler bloco do catálogo.

## Stubs criados

- **`lib/catalog/externalRows.ts`** — `refreshExternalRow` e `refreshStaleExternalRows` com as assinaturas e a
  documentação do contrato; corpo `throw new Error('not implemented')`. **Não é travado**: é o ponto de partida.
- **`lib/catalog/showcaseTypes.ts`** — `ShowcaseExternalRowRecord` ganhou `ranks`, `backdrops`, `ratings`,
  `coveredCategories`, `totalCategories`. **Campos não indexados: não suba a versão do schema por causa deles.**

## Armadilhas já mapeadas

- **`localDay` não é exportado** em `tmdbDiscovery.ts` (`weekKey` é). Exporte — não reimplemente, ou o período divergirá
  do que o cache do TMDB usa.
- **A semente da Dica** tem de ser `` `${localDay(now)}|${kind}|${sourceId}` ``, igual à de hoje, senão o contrato de
  equivalência reprova.
- **Gravar vazio é intencional** abaixo do mínimo. Se você "otimizar" para não gravar, a fila remonta o índice do tipo
  inteiro a cada rodada.
- **`catalogApi.ts` tem teto de linhas no ratchet.** Remover o bloco da tela reduz o arquivo — mas rode
  `node scripts/architecture.mjs` antes de fechar a fase. Na 086 o build quebrou por **uma** linha.
- **`npm run test` não roda `tsc`.** Um erro de tipo em teste passa pela suíte e quebra o `build`. Aconteceu na 086.
- **O E2E precisa de `npm run dev` no ar.** Sem ele a suíte dá 4/54 e parece regressão — custou tempo na 086.
- **Flake conhecido** (herdado): `headers-catchup` e `carrosseis-filmes-series` falham ~1 em 4 execuções paralelas e
  passam em série; e há uma rejeição intermitente `window is not defined` na suíte unitária, documentada em
  `086/plan.md` → `## Cuidados para Retomada`.
- **O produtor roda no `housekeeping`**, que já se cala durante a carga e espera a primeira revelação. Não acrescente
  portões novos — e não o chame de outro lugar.

## Pendências do Analyze

| ID | Sev. | Resumo | Recomendação |
| --- | --- | --- | --- |
| A-02 | **HIGH** | **T033 carrega as 14 garantias numa única task** — é a maior da feature | Ao executar, quebre-a por garantia usando a tabela do `logic` §8 como checklist, e marque uma a uma. Não a feche com "movi os testes" |
| A-03 | MEDIUM | R-001: o plano B para o consumo de cota (produzir só depois de a tela abrir uma vez) está registrado, não decidido | Só decidir se o consumo se mostrar um problema real. Não implemente preventivamente |

## Gate de pronto

1. **5/5 contratos verdes** e `check-contract-tests.ps1` íntegro para **087, 057 e 086**.
2. `npm run test` · `npx tsc -b` · `npm run lint` · `npm run build` · `npm run test:e2e` (com `dev` no ar).
3. **Cada linha da tabela do `logic` §8 com teste no lugar novo** (FR-017) — é o critério que impede a regressão
   silenciosa.
4. `quickstart.md` §3 executado no navegador.
5. **TV é gate** para SC-007 e SC-008, com o roteiro de **duração fixa** do `quickstart.md` §4 — e **cada instalação
   pede autorização do usuário**.
6. Polish: `CLAUDE.md` atualizado (T042) e **pacote normal reinstalado** na TV (T044).
