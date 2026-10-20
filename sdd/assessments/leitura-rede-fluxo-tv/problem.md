# Assessment Problem: Leitura de rede em fluxo mais eficiente na TV

- **Slug**: leitura-rede-fluxo-tv
- **Criado**: 2026-10-19
- **Explora**: ./explora.md

## Problem Statement

O usuário percebe demora na carga da lista em segundo plano: contagens "carregando" e categorias que demoram a ter
itens. Na TV, ler uma resposta em fluxo custou 55 % a mais que baixá-la inteira na rede local. Não se sabe quanto da
demora percebida vem dessa leitura e quanto vem da rede do provedor, da interpretação ou da gravação.

## Usuários / Partes Afetadas

- **Pessoa que abre ou atualiza uma lista grande na TV**: espera mais para ver contagens completas, categorias
  preenchidas e "Todos" coberto.

## Goals

- Separar, na TV, o tempo da carga por seção (filmes, 16,5 MB) em: download, leitura em fluxo, interpretação e
  gravação.
- Se a leitura por pedaço pesar: reduzir o custo dela sem materializar respostas grandes (respeitando D-002 do
  `m3uParser.ts`), nos três leitores (`readJsonArrayStream`, `linesFromResponse`, `textChunks`).

## Non-Goals

- Mudar o formato de gravação da 082, a ordem ou a prioridade da pré-carga (038) ou o protocolo com o provedor.
- Ler respostas grandes inteiras na memória (lista M3U de 50 MB+).
- Otimizar a gravação, se a medição mostrar que é ela o gargalo. Nesse caso vira outro item.

## Success Metrics

- **Partida**: velocidade do provedor até a TV (Teste de conexão do app) e, na TV, a carga da seção de filmes da lista
  real com o tempo dividido nas etapas acima, em Worker.
- **Se virar feature**: a carga da seção de filmes na TV fica pelo menos 20 % mais rápida na velocidade real do
  provedor, com os mesmos itens gravados (testes de regressão dos três leitores, incluindo caractere multibyte partido
  entre pedaços).

## Cost of Inaction

A demora percebida continua. Mas se a causa for a rede do provedor ou a gravação, mexer na leitura não resolve nada.
Sem dividir o tempo, qualquer otimização é chute.
