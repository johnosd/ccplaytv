# Quickstart — 051 Detalhe do filme V14

## Pré-requisitos

- `npm run dev` na porta 5173 (de `tv-web/`); E2E têm `localhost:5173` fixo.
- Uma lista ativa com filmes; para Elenco/Semelhantes, chave TMDB configurada (Configurações › Integrações & BYOK). Credenciais de teste real vêm do `.env` da raiz (`CCPLAY_PROBE_*`), nunca expostas.

## Checagens automatizadas (de `tv-web/`)

```powershell
npx vitest run src/features/movies src/features/vod src/features/series
npx tsc -b
npm run lint
npm run build
npm run test:e2e
```

Da raiz: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug <slug>` para 035, 050, 049, 046, 025 — todas íntegras.

## Cenário ponta a ponta

1. Abrir Filmes → um filme **com** backdrop: capa grande de ponta a ponta, texto legível.
2. Um filme **sem** backdrop: pôster nítido sobre superfície, sem área vazia.
3. Foco em "Marcar como assistido" → OK: "✓ Assistido" aparece, rótulo vira "Desmarcar assistido", foco fica no botão. Desmarcar: selo some.
4. Aba Elenco: cartões com foto/nome/personagem; artista sem foto mostra iniciais; OK abre a pessoa; Voltar restaura aba e cartão.
5. Aba Semelhantes: só os títulos presentes no catálogo mostram "✓ Na sua lista"; OK num presente abre o detalhe local; num ausente abre o resumo.
6. Sem chave TMDB: Semelhantes mostra "Configurar TMDB" focável; Elenco mostra estado vazio.
7. Detalhe de **série**: idêntico ao de antes (captura de T002).

## Cross-cutting (constitution)

- Todo estado tem elemento focável; focar nunca inicia reprodução nem consulta externa.
- Nenhum segredo em UI/log/erro.
- Nenhuma cor/raio/espaçamento/fonte hardcoded (`grep` no bloco novo de `vod.css`).

## TV física (recomendação)

Legibilidade do texto sobre a capa, fluidez da rolagem do hero → abas → fileiras, foto/pôster carregando na rede real.
