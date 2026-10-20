# Quickstart: validação do foco leve na TV

O inventário de `tv-focus` que estava no fim deste arquivo (2026-10-18) foi movido para
`evidencias/inventario-tv-focus.md`.

## Pré-requisitos

- Dependências de `tv-web` instaladas; `npm run dev` no ar para o E2E.
- Trabalho da 082 commitado antes de tocar `PerfOverlay.tsx` (R-006).
- TV QN50Q60DAGXZD na rede, Developer Mode com o IP do PC, perfil `ccplay_samsung_certificate_4`.
- **Autorização do usuário antes de cada instalação** (sonda ou app). Nunca desinstalar o CCPlayTV nem apagar dados.

## Checagens automatizadas (de `tv-web/`)

```powershell
npx vitest run src/styles/foco-leve-tv.contract.test.ts      # contrato: 1/1
npx vitest run src/styles src/components/focoDeEstado.test.tsx src/components/PosterArt.test.tsx
npm run lint
npx tsc -b
npm run test
npm run build
npm run test:e2e                                               # com o dev server no ar, antes da TV
```

Da raiz: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 083-foco-leve-tv`.

## Sonda (gate SC-001/SC-002)

Da raiz, com autorização:

```powershell
node .\sdd\specs\082-orcamento-armazenamento-tv\sonda-tv\coletor.mjs <ip-da-tv>        # outro terminal
.\sdd\specs\082-orcamento-armazenamento-tv\sonda-tv\instalar-sonda.ps1 -App app2 -AppId ccpSondaV2.Capacidades -Only foco083
# ao terminar:
C:\tizen-studio\tools\ide\bin\tizen.bat uninstall -p ccpSondaV2.Capacidades -t QN50Q60DAGXZD
```

Ler, por classe: fps, pior quadro, quadros > 50 ms. Aceite: a receita final com ≥ 50 fps e 0 quadros > 50 ms, medida
na mesma sessão que `f-full` (082) e `f-app` (receita antiga do app). Rolagem: só registro.

## App real (registro SC-006, inspeção SC-005)

1. Instalar o build de medição (`VITE_CCPLAY_PERF=1`) pela skill `tizen-tv`, preservando dados.
2. Grade da vitrine de Filmes e uma fileira da tela de Filmes: navegar por várias linhas; anotar fps, pior quadro e
   quadros > 50 ms do painel.
3. Inspeção a ~3 m: capas claras, escuras e saturadas; primeiro/último card; troca rápida; movimento reduzido ligado
   em Ajustes; um único foco visível, sem brilho preso, sem corte.
4. Uma superfície de cada família (linhas do Live/guia, botões/chips, campo de texto, player): foco visível, SELECT e
   RETURN como antes.
5. Reinstalar o pacote normal (avisando).

## Evidências desta execução (2026-10-19)

- Linha de base: `evidencias/baseline-automatizada.txt`; ensaio no PC (diagnóstico): `evidencias/sonda-ensaio-pc.md`.
- Gate (TV): `evidencias/sonda-candidatas-tv-2026-10-19.md` — C1 51 fps e 0 quadros > 50 ms nas duas rodadas.
- Inspeção e app real (TV): `evidencias/inspecao-tv-2026-10-19.md`; superfícies no navegador: `evidencias/matriz-superficies.md`.
- Para repetir uma medição na TV, use a skill `tizen-sonda`.

## Aceite

- Sonda: ≥ 50 fps e 0 quadros > 50 ms para a receita final (navegador/emulador nunca aprovam).
- Visual: foco identificável a distância em todas as famílias, sem efeito preso, sem corte, estados disabled/loading/
  empty/error distinguíveis.
- Evidência separada por superfície: automatizada, navegador (diagnóstico), sonda na TV (gate), app real na TV (registro).
