# Assessment Problem: Home — carregamento progressivo e ordem visual das fileiras

- **Slug**: home-carregamento-progressivo-ordem-visual-das
- **Criado**: 2026-10-16
- **Explora**: ./explora.md

## Problem Statement

Ao abrir uma lista, a Home fica parcialmente utilizável enquanto consultas
independentes resolvem; o usuário vê placeholders e o hero/fileiras aparecem
em momentos diferentes, dando a impressão de carregamento fora de ordem. A
experiência não comunica uma sequência previsível de cima para baixo nem um
momento claro em que a Home está pronta para uso.

## Usuários / Partes Afetadas

- **Pessoa que acabou de abrir uma lista** — espera após a entrada e vê uma
  Home incompleta, especialmente hero e itens de retomada.
- **Pessoa que usa “Continuar assistindo”** — pode ver essa fileira depois de
  fileiras inferiores ou só quando o histórico termina de resolver.
- **Pessoa que navega com o controle remoto** — pode encontrar linhas que
  entram, desaparecem ou deslocam o conteúdo enquanto o foco e a posição
  vertical ainda estão sendo estabelecidos.
- **Dono do produto** — precisa de uma primeira impressão que pareça pronta,
  sem esconder lentidão real nem inventar conteúdo.

## Goals

- Tornar previsível a entrada na Home, priorizando o billboard e as fileiras
  superiores na ordem visual definida.
- Evitar que fileiras inferiores apareçam antes das superiores ou que a tela
  “pule” conforme consultas terminam.
- Manter um estado carregando honesto e focável, sem iniciar reprodução ou
  bloquear indefinidamente a navegação.
- Medir o tempo real na TV e separar tempo de dados locais, metadados, imagens
  e renderização antes de escolher o limite de composição.

## Non-Goals

- Reordenar o produto ou criar novas fileiras, recomendações ou conteúdo
  editorial.
- Fazer a Home baixar o catálogo inteiro, capas ou metadados de forma eager.
- Alterar a ordem funcional já definida em `HOME_ROW_ORDER` sem decisão de
  produto separada.
- Tratar o navegador, os testes locais ou a TV como evidência intercambiável.
- Corrigir o carregamento de Filmes/Séries fora da Home; esse precedente serve
  apenas como referência de experiência.

## Success Metrics

- Medir p50/p95 na TV de referência para: entrada → billboard focável; entrada
  → primeira fileira superior; entrada → Home estável sem novas fileiras
  inseridas. A linha de base deve ser registrada antes da implementação.
- Em uma amostra definida de aberturas com lista real, zero ocorrência de uma
  fileira inferior ser exibida antes de uma fileira superior já disponível.
- Após a composição inicial, zero mudança estrutural de ordem ou deslocamento
  vertical provocado apenas pela chegada tardia de uma consulta.
- O primeiro controle focável deve existir durante o carregamento e o foco
  deve permanecer navegável; SELECT/RETURN continuam funcionando.
- A solução não deve aumentar em mais de 20% o p95 de tecla → foco durante a
  carga, medido no mesmo aparelho e cenário.

## Cost of Inaction

Cada abertura de lista começa com uma primeira impressão incompleta e exige
que a pessoa espere para descobrir se a Home realmente carregou. Fileiras que
entram fora de ordem reduzem a previsibilidade da navegação e podem fazer o
usuário interpretar dados atrasados como ausência de histórico, favoritos ou
conteúdo. O custo é recorrente em toda entrada, embora a magnitude temporal
exata ainda precise ser medida na TV.
