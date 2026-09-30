# Quickstart — 030-epg-dados-agora

## Pré-requisitos

- `tv-web/`: `npm install` feito; `npm run dev` rodando em
  `http://localhost:5173` para os roteiros E2E.
- `.env` na raiz do repositório com `CCPLAY_PROBE_USER`, `CCPLAY_PROBE_PASS`,
  `CCPLAY_PROBE_DNS` (painel Xtream real) e, opcional, `CCPLAY_PROBE_EPG`
  (XMLTV externo). **Os valores são lidos em tempo de execução e nunca
  copiados** para arquivo versionado, log, commit, spec ou prompt.

## Checagens automatizadas

```powershell
cd tv-web
npx vitest run src/lib/epg src/features/live/LiveScreen.epg-dados-agora.contract.test.tsx   # contratos (5)
..\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 030-epg-dados-agora           # trava íntegra (rodar da raiz)
npx tsc -b
npm run lint
npm run test
npm run build:tizen      # deve listar assets/epgWorker.js no tizen_web_project.yaml
npm run test:e2e         # inclui e2e/epg-dados-agora.mjs (fixture fictícia)
node e2e/epg-dados-agora-real.mjs   # dados reais do .env — fora do test:e2e (depende de rede)
```

## Cenário ponta a ponta (navegador, dados reais)

1. Adicionar a lista Xtream do `.env` (Adicionar lista → provedor).
2. Ao concluir a importação, sem tocar em nada: Configurações › Fontes IPTV
   mostra "Sincronizando EPG" e depois "EPG vinculado" (US1/AC1, US2/AC2).
3. TV ao vivo → entrar numa categoria de canais abertos: canais com id de EPG
   mostram o programa atual + barra; canais sem id, slot vazio (US1/AC1-2).
4. Focar um canal: preview com "Agora" (título, horário, progresso, sinopse)
   e "A seguir" (US3).
5. Assistir: a banda do player mostra o programa; ↑/↓ troca de canal e a
   banda acompanha (US4/AC1).
6. OK sobre o vídeo (zapping): a lista por cima mostra o "Agora" (FR-024).
7. Home → rail "Canais favoritos" (favoritar 1–2 canais antes): programa
   atual nos cards (US4/AC3).
8. Configurações › EPG: deslocamento +1 h → voltar à TV ao vivo, horários
   deslocados sem novo download (US2/AC4); voltar a 0.
9. Informar endereço inválido (`abc`) → erro no campo, foco preservado
   (FR-018). Informar `CCPLAY_PROBE_EPG` (digitando a partir do `.env`, sem
   colar em lugar nenhum) → sincroniza ou mostra `EPG-02` com motivo; o
   catálogo continua intacto (US2/AC3). Limpar o campo → volta ao painel.
10. Desativar EPG → confirmar → slots vazios, estado "EPG desativado"; Ativar
    → volta (US2/AC5).
11. DevTools › Network/Console durante todo o roteiro: nenhuma URL com
    credencial em console; nenhuma requisição de EPG disparada ao mover o
    foco (FR-029).

## Cenário offline

Com EPG vinculado, desligar a rede (DevTools › Offline), recarregar, abrir a
lista: "Agora" continua aparecendo (US1/AC5); nenhuma tela bloqueia.

## Fonte antiga (FR-007)

Numa fonte importada antes desta feature (ex.: banco do navegador de uma
sessão anterior): escolher a lista → importação silenciosa em segundo plano
(migração única) → em seguida EPG sincroniza → entrar numa categoria mostra o
"Agora" sem ação extra.

## Passada na TV física (recomendada, não gate)

`tizen-tv`: repetir 2–7 na QN50Q60DAGXZD. Observar: navegação por setas
fluida **durante** a sincronização (SC-002); `assets/epgWorker.js` carregou
(sem cair no plano B — conferir com `sdb dlog`/Web Inspector);
`DecompressionStream` com um `.xml.gz` (R-007); a URL externa do `.env` a
partir da rede de casa (R-001).

## Itens cross-cutting da constitution

- Revisão de segredos antes do commit: `SourceView` sem URL; nenhum
  `logger`/`console` com erro cru de EPG; `epgManualUrl`/`epgDeclaredUrl`
  fora de toda tela (inclusive `aria-label`).
- Todo estado da tela de EPG com elemento focável; RETURN devolve foco ao
  botão "EPG".
