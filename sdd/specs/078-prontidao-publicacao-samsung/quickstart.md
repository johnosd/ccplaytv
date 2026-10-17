# Quickstart — verificação da feature 078

Nada aqui faz login, upload ou submissão no Seller Office (FR-015). Nenhum passo pode colar
credencial, URL de lista, chave ou trecho do `.wgt` em relatório, commit ou chat.

## 1. Pré-requisitos

- Tizen Studio CLI (`C:\tizen-studio\tools\ide\bin\tizen.bat`) e perfil de assinatura Samsung ativo
  (ver skill `tizen-tv`, "O certificado"). Author `CN=Tizen Developers CA` não serve.
- Árvore limpa na revisão do candidato (`git status --porcelain` vazio).
- Para o build comercial: `.env.commercial` válido (`npm run build:tizen:commercial` recusa sem ele).

## 2. Checagens automatizadas

```powershell
cd tv-web
npx vitest run scripts/release           # contratos + testes adicionais
npx vitest run scripts                   # nada do pacote Tizen regrediu
npm run lint
npm run test
npm run build:tizen                      # sync-tizen agora também recusa entrada obsoleta em files:
cd ..
powershell -NoProfile -File .\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 078-prontidao-publicacao-samsung
```

E2E (gate da constitution; não há UI nova, mas o pacote mudou): `npm run dev` em outro terminal e
`npm run test:e2e`. O resultado vira `release/samsung/evidence/e2e-<data>.json`.

## 3. Gerar e conferir o candidato

```powershell
$tizen = "C:\tizen-studio\tools\ide\bin\tizen.bat"
Remove-Item .\CCPlayTv\.buildResult -Recurse -Force -ErrorAction SilentlyContinue
& $tizen build-web -e "Debug/*" -- "$PWD\CCPlayTv"
& $tizen package -t wgt -s <perfil> -- "$PWD\CCPlayTv\.buildResult"
cd tv-web; node scripts/release/release-gate.mjs --variant base; cd ..
```

Esperado no primeiro run real: decisão `Blocked`, com `SAM-KIT-*` `Pending` (artes/textos ainda não
fornecidos), `INT-EVD-TV` `Pending`, e **nenhum** bloqueio em `SAM-PKG-FILES`, `SAM-CFG-APIVERSION`
(`8.0`), `SAM-CFG-TITLE` (`CCPlayTV`), `INT-PKG-INVENTORY`, `INT-PKG-RELEASE`, `SAM-PRV`.
Conferir no `.md` gerado: revisão, versão, SHA-256 do `.wgt` e ausência de qualquer segredo.

Prova de obsolescência (SC-009): mudar a versão em `config.xml` sem reempacotar e rodar de novo → o
relatório acusa divergência entre `config.xml` do disco e do pacote e marca o anterior como obsoleto.

## 4. TV física de referência (gate obrigatório desta feature)

Seguir a skill `tizen-tv` com o `.wgt` candidato, **sem desinstalar**:

1. Com a versão anterior instalada e dados de uso criados (1 lista fictícia, 1 favorito, 1 item no
   histórico, 1 posição de retomada), instalar o candidato por cima (mesmo certificado).
2. Abrir o app: lista, favorito, histórico e retomada continuam lá (FR-007, SC-007).
3. Roteiro curto: splash → perfis → Live TV (zapear 2 canais) → Filmes (abrir detalhe, reproduzir
   10 s) → Séries (1 episódio) → RETURN em cada camada até sair.
4. Registrar `release/samsung/evidence/tv-<data>.json` com modelo, firmware (Configurações →
   Suporte → Sobre esta TV), data, quem viu, resultado e limitações; e a linha correspondente em
   `target-matrix.json`.

Instalar com certificado diferente deve falhar — não "resolver" desinstalando.

## 5. Emulador

Skill `tizen-emulator`. Hoje bloqueado (`118, -4 Operation not allowed`). Se continuar bloqueado,
registrar `INT-EVD-EMULATOR` como `Waived` com dono e justificativa — é o único gate de ambiente
dispensável; navegador e emulador nunca substituem `INT-EVD-TV`.

## 6. Política de privacidade

Depois do merge em `main` (o workflow `bridge-pages.yml` publica `bridge/`):

```powershell
curl.exe -sI https://johnosd.github.io/ccplaytv/privacidade/ | Select-String "HTTP/"
```

Esperado `HTTP/2 200`; página em pt/en/es, sem script de terceiro, cookie ou analytics.

## 7. Itens manuais do Seller Office (registrados, não automatizados)

- Conferir que o nome de pacote não colide (`published.json.packageNameChecked`).
- Depois de registrar o app: anotar o App ID em `published.json.appId`.
- Ao submeter: a pessoa copia título/descrições/URL/VOC do kit e anexa as mídias de `kit/media/`.
