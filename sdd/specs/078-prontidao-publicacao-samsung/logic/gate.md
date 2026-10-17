# Lógica do gate de prontidão (feature 078)

Módulos puros em `tv-web/scripts/release/` (Node ESM, sem dependência nova, testados pelo projeto
`node` do Vitest via `scripts/**/*.test.mjs`). Só o CLI `release-gate.mjs` toca disco, git e o `.wgt`;
todos os outros recebem dados prontos. O contrato travado é
`releaseGate.prontidao-publicacao.contract.test.mjs`.

## 1. Forma comum

```js
CheckResult = { id, status, detail, paths?, owner?, justification?, nextAction? }
status ∈ 'Pass' | 'Blocked' | 'Pending' | 'Not Applicable' | 'Waived'
```

- IDs fixos vêm de `CHECKLIST` (`checklist.mjs`). IDs dinâmicos: `SAM-PRV:<nome completo do privilégio>`.
- `detail` é texto curto em português, **sem nenhum valor vindo de arquivo do kit, URL, credencial
  ou variável de ambiente** (FR-016). Para apontar onde está o problema use `paths` (caminho relativo
  do kit/pacote) ou o nome do padrão (`xtream-credential-url`), nunca o trecho.

## 2. Candidato (`candidate.mjs`)

`describeCandidate(input)`:

- `candidate = { ...input, dirty: dirtyPaths.length > 0 }`.
- `INT-CAND-TREE`: `Pass` se `dirtyPaths` vazio; senão `Blocked` com `paths = dirtyPaths`.
- `INT-CAND-HASH`: `Pass` se `revision` é hex de 40, `version` não vazia e `wgtSha256` é hex de 64;
  senão `Blocked`.

`compareWithPrevious(previous, current)`: sem `previous` → `{ stale:false, reasons:[] }`. Senão
`stale = true` se `revision`, `version`, `variant`, `buildMode` ou `wgtSha256` diferem; `reasons`
lista os nomes dos campos. O CLI usa isso contra o último `release/samsung/reports/*.json` da mesma
variante: um relatório antigo nunca é reaproveitado (SC-009).

## 3. Pacote (`packageChecks.mjs`)

`parseTizenConfig(xml)`: regex como em `scripts/tizenInputPrivilege.test.mjs`, sem parser XML
genérico. Lê `widget@id`, `widget@version`, `<name>`, `tizen:application@id|package|required_version`,
todos os `tizen:privilege@name`, todos os `feature@name`, `tizen:profile@name`.

`checkPackage({ configXml, packageFiles, runtimeFloor, lastPublishedVersion, publishedTizenId, buildType, storeTitle })`:

| ID | Pass quando | Senão |
| --- | --- | --- |
| `SAM-PKG-FILES` | `packageFiles` contém `config.xml`, `author-signature.xml` e `signature1.xml` | `Blocked`, `paths` = ausentes |
| `SAM-PKG-MULTIARCH` | sempre `Not Applicable` ("pacote .wgt Web, arquitetura única") | — |
| `SAM-CFG-TIZENID` | `tizenId` = `<packageId>.<nome>` e, se `publishedTizenId`, igual a ele | `Blocked` |
| `SAM-CFG-PACKAGEID` | `^[A-Za-z0-9]{10}$` | `Blocked` |
| `SAM-CFG-VERSION` | três inteiros `0–255.0–255.0–65535` **e**, se `lastPublishedVersion`, maior que ela por comparação **numérica** componente a componente (`0.10.0 > 0.9.0`) | `Blocked` |
| `SAM-CFG-APIVERSION` | `^\d+\.\d+$` **e** ≥ `runtimeFloor` (comparação numérica `x.y`) | `Blocked` (`2.3` < `8.0` oferece o app a TVs 2015/2016) |
| `SAM-CFG-TITLE` | `storeTitle` definido e `name === storeTitle` (exato, com caixa) | `Pending` sem `storeTitle`; `Blocked` se difere |
| `SAM-CFG-SCREENSIZE` | algum `feature` começa com `http://tizen.org/feature/screen.size.` | `Blocked` |
| `INT-PKG-RELEASE` | `buildType === 'Release'` | `Blocked` |

`checkInventory({ declared, emitted, packaged })` → `INT-PKG-INVENTORY`:
`paths` = declarado e não emitido (obsoleto) ∪ emitido e não declarado ∪ emitido com hash ≠ do
empacotado ∪ emitido ausente do pacote. Vazio → `Pass`; senão `Blocked`. Caminhos normalizados com `/`.
`author-signature.xml`, `signature1.xml` e os arquivos de metadata do Tizen (`.project`, `.tproject`,
`tizen_web_project.yaml`) não entram na comparação (o CLI os filtra antes de chamar). `config.xml` e
`icon.png` entram em `emitted`/`packaged` pelo CLI com o hash do disco (`CCPlayTv/`) e do pacote, de
modo que um `config.xml` editado depois do empacotamento aparece em `paths`.

## 4. Privilégios (`privileges.mjs`)

Uma entrada `SAM-PRV:<nome>` por privilégio declarado, avaliada nesta ordem (primeira falha decide):

1. Fora do ledger → `Blocked` ("privilégio sem justificativa registrada").
2. Sufixo (texto depois da última `/`) em `keymanager`, `systemmanager`, `websetting` → `Blocked` (descontinuados).
3. `usedBy[variant]` vazio/ausente → `Blocked` (a variante herda privilégio que não usa).
4. `level === 'platform'` → `Blocked`; `level === 'partner'` sem `authorization` → `Blocked`.
5. `smartcontroller.microphone` sem `authorization` → `Blocked`.
6. `adinfo` com `features.inAppAds === false` → `Blocked`.
7. `sso.partner`, `productinfo`, `billing` com `features.checkout === false` e sem `confirmation` → `Blocked`
   ("lista do Samsung Checkout sem Checkout: registrar confirmação"). Com `confirmation` → segue.
8. Caso contrário → `Pass`.

Agregado `SAM-PRV`: `Blocked` se qualquer `SAM-PRV:*` está `Blocked`, senão `Pass`. `confirmation`/
`authorization` = `{ source, date }`; `source` é URL de doc Samsung ou referência a e-mail/ticket
do Samsung Content Manager — nunca segredo.

## 5. Kit (`kit.mjs`)

`checkKit({ manifest, readFile })`, um resultado por item do manifest, e `INT-KIT-SECRETS`:

- `status: 'Not Applicable'` exige `naReason` não vazio, senão `Blocked`. `Pending` permanece `Pending`.
- `Pass` declarado só é mantido se todas as verificações abaixo passam; qualquer falha vira `Blocked`:
  - todo artefato existe (`readFile` ≠ `undefined`) e `sha256` confere;
  - `SAM-KIT-SHOTS`: **exatamente 4** artefatos, cada um JPEG (`inspectJpeg` ≠ null), tamanho
    `< 500000` bytes, dimensão 1280×720 ou 1920×1080;
  - `SAM-KIT-LOGO`: PNG com `hasAlpha` (colorType 4 ou 6, ou chunk `tRNS`);
  - `SAM-KIT-ICONBG`: PNG ou JPEG legível.
- `inspectJpeg`: começa por `FFD8`; percorre segmentos (`FF xx` + comprimento BE) até um SOF
  (`C0–C3, C5–C7, C9–CB, CD–CF`); altura em `+5`, largura em `+7`. Não decodifica a imagem.
- `inspectPng`: assinatura de 8 bytes, IHDR em seguida; largura/altura BE; colorType no byte 25.
  CRC não é conferido.
- `INT-KIT-SECRETS`: `findSecrets` sobre todo artefato textual (`.md`, `.txt`, `.json`, `.html`,
  `.csv`) **e** o próprio manifest serializado. Algum padrão → `Blocked`, `paths` = artefatos,
  `detail` = nomes dos padrões. Padrões mínimos: `xtream-credential-url`
  (`username=…&password=…`, `/live|movie|series/<u>/<p>/`), `credential-query` (`password=` / `pass=`
  / `token=` com valor), `hex32-key` (32 hex isolados — chave TMDB v3), `bearer-token`, `jwt`,
  `private-key-block` (`-----BEGIN … PRIVATE KEY-----`). Extensão `.p12`/`.pfx`/`.pem` no kit →
  `Blocked`. O trecho nunca entra no resultado.

## 6. Decisão (`decision.mjs`)

`decideLaunch({ results, matrix })`:

1. Para cada item de `CHECKLIST` sem resultado → conta como `Pending` (SC-001: nada implícito).
2. Item de ID dinâmico: `SAM-*` herda `klass:'samsung'`, `INT-*` herda `internal`, ambos bloqueadores e
   não dispensáveis.
3. Um item bloqueador é **impeditivo** se: `Blocked`; `Pending`; `Waived` em item `waivable:false`
   (todo `SAM-*`, `INT-EVD-TV` etc.); `Waived` sem `owner` ou sem `justification`.
   `Pass` e `Not Applicable` nunca impedem.
4. `approvedTargets` = entradas da matriz com `state:'allowed'`, `environment:'tv'` e `evidence` não vazio.
   Matriz sem nenhum aprovado → acrescenta `'TARGET-MATRIX'` aos `blockers`.
5. `decision = blockers.length === 0 ? 'Ready for submission' : 'Blocked'`. `blockers` = IDs, na ordem
   do `CHECKLIST`, depois os dinâmicos.

## 7. CLI (`release-gate.mjs`)

```
node scripts/release/release-gate.mjs --variant base|commercial [--wgt <caminho>]
```

1. Lê `git rev-parse HEAD` e `git status --porcelain` (repo inteiro) → `describeCandidate`.
2. Lê o `.wgt` (padrão `CCPlayTv/.buildResult/CCPlayTv.wgt`) com um leitor zip mínimo
   (`wgt.mjs`: diretório central + `zlib.inflateRawSync`; sem dependência nova). SHA-256 do arquivo
   e de cada entrada; `config.xml` de dentro do pacote (não o do disco) alimenta `checkPackage`.
3. Lê `author-signature.xml` de dentro do pacote; `crypto.X509Certificate` dá `issuer` e
   `fingerprint256` do certificado de autor (público). `SAM-SEC-AUTHOR`: emissor `Tizen Developers CA`
   → `Blocked` (só instala em emulador); com `published.authorCertSha256` → igual ou `Blocked`; primeira
   versão → `Pass` registrando o fingerprint.
4. `INT-SEC-CUSTODY`, `SAM-REG-*`, `INT-EVD-*`, `INT-UPD-PRESERVE`, `SAM-KIT-*`: lidos de
   `release/samsung/` (data-model.md). `INT-EVD-*` sem arquivo de evidência → `Pending`.
5. `INT-DIST-VARIANT`: `distribution.json` lista uma só variante por Tizen ID; a pedida fora da lista →
   todo o relatório marcado "variante fora da distribuição atual" e `INT-DIST-VARIANT` `Not Applicable`
   com motivo (FR-002).
6. Grava `release/samsung/reports/<version>-<variant>.json` e `.md` (sobrescreve; o diff do git é o
   histórico). Antes de gravar, compara com o JSON anterior (`compareWithPrevious`) e, se obsoleto,
   registra as razões no topo do `.md`.
7. Sai com código 0 em `Ready for submission`, 2 em `Blocked`. Nunca autentica nem envia nada (FR-015).
