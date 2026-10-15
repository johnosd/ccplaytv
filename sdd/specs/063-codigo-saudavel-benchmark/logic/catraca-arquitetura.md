# Catraca de fronteiras e tamanho (US2, item 49b)

Implementação: `tv-web/scripts/architecture.mjs`. Lista de exceções:
`tv-web/scripts/architecture-baseline.json`. Contrato:
`tv-web/scripts/architecture.codigo-saudavel.contract.test.mjs`.

## 1. Por que um script, e não regras do oxlint

O oxlint 1.81 tem `no-restricted-imports` e `max-lines`, mas não tem catraca: não
há como dizer "este par arquivo→destino é herdado" nem "este arquivo tem teto
de 2 055 linhas" sem um `override` por arquivo, que seriam centenas. Também não
há como apontar exceção obsoleta. O padrão do repositório para uma verificação
própria já existe (`check-no-demux-in-build.mjs`, `tizenFiles.mjs`): função pura
exportada, `main()` só quando executado direto e `*.test.mjs` no projeto `node`
do vitest. O script roda **depois** do oxlint em `npm run lint`:

```json
"lint": "oxlint && node scripts/architecture.mjs"
```

## 2. Arquivos de produção (FR-014)

Entram os `.ts` e `.tsx` sob `tv-web/src/`, com caminho relativo a `src` e `/`
como separador. Ficam de fora:

- `*.test.ts`, `*.test.tsx` (inclui os `*.contract.test.*`);
- `*.fixtures.ts`;
- tudo sob `testing/`;
- `setupTests*.ts`;
- `*.d.ts`.

`isProductionFile(path)` aplica exatamente isso. `checkArchitecture` ignora,
**como origem**, qualquer arquivo não-produção recebido, mesmo que o chamador o
passe (o contrato passa de propósito).

## 3. Contagem de linhas (FR-011)

Linhas físicas, como o editor mostra: `source === '' ? 0 :
source.replace(/\r?\n$/, '').split(/\r?\n/).length`. Linhas em branco e
comentários contam. `MAX_LINES = 300`.

## 4. Imports e resolução

- Extraia os especificadores com `ts.preProcessFile(source, true, true)`. O pacote
  `typescript` já é devDependency. Isso cobre `import … from`, `import type`,
  `export … from`, `import '…'` e `import('…')` sem regex frágil.
- Só especificadores **relativos** (`./`, `../`) contam. Pacotes (`react`,
  `dexie`) são ignorados.
- Resolva contra a pasta do arquivo e normalize para caminho relativo a `src`.
  Depois procure, no conjunto de arquivos recebidos, nesta ordem: o caminho
  exato, `+'.ts'`, `+'.tsx'`, `+'/index.ts'` e `+'/index.tsx'`. Se nenhum
  existir (um `.css`, por exemplo), o destino é o caminho normalizado como
  está, e ele continua sendo classificado pelo prefixo.
- Destino fora de `src` (começa com `..`) é ignorado.

## 5. Regras de importação

Seja `o` a origem e `d` o destino, ambos relativos a `src`.

| Regra | Viola quando | Pode ser herdada? |
| --- | --- | --- |
| `feature-to-feature` | `o` em `features/<a>/…`, `d` em `features/<b>/…`, `a ≠ b` | sim |
| `lib-to-ui` | `o` em `lib/…`, `d` em `components/…` ou `features/…` | sim (hoje: nenhuma ocorrência) |
| `components-to-features` | `o` em `components/…`, `d` em `features/…` | sim (hoje: `components/player/usePlayerSession.ts`) |
| `catalog-to-player` | `o` em `lib/catalog/…`, `d` em `lib/player/…` | **nunca**: mesmo listada em `imports`, reprova |

Arquivos fora dessas pastas (`App.tsx`, `main.tsx`, `navigation/`, `bench/`,
`styles/`) não têm regra de importação, só a de tamanho.

Um import herdado passa quando `baseline.imports[o]` contém `d`. A granularidade
é **arquivo → arquivo**: a origem herdada que passa a importar *outro* arquivo da
mesma feature reprova.

## 6. Regra de tamanho

- `o` fora de `baseline.maxLines` e com `linhas > MAX_LINES` reprova:
  `{ rule: 'max-lines', file, lines, limit: MAX_LINES }`.
- `o` dentro de `baseline.maxLines` e com `linhas > teto` reprova:
  `{ rule: 'max-lines', file, lines, limit: teto }`.

## 7. Exceções obsoletas (FR-013)

Elas são devolvidas em `obsolete` e impressas como **aviso**. Não reprovam o lint,
porque isso obrigaria a editar a lista a cada linha apagada:

- `{ kind: 'import', file, target }`: o par está na lista, mas o import não
  existe mais, ou o arquivo de origem sumiu;
- `{ kind: 'max-lines', file, lines, ceiling }`: o arquivo encolheu abaixo do teto
  (dá para baixá-lo), caiu para `≤ MAX_LINES` (sai da lista) ou sumiu.

## 8. CLI

| Comando | Faz | Saída |
| --- | --- | --- |
| `node scripts/architecture.mjs` | verifica | `0` sem violação (avisos de obsoleto podem aparecer); `1` com violação; `2` sem lista de exceções |
| `--write-baseline` | gera a lista a partir do estado atual (`buildBaseline`) | **recusa** (`2`) se o arquivo já existe: a lista nunca é regenerada (FR-012) |
| `--prune` | remove obsoletos e baixa tetos ao valor atual | **nunca acrescenta** entrada nem sobe teto |

Formato de cada violação, uma por linha:

```text
architecture: feature-to-feature  features/home/Home.tsx -> features/shell/types.ts
architecture: max-lines           lib/novo.ts (301 > 300)
```

Fim da saída: totais, mais a dica "Import herdado só entra editando
scripts/architecture-baseline.json à mão, com justificativa no PR/commit". A
saída imprime só caminhos e números, nunca trecho de código.

`architecture-baseline.json` é gravado com chaves e listas em ordem alfabética e
com 2 espaços de indentação, para o diff ficar estável:

```json
{
  "imports": { "features/home/HomeContent.tsx": ["features/vod/VodCard.tsx"] },
  "maxLines": { "features/catalog/catalogApi.ts": 2055 }
}
```

## 9. Ordem de adoção (importa)

1. US1 concluída: a fachada fica pequena e os módulos de `repository/` entram
   dentro do limite, sem herdar teto.
2. `resumePolicy` movido (T030): `lib/catalog/homeHero.ts` deixa de importar
   `lib/player/`.
3. Só então rode `--write-baseline` (T035). Confira à mão que não há
   `lib/catalog/catalogRepository.ts` em `maxLines` nem par catalog→player em
   `imports`. O contrato confere os dois.
