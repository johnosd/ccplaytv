# Linha de base — filmes (copiada da evidência do assessment)

> Origem: `sdd/assessments/gravacao-carga-secao-tv/evidencias/etapas-gravacao-tv-2026-10-19.md` (medição na TV física em
> 2026-10-19, antes da feature 085). Copiada aqui por T001 para que a comparação de SC-001/SC-002 fique ao lado das
> medições novas. O texto abaixo é o original, sem alteração.

---

# Etapas da carga por seção na TV (2026-10-19)

- **Aparelho**: QN50Q60DAGXZD, Tizen 9.0, Chromium 120.
- **Instalação**: sonda `ccpSondaV2.Capacidades`, autorizada pelo usuário. Instalação 1 às 23:34 e instalação 2 às 23:37
  (desinstala e reinstala), cada uma com 2 rodadas internas. Desinstalada ao final; o `applist` mostra só
  `8tZqMtwANL.CCPlayTv`.
- **Código**: Worker `sonda-tv/memoria/cargaWorker.ts`, variante `secaoEtapas`. Segue a mesma sequência de
  `loadSection` com as funções reais e cronometra cada etapa: `readJsonArrayStream` + `mapVodEntry` + `toItemRecord`;
  `stageSectionItems` a cada 20 mil itens; e, por categoria, `stagedItemsOf` → `prepareBlockWrite` → `makeRoomFor` →
  transação com `commitBlockWrite` → `clearStagedItems`. Sem o portão `waitUntilAllowed`. Ao lado roda a carga real
  (`loadSection`). Teste `etapasSecao` em `app2/memoria.js`.
- **Dados**: `get_vod_streams` reconstruído das amostras sanitizadas: 43 510 filmes, 35 categorias, 15,4 MB. Banco novo a
  cada carga (primeira carga da seção). Nada enviado a provedor.
- **Origem**: `sdd/specs/082-orcamento-armazenamento-tv/evidencias/sonda-tv2.jsonl`.

## Resultado (ms)

| Etapa | I1 R1 | I1 R2 | I2 R1 | I2 R2 |
| --- | --- | --- | --- | --- |
| Carga real (`loadSection`) | 22 343 | 32 653 | 21 434 | 31 209 |
| **Soma das etapas** | **22 381** | **30 410** | **29 354** | **30 761** |
| Ler + interpretar | 3 764 | 5 058 | 4 959 | 3 772 |
| Descarregar no preparo (2×) | 728 | 1 471 | 1 476 | 1 323 |
| Reler o preparo (35×) | 572 | 957 | 943 | 1 020 |
| Preparar + comprimir (35×) | 3 455 | 3 264 | 3 315 | 3 247 |
| **Orçamento `makeRoomFor` (35×)** | **10 725** | **17 115** | **17 041** | **18 020** |
| Transação (35×) | 665 | 697 | 628 | 664 |
| Limpar o preparo (35×) | 2 451 | 1 828 | 972 | 2 699 |
| `navigator.storage.estimate()` 35× (I2) | — | — | 17 | 19 |
| Pior categoria | 2 374 | 1 724 | 1 127 | 2 156 |

**Classificação: gate** da divisão do tempo. A soma das etapas acompanha a carga real (22,4 contra 22,3 s; 30,4–30,8
contra 31,2–32,7 s).

## Leitura

- **O orçamento é a maior etapa**: 10,7–18,0 s, ou 48–61 % da carga, nas quatro medições. São ~300–500 ms por categoria.
- **A estimativa do navegador custa ~0,5 ms por chamada.** O custo do orçamento está nas varreduras do IndexedDB que
  `makeRoomFor` refaz a cada categoria: `catalogLedger` lê todas as categorias, os manifestos, as fontes e as chaves de
  blocos, e faz contagens de guia, episódios e metadados por fonte; `releaseCandidates` faz outras leituras. Isso num
  banco novo com 35 categorias. No app real, com várias listas e mais categorias, o custo por chamada tende a ser maior
  (ASSUMPTION).
- **A área de preparo soma 2,7–5,0 s** (descarregar, reler e limpar). **Comprimir**: ~3,3 s, estável. **Ler e
  interpretar**: 3,8–5,1 s.
- **Variação entre rodadas**: a carga ficou mais lenta da 1ª para a 2ª rodada na instalação 1 (22 → 33 s), e o orçamento
  subiu junto. Na instalação 2, as duas ficaram em ~30 s. Hipótese: o IndexedDB da TV fica mais lento depois de uma
  carga grande apagada (a sonda 2 viu que `clear()` não devolve espaço na hora). ASSUMPTION; não muda a conclusão.
