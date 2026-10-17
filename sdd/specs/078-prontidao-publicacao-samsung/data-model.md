# Data model — feature 078

Todos os arquivos ficam em `release/samsung/` (raiz do repositório, versionados). Nenhum contém
segredo: credencial de demonstração, chave privada e senha do certificado ficam no cofre da pessoa
responsável e aparecem aqui só como **referência sanitizada** (FR-012, FR-016). O `.wgt` não é
versionado (`*.wgt` no `.gitignore`); só o hash dele entra no relatório.

```text
release/samsung/
├── README.md                # como rodar o gate, como preencher cada arquivo
├── distribution.json        # variante distribuída por Tizen ID
├── published.json           # o que já foi enviado/publicado no Seller Office
├── privileges.json          # ledger de privilégios (PrivilegeEntry)
├── target-matrix.json       # TargetMatrixEntry[]
├── custody.json             # identidade do certificado de autor + local do backup
├── evidence/                # ValidationEvidence, um JSON por gate executado
├── kit/
│   ├── manifest.json        # PublicationKitItem[]
│   ├── listing/{pt,en,es}.md
│   ├── ui-description.md    # rascunho do conteúdo para o template oficial
│   ├── demo-access.md       # DemoAccess sanitizado
│   └── media/               # artes fornecidas (logo, fundo, screenshots)
└── reports/<version>-<variant>.{json,md}   # LaunchDecision gerada pelo CLI
```

## distribution.json

```json
{ "tizenId": "8tZqMtwANL.CCPlayTv", "variant": "base", "countries": ["BR"] }
```

Uma só variante por Tizen ID (dois apps no Seller Office não podem ter o mesmo Tizen ID).

## published.json

```json
{ "appId": null, "lastPublishedVersion": null, "tizenId": null, "authorCertSha256": null, "packageNameChecked": null }
```

`null` antes da primeira submissão. `appId` é o ID do Seller Office (≠ Tizen ID). `packageNameChecked`
= `{ date, by }` da conferência manual de colisão de nome (SAM-REG-PACKAGENAME).

## privileges.json — PrivilegeEntry

```json
{
  "features": { "checkout": false, "inAppAds": false },
  "privileges": {
    "http://developer.samsung.com/privilege/productinfo": {
      "level": "public",
      "usedBy": { "base": ["lib/portal/platformProbe.ts — getDuid local"], "commercial": ["lib/portal/portalRuntime.ts — identidade do portal"] },
      "confirmation": { "source": "<URL da doc Samsung ProductInfo>", "date": "2026-10-16" },
      "authorization": null
    }
  }
}
```

## target-matrix.json — TargetMatrixEntry

```json
[{ "country": "BR", "model": "QN50Q60DAGXZD", "firmware": "<versão vista na TV>", "environment": "tv",
   "evidence": "release/samsung/evidence/tv-<data>.json", "date": "2026-10-16", "state": "allowed", "limitations": "" }]
```

## custody.json

```json
{ "authorCertSha256": "<fingerprint256 público>", "issuer": "<CN do emissor>", "backup": { "location": "<descrição sem caminho secreto>", "verifiedAt": "2026-10-16", "by": "<papel>" } }
```

Sem `backup.verifiedAt` → `INT-SEC-CUSTODY` `Blocked`.

## evidence/*.json — ValidationEvidence

```json
{ "gate": "INT-EVD-TV", "candidate": { "version": "0.3.0", "variant": "base", "wgtSha256": "<hash>" },
  "environment": "tv", "device": "QN50Q60DAGXZD", "firmware": "<versão>", "script": "quickstart.md §4",
  "result": "Pass", "date": "2026-10-16", "by": "<papel>", "limitations": "" }
```

Evidência cujo `candidate.wgtSha256` difere do candidato atual não conta (`Pending`).

Exceção — `evidence/privacy-<data>.json` (T027): a página não muda com o pacote, então não leva
`candidate`. Conta só se `url` é idêntica a `kit/manifest.json.privacyUrl`, `status` é `200` e há `date`:

```json
{ "gate": "SAM-KIT-PRIVACY", "url": "https://johnosd.github.io/ccplaytv/privacidade/", "status": 200,
  "date": "2026-10-16", "by": "<papel>", "check": "curl.exe -sI (quickstart §6)" }
```

## kit/manifest.json — PublicationKitItem

```json
{ "kitVersion": "0.3.0", "defaultLanguage": "pt", "storeTitle": "CCPlayTV", "privacyUrl": "https://johnosd.github.io/ccplaytv/privacidade/",
  "items": [{ "id": "SAM-KIT-SHOTS", "owner": "produto", "status": "Pending", "artifacts": [], "nextAction": "fornecer 4 JPEG" }] }
```

`artifacts[].path` relativo a `release/samsung/kit/`. `storeTitle` alimenta `SAM-CFG-TITLE`.

## reports/*.json — LaunchDecision

`{ candidate, results: CheckResult[], approvedTargets, decision, blockers, stale: { stale, reasons }, generatedAt }`.
