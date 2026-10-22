# Assessment Problem: quadros congelados ao navegar nas telas de catálogo na TV

- **Slug**: tarefa-longa-na-leitura-categoria-gorda
- **Criado**: 2026-10-21
- **Explora**: [./explora.md](./explora.md)

## Problem Statement

Navegar entre cards e fileiras em Filmes e Séries na TV produz **quadros congelados de até ~900 ms**, e esses
congelamentos também atrasam a aparição das capas. **A causa não está identificada** — a hipótese registrada na feature
087 (uma categoria descomprimida numa tarefa única) foi conferida no código e é falsa.

## Usuários / Partes Afetadas

- **Quem navega em Filmes/Séries na TV** — o foco "trava" por meio segundo ou mais ao descer entre fileiras, e as capas
  demoram a aparecer. Relatado espontaneamente pelo usuário em 2026-10-21, sem ver medição nenhuma.
- **Quem desenvolve as próximas features de catálogo** — sem saber de onde vem o quadro longo, qualquer otimização é
  palpite, e já houve uma correção publicada sobre premissa errada (o `Resultado Final` da 087 precisa ser corrigido).
- **Quem decide escopo** — o número de ~900 ms atravessou as features 086 e 087 sem ser explicado, então aparece como
  risco em toda estimativa de desempenho e não se resolve por si.

## Goals

- **Descobrir onde está o quadro longo**, com medição no aparelho, antes de propor qualquer mudança de código.
- Separar o que é do **caminho do catálogo** do que é da **fila de segundo plano**, com o A/B que a sonda automática já
  permite (fila ligada contra desligada, mesma navegação).
- Resolver se a mediana de entrada em categoria de **627 ms** é piora real ou efeito da navegação contínua da sonda.
- Deixar o achado registrado de forma reutilizável, para a próxima feature de catálogo não repetir o palpite.

## Non-Goals

- **Não** otimizar `readHeaderChunks`, `decodeRange` nem mover a montagem do índice para o Worker **antes** de saber a
  causa. As duas ideias nasceram da hipótese refutada.
- **Não** reabrir a feature 087: ela convergiu, a regressão que ela introduziu foi medida e removida, e o que resta
  atravessa as features 082/086.
- **Não** mudar o formato de gravação do catálogo (pedaços comprimidos, feature 082) — isso tem contrato travado e custo
  de migração.
- **Não** perseguir os 1 836 quadros > 50 ms da 086 como se fossem comparáveis aos 351 desta medição: cargas
  diferentes, número não comparável.
- **Não** tratar fps mediano como problema: está em 38 nas três medições independentes, igual à referência.

## Success Metrics

Este assessment termina quando existir **uma causa nomeada com evidência do aparelho**, não quando algo for otimizado:

1. Uma medição na TV que atribua o quadro de ~900 ms a **uma** das fontes: pausa de coleta de memória, descarte do cache
   de pedaços (`CHUNK_CACHE_MAX_ITEMS = 30 000` contra 43 549 itens), leitura/decodificação do bloco, ou outra.
2. O A/B com a sonda automática: pior quadro e mediana de entrada **com** e **sem** a fila de segundo plano, no mesmo
   roteiro de duração fixa.
3. Se a causa for do catálogo: um alvo numérico para a feature que vier depois (proposta: **pior quadro abaixo de
   300 ms** ao navegar, e mediana de entrada em categoria **abaixo de 300 ms**, contra 900 e 627 de hoje).
4. Se a causa **não** for acionável a custo razoável: isso registrado, e o número de ~900 ms aceito explicitamente como
   linha de base do aparelho — não deixado como suspeita aberta.

## Cost of Inaction

**Baixo no curto prazo, e isso precisa ser dito**: a feature 086 foi entregue e aceita com pior quadro de 917 ms, o fps
mediano está estável em 38, e a piora que o usuário relatou já foi removida (era da 087, medida e corrigida). Ninguém
está bloqueado.

O custo real é de **outra natureza**: enquanto a causa não for conhecida, toda feature que tocar o catálogo corre o
risco de ser culpada por um quadro longo que não é dela — foi exatamente o que aconteceu na 087, onde eu primeiro
acusei o caminho de carga, depois descobri que metade era meu, e por fim registrei uma hipótese errada sobre o que
sobrou. Isso custa rodadas de TV, que são caras e dependem da disponibilidade do aparelho e da pessoa.
