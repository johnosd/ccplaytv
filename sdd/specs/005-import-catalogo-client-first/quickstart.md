# Quickstart — 005-import-catalogo-client-first

## Pré-requisitos

- App instalado na TV de referência (QN50Q60DAGXZD) pelo procedimento de
  `.claude/skills/tizen-tv/SKILL.md`.
- **O backend deve estar DESLIGADO** na maior parte deste roteiro — é o
  ponto da feature. Só o Cenário F o liga de novo, para confirmar que o
  caminho congelado não quebrou.
- Uma fonte de provedor real com credenciais válidas e uma URL M3U real
  grande. Os valores ficam em `docs/m3u/dados.md`, que é gitignored —
  nunca copiar para comando, log, commit ou este arquivo.
- A TV **não entrega console** (acesso privilegiado negado, log da
  plataforma vazio, inspeção remota fechada). Toda medição é lida **na
  própria tela** do app, pela superfície de diagnóstico da US1
  (`research.md` R5).

**Cuidado ao ler a Home**: se você tiver acabado de rodar a suíte do
backend, o banco dele acumula fontes de teste — mas elas não aparecem
aqui, porque as telas já leem do aparelho. Se aparecerem, é sinal de que
alguma tela ainda está lendo do backend.

## Checagens automatizadas

```powershell
cd tv-web
npx tsc -b
npm run lint
npx vitest run
npm run build:tizen

# Backend: não muda nesta feature — roda só para provar que não quebrou
cd ..\api
uv run ruff check .
uv run pytest
```

## Cenário A — O gate de performance (US1)

**É este cenário que decide se a feature continua.** Roda antes de
qualquer tela deixar de usar o caminho atual.

1. Abrir a superfície de diagnóstico e apontar para a **fonte de
   provedor** real.
2. Executar e ler na tela: tempo total, entradas lidas, canais gravados,
   e o indicador de memória se o aparelho expuser.
3. **Esperado (SC-003)**: conclui em até **30 segundos**.
4. Repetir com a **URL M3U grande**.
5. **Esperado (SC-004)**: conclui em até **2 minutos**.
6. Durante as duas execuções, pressionar direções no controle a cada
   poucos segundos.
7. **Esperado (SC-005)**: o foco responde em até ~200 ms e nunca fica
   preso; **(SC-006)** o app não fecha, não recarrega e não perde o
   catálogo anterior.

**Se qualquer meta reprovar**: registrar os números observados e
**parar** (FR-022). Não seguir para as demais stories. As opções a
apresentar, com o custo de cada uma, são:

- Reduzir ainda mais o que é lido (ex.: interromper a leitura do M3U
  assim que as categorias de canal terminarem, quando a fonte agrupa por
  tipo).
- Manter o caminho por backend para fonte por URL grande, deixando
  client-first só para provedor — a ADR-008 já prevê esse contorno.
- Processar entre sessões, importando em partes ao longo de várias
  aberturas.
- Revisitar a ADR-008 se nenhuma das anteriores servir.

## Cenário B — Fonte de provedor, ponta a ponta sem backend (US2)

1. Com o backend desligado, cadastrar uma fonte por endereço, usuário e
   senha.
2. **Esperado**: a importação acontece e conclui usando só o aparelho.
3. Abrir a lista de canais.
4. **Esperado (SC-010)**: os grupos são as categorias que o painel
   declara, com os mesmos nomes e na ordem do painel.
5. Selecionar um canal e reproduzir.
6. **Esperado (SC-001)**: toca — a troca de arquitetura não pode regredir
   a reprodução validada nas features 003 e 004.
7. Fechar e reabrir o app; abrir a lista de novo.
8. **Esperado**: o catálogo continua lá, sem nova importação e sem
   nenhuma consulta ao provedor (SC-007, em até 3 s).

## Cenário C — Fonte por URL grande (US3)

1. Com o backend desligado, cadastrar a URL M3U real.
2. **Esperado**: conclui dentro da meta e grava **apenas canais**.
3. Conferir que a tela **não** apresenta o resultado como catálogo
   completo da fonte — filmes e séries foram lidos e descartados de
   propósito, e isso precisa estar dito, não escondido.
4. Rolar a lista de canais até o fim.
5. **Esperado (SC-008)**: sem travamento perceptível nem perda de foco.
6. Fechar o app no meio de uma importação e reabrir.
7. **Esperado**: o catálogo anterior continua utilizável e nada parcial
   aparece como pronto.

## Cenário D — Catálogo em dia sem servidor (US4)

1. Abrir uma fonte recém-importada.
2. **Esperado (SC-011)**: nenhuma consulta ao provedor é disparada.
3. Envelhecer a marca de sincronização da fonte além do prazo e abrir de
   novo.
4. **Esperado**: a atualização começa sozinha em segundo plano, e o
   catálogo atual continua navegável.
5. Enquanto essa atualização termina, estar navegando a lista.
6. **Esperado (SC-012)**: a lista não salta e o item em foco continua em
   foco.
7. Usar a ação de ressincronizar na Home.
8. **Esperado**: atualiza na hora, sem esperar prazo.
9. Forçar uma falha (derrubar a rede no meio).
10. **Esperado**: o catálogo anterior permanece intacto e a marca de
    última sincronização **não** avança.

## Cenário E — Provedor que recusa conexão direta (US5)

1. Apontar uma fonte para um endereço que recuse a conexão direta do
   aparelho.
2. **Esperado**: o app explica que aquele provedor não aceita conexão
   direta deste aparelho — distinguindo de "sem internet" e de "senha
   errada".
3. **Esperado**: há pelo menos um elemento focável nessa tela; o controle
   não fica preso.

**Se não houver um provedor assim disponível**, registrar como **não
observado** — nunca inferir. O comportamento continua coberto por teste
automatizado, o que é evidência de unidade, não de aparelho.

## Cenário F — O caminho congelado continua de pé (FR-021)

1. Ligar o backend de novo.
2. Rodar `uv run pytest` em `api/`.
3. **Esperado**: tudo passa, sem alteração de comportamento — nenhuma
   task desta feature deveria ter tocado em `api/` (D-007).

## Checklist cross-cutting (constitution)

- [ ] Nenhuma senha, usuário ou endereço completo de servidor aparece em
      tela ou em diagnóstico — num ciclo de sucesso **e** num de falha
      (SC-009).
- [ ] As categorias exibidas são as da fonte, em nome e ordem (SC-010).
- [ ] Todo estado novo (importando, não coube inteiro, provedor recusou)
      continua navegável por controle remoto, sem prender o foco.
- [ ] Nenhum percentual inventado: sem denominador confiável, indicação
      indeterminada com contagem real.
- [ ] A limitação de importar só canais está **declarada** na interface,
      não implícita.
- [ ] Reproduzir um canal continua funcionando (SC-001).
- [ ] Nenhum dado de `docs/m3u/dados.md` foi copiado para código, teste,
      commit ou documento.
- [ ] A superfície de diagnóstico da US1 foi **removida** antes de
      considerar a feature concluída (`research.md` R5).
