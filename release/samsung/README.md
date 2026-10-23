# Gate de publicação — Samsung TV Seller Office

Dados versionados do gate de prontidão da feature
`078-prontidao-publicacao-samsung` (spec, plano e regras em
`sdd/specs/078-prontidao-publicacao-samsung/`, em especial `logic/gate.md` e
`data-model.md`). O gate prepara e confere; **nunca** faz login, upload ou
submissão no Seller Office — isso é sempre manual.

## Regra número um: nada de segredo aqui

Nenhum arquivo desta pasta pode conter credencial de lista, URL de lista ou
de stream, chave (TMDB, OpenAI, licença), senha ou caminho do certificado.
Acesso de demonstração e backup do certificado aparecem só como **referência
sanitizada** (onde está, quem é o dono, validade). O próprio gate bloqueia o
kit se encontrar um padrão de segredo (`INT-KIT-SECRETS`). O `.wgt` não é
versionado; só o hash dele entra no relatório.

## Como rodar

```powershell
cd tv-web
node scripts/release/release-gate.mjs --variant base   # ou --variant commercial
```

Chame o `node` direto: no PowerShell, `npm run x -- --flag` perde o `--`.
Saída: `reports/<versão>-<variante>.json` e `.md`. Código de saída 0 =
`Ready for submission`, 2 = `Blocked`.

## Build comercial de loja (T054 da 078)

Variáveis só no processo (nada vai para arquivo versionado); o mapa de chaves leva **só chaves públicas** (kid → JWK ES256), nunca a privada.
O mapa vigente de produção (`prod1`) está em `sdd/specs/081-venda-producao-mercadopago/evidencias/infra.md`.

```bash
cd tv-web
VITE_PORTAL_ORIGIN=https://portal.ccplaytv.com VITE_PORTAL_SITE_URL=https://portal.ccplaytv.com VITE_LICENSE_PUBLIC_KEYS='{"prod1": <JWK pública de prod1>}' npm run build:tizen:commercial
```

Depois confira nos `.js` de `CCPlayTv/`: origem de produção presente, `x` de `prod1` presente, chave revogada `v1` ausente e nenhum campo privado `d`;
rode a guarda do pacote (`findUnlistedFiles`/`findStaleDeclared`) e empacote com `deploy-tv.ps1 -SkipBuild` (TV) ou `release-gate.mjs --variant commercial` (loja).
Último build: `c2e240c`, de `91c1f00`, em 2026-10-23.

## Arquivos

| Arquivo | Conteúdo |
| --- | --- |
| `distribution.json` | Variante distribuída para o Tizen ID e países (uma variante por Tizen ID) |
| `published.json` | O que já foi enviado/publicado: App ID do Seller Office, última versão, Tizen ID, fingerprint do certificado de autor, conferência do nome de pacote. `null` antes da primeira submissão |
| `privileges.json` | Ledger de privilégios: nível, uso por variante, autorização/confirmação |
| `target-matrix.json` | País × modelo × firmware com evidência; só `environment: "tv"` com evidência entra no conjunto aprovado |
| `custody.json` | Identidade pública do certificado de autor e onde está o backup (sem caminho secreto) |
| `evidence/` | Um JSON por gate executado (E2E, emulador, TV, atualização, privacidade), amarrado ao hash do `.wgt` |
| `kit/` | Manifest do kit, textos de listagem, rascunho da UI Description, acesso de demo sanitizado, mídias fornecidas |
| `reports/` | Relatórios gerados pelo gate (sobrescritos; o histórico é o git) |

## Mídias da loja (`kit/media/`)

- `logo_1920x1080.png` (RGBA, transparente), `fundo_1920x1080.jpg` e `icone_512x423.png`: a identidade do
  app, as mesmas de `docs/guia-praticas-app-tv/assets/`.
- `screenshot_01.jpg` … `screenshot_04.jpg` (1920×1080, < 500 kB): Filmes, TV ao vivo com guia, Séries e
  Portal & licença com o preço (a Samsung pede o preço numa captura de app com compra). Gerados do app real
  **comercial** no navegador, com catálogo, capas, logos, portal e licença **fictícios** (nenhuma lista real, marca
  ou pôster de terceiros; o domínio do portal aparece, mas nenhuma chamada chega à produção):

  ```powershell
  cd tv-web   # sem servidor no ar: o roteiro sobe o app comercial numa porta própria
  node scripts/release/store-screenshots.mjs --out <pasta-temporária>   # revise as 4 imagens
  ```

  Sem `--out`, grava direto em `kit/media/`. Refaça a cada versão com mudança visual; trocar uma imagem exige
  recalcular o SHA-256 dela no `manifest.json` (o gate bloqueia hash divergente).

## UI Description (`kit/ui-description/`)

O template oficial da Samsung preenchido em inglês (`CCPlayTV_UI_Description_<versão>.pptx`), as capturas por
tela (`ui_NN_*.jpg`, do build de produção com a lista fictícia) e o template original. Como refazer e o passo
da lista de teste — que só entra numa **cópia fora do git**, na hora do envio — estão em `kit/ui-description.md`.
