# Medição da cota na TV física (2026-10-18)

- **Aparelho**: QN50Q60DAGXZD, `Tizen 9.0`, Chromium `120.0.6099.5`, origem `file:`.
- **Como**: app de teste **separado** (`ccpSonda82.CotaProbe`, código em `../sonda-tv/`). Ele tem outra pasta de dados,
  então o CCPlayTV e a lista do usuário não foram tocados. A instalação foi autorizada pelo usuário, e o app foi
  **desinstalado** ao final (o `applist` só mostra `8tZqMtwANL.CCPlayTv`).
- **Dados**: só sintéticos (texto aleatório e um catálogo fictício). O relatório bruto está em `sonda-cota-tv.jsonl`, só
  com números e nomes de erro.
- **Ensaio prévio no PC**: Chromium do Playwright com `Storage.overrideQuotaForOrigin` = 80 MiB, perfil persistente e
  `--disable-features=StaticStorageQuota`. O comportamento bateu com a TV, exceto na compressão (abaixo).

## Resultados

| Pergunta | Resultado na TV | Conclusão |
| --- | --- | --- |
| Valor da cota | `quota` = **83 886 080 bytes = 80 MiB exatos**. O disco interno tem 4 125 884 416 bytes, com 1 358 667 776 livres | **Valor fixo.** Não sai de nenhuma fórmula sobre o disco (60 % = 2,4 GB; ÷ 75 = 55 MB) |
| `persist()` | `true` (já era `persisted`), a cota não mudou | Não aumenta |
| `webkitPersistentStorage.requestQuota(500 MB)` | "concedeu" 83 886 080, a cota não mudou | Não aumenta |
| Encher o IndexedDB até falhar | `QuotaExceededError` com 79 MiB gravados e uso de 82,9 MB; de novo após 2 s e após 70 s; a cota ficou em 80 MiB | **O `unlimitedstorage` não concede nada ao estourar.** 80 MiB é o teto |
| Relançar com o banco cheio | No início o uso informado cai para 16 KB (o IndexedDB ainda não foi contado). **Uma** gravação de 1 MiB passa, e o uso fica em 83,96 MB, **acima** da cota | É uma folga de início de sessão, **não aumento**. Explica a leitura "82,1 MB de 80 MB" do app |
| Outras APIs com o banco cheio | OPFS: `QuotaExceededError`; Cache Storage: `QuotaExceededError`; Web SQL: `SQLError 4` (cota) | **Dividem a mesma cota.** Só o `localStorage` (balde próprio, ~5 MB) aceitou |
| Compressão (catálogo fictício de 20 mil itens, 6,59 M caracteres) | Gravado como objetos: **+6,2 MB** no uso. Gravado como gzip: **0,64 MB** (10,4×). Comprimir: 1 179 ms; descomprimir 475 ms + parse 333 ms | **A TV não comprime o que grava** (o PC, Chromium ≥ 129, comprime). O gzip reduz cerca de 10×, mas custa CPU: precisa rodar em Worker |
| Leitura de um bloco de ~3,8 M caracteres | IndexedDB: **140 ms** (mediana de 5). Arquivo `wgt-private` + parse: **459 ms** | O arquivo é **~3× mais lento** |
| `wgt-private` com o IndexedDB cheio | Aceitou **100 MB**, e o uso do navegador **não mudou** (delta 0). Gravação a **0,8 MB/s**; ler 4 MiB levou 407 ms | Fica **fora** da cota, mas é muito lento |
| Limpeza (`deleteDatabase` etc.) | Uso de 84 MB → 27 KB **na hora**, igual 70 s depois | Apagar o banco devolve o espaço sem atraso (apagar **registros** não foi medido) |

## Portão do híbrido (FR-019), com estes números

| Critério | Resultado |
| --- | --- |
| 2. Ganho grande de espaço | **Sim**: fora da cota, ≥ 100 MB gravados (o teste não foi além), com ~1,36 GB livres no disco |
| 3. Não mais lento que hoje | **Não**: leitura ~3× mais lenta (459 contra 140 ms) e gravação a 0,8 MB/s |

→ O critério 3 já reprova o híbrido. Pela regra da spec, ele é **descartado**, salvo se o usuário decidir revisitar o
critério.
