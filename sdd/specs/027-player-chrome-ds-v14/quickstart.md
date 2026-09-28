# Quickstart: Player chrome V14 (feature 027)

## Pré-requisitos

- `tv-web/` com dependências instaladas (`npm ci`).
- Dev server rodando para E2E: `npm run dev` (reinicie se estiver de pé há
  horas — ver nota da feature 022).
- Uma lista com pelo menos: uma categoria de canais com 3+ canais, um
  filme, uma série com 2+ temporadas (as fixtures `tv-web/e2e/fixtures/*.m3u`
  servem para o navegador).
- Para a passada na TV física: skill `tizen-tv` (TV QN50Q60DAGXZD na rede)
  e o controle **original** Samsung, com teclas de mídia e CH±.

## Checagens automatizadas

```powershell
cd tv-web
npx vitest run src/components/PlayerLayer.player-chrome.contract.test.tsx   # 5/5
npx vitest run src/components/PlayerLayer.ciclo-vida-player.contract.test.tsx # 4/4 (020, não pode quebrar)
npm run test
npx tsc -b
npm run lint
npm run build
npm run build:tizen      # guarda de arquivos emitidos (findUnlistedFiles)
cd ..
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 027-player-chrome-ds-v14
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 020-ciclo-vida-player
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 024-live-tv-ds-v14
```

E2E (com `npm run dev` no ar; `executablePath` Linux precisa de override
local no Windows, como nos demais scripts):

```powershell
cd tv-web
node e2e/player-chrome.mjs
node e2e/zapping-live-tv.mjs
node e2e/ciclo-vida-player.mjs
node e2e/filmes-series-ds-v14.mjs
node e2e/live-tv-ds-v14.mjs
npm run test:e2e
```

## Cenário ponta a ponta (navegador)

1. **Filme**: abrir um filme → chrome com título, tempo, timeline, ⏪ ▶⏸ ⏩
   e os mocks Áudio/Qualidade/Velocidade/Aspecto/Info. Foco em ▶⏸.
   Esperar 5 s → some. ↓ → volta sem ação. → com o chrome escondido → salta
   10 s e aparece. Pausar → não some em 30 s. Focar "Velocidade" + OK →
   toast "Em breve — …", reprodução inalterada.
2. **Episódio**: abrir o 1º episódio → série, `T1:E1 • nome`, "Episódio
   anterior" soft disabled (OK → "Este é o primeiro episódio disponível.").
   "Próximo episódio" → toca o E2; no último da T1 → vai para a T2.
3. **Canal**: abrir um canal → faixa "AO VIVO", número, logo, nome; nenhum
   botão. ↓ → troca para o seguinte e a faixa mostra o novo. No último → "Este
   é o último canal desta lista.". OK → lista de zapping (016) intacta. → →
   linha Guia/Áudio/Qualidade/Aspecto/Info (sem Velocidade, sem ▶⏸); RETURN
   → só a linha some; RETURN de novo → sai do player com o foco da lista no
   último canal assistido.
4. **Favoritos/Todos**: abrir um canal de "★ Favoritos" → ↓ percorre os
   favoritos, na ordem exibida.
5. **Reduzir movimento** (Configurações › Acessibilidade): chrome aparece e
   some sem animação.

## Passada na TV física — **gate obrigatório** (SC-004)

Com o controle Samsung original, registrar para cada tecla: chega ao app?
qual `event.key`/`keyCode`? ação correta?

| Tecla | Filme | Episódio | Canal |
| --- | --- | --- | --- |
| Play/Pause | alterna + chrome + foco ▶⏸ | idem | só revela a faixa |
| Play / Pause (se o controle tiver separadas) | idempotentes | idem | só revela |
| ⏪ / ⏩ | ∓10 s, segurar não trava | idem | só revela |
| Stop | fecha e salva retomada | idem | fecha |
| CH+ / CH− | nada | nada | troca de canal |

Também na TV:

- `getSupportedKeys()` lista as 8 teclas? (se não, anotar quais faltam — a
  feature degrada, não quebra).
- Chrome e toast visíveis **sobre o plano de hardware** do AVPlay (R-002).
- ↑/↓ em tela cheia trocam de canal sem tela preta perceptível; troca
  rápida (5× ↓) termina no último canal pedido, sem áudio residual.
- Direção ↑ = anterior / ↓ = próximo parece natural? (R-003).
- Protetor de tela e ciclo de vida (020) continuam iguais.

Fechar a feature sem este gate completo só com decisão explícita do
usuário, registrada em `Riscos e Decisões` (constitution, "Validação em
hardware real", exceção).

## Checklist cross-cutting (constitution)

- [ ] Todo estado do chrome com controle visível tem exatamente um foco
      visível e ativável por SELECT (faixa do Live é a exceção já
      justificada — Complexity Tracking).
- [ ] Nenhuma URL/credencial em toast, rótulo ou erro.
- [ ] Nenhum dado inventado (sem "programa atual", sem resolução/bitrate
      fictícios em Info).
- [ ] Controles reais só com a capacidade real (sem busca no canal).
- [ ] Voltar do player restaura o foco no item/canal de origem por id.
- [ ] Tokens V14 apenas, ícones locais.
