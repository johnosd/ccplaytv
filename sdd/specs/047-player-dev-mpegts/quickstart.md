# Quickstart — 047-player-dev-mpegts

## Pré-requisitos

- `tv-web/` com dependências instaladas (`npm install`, inclui `mpegts.js` como devDependency).
- `.env` na raiz com `CCPLAY_PROBE_DNS/USER/PASS` (nunca impresso; só o spike e o script real o leem).
- Chrome instalado é desejável (R-002).
- `ffmpeg` no PATH só para regenerar `e2e/fixtures/canal-teste.mpegts`.

## Checagens automatizadas

```powershell
cd tv-web
npm run lint; npx tsc --noEmit; npm test
npx vitest run src/lib/player/devDemux.player-dev-mpegts.contract.test.ts src/lib/player/htmlVideoAdapter.player-dev-mpegts.contract.test.ts
npm run build                     # roda o verificador de bundle
node scripts/check-no-demux-in-build.mjs   # sozinho, depois do build
# em outro terminal: npm run dev (reiniciado)
npm run test:e2e                  # inclui player-dev-mpegts.mjs; 3 execuções seguidas (SC-005)
cd ..; .\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 047-player-dev-mpegts
```

## Cenários

1. **Spike (US1)** — `node e2e/spike-mpegts-real.mjs`; imprime só contagens (amostrados × decodificaram vídeo+áudio) e se o navegador do E2E decodifica H.264/AAC. Registrar em `spike.md` e decidir seguir/parar.
2. **Canal no dev (US2)** — `npm run dev`, abrir a lista real, abrir um canal ao vivo: chega a "tocando" em ≤ 15 s (SC-002); trocar de canal 10 vezes (OK/↑/↓/CH±): nenhuma conexão residual (SC-003, medida pelo script real); RETURN fecha sem som.
3. **Codec não suportado (US2/AC4)** — canal com HEVC/AC3: tela `PLAY-04` com as mesmas ações.
4. **Produção intacta (US3)** — `npm run build`: lista de arquivos igual a `baseline.md`; verificador verde; `grep` manual por `mpegts` em `dist/` vazio.
5. **Sem vazamento** — console da página e saída dos scripts sem host, usuário ou senha (FR-010).

## Pre-acceptance (constituição)

- E2E (`npm run test:e2e`) verde antes de pedir qualquer passada em TV física. Esta feature **não** pede passada na TV e **não** declara reprodução provada — só o AVPlay prova (FR-011).
