# Validação física — T050

- **Dispositivo**: Samsung QN50Q60DAGXZD, Tizen TV, `192.168.0.2:26101`
- **Modo de conexão**: sdb pela LAN; preflight aprovado
- **Pacote normal**: build `build:tizen`, instalação e lançamento aprovados; reinstalação pelo mesmo certificado, sem desinstalação
- **Pacote de medição**: `VITE_CCPLAY_PERF=1`, instalação e lançamento aprovados
- **WGT medido**: SHA-256 `BF4151C531AF0D41960844B53D7525348AC56B41B14D5459A36DE25D914F395E`
- **Tamanho do WGT medido**: 839984 bytes

## Cenários físicos

| Critério | Resultado | Evidência |
| --- | --- | --- |
| SC-001 — armazenamento em Sobre & créditos ≤ 25% | reprovado | Usuário observou 97 MiB / 80 MiB; sonda confirmou cota de 80 MiB e `QuotaExceededError` em 82,9 MiB |
| SC-002 — primeira página dentro do limite | pendente | O número `primeiraPágina=...ms` da categoria real não foi informado; sonda sintética registrou 118 ms para 140 cartões |
| SC-003 — nenhum quadro > 100 ms | aprovado para compressão/EPG | Worker EPG: 0 quadros longos, pior intervalo 17 ms; efeitos sintéticos de backdrop blur têm custo separado |
| SC-004 — três listas e Atualizar da licença | observado sem erros | Usuário informou que os demais fluxos abriram sem erros; roteiro detalhado não foi cronometrado |
| SC-007 — Guia abre em até 3 s | aprovado | Sonda TV: Worker EPG em 1,071 s para 10.122 programas/104 canais |

## Limitações

O Web Inspector/CDP da TV não está acessível na porta 7011. A sonda confirmou a cota real, compressão, Worker e guia; o número de primeira página da categoria real ainda depende do overlay observado na TV.

## Correção aplicada após a medição

`makeRoomFor` passou a considerar a estimativa física de uso/cota ao planejar a liberação de caches refazíveis. O teste `storageBudget.reported.test.ts` cobre o caso em que o ledger está baixo, mas a TV já ultrapassou a reserva. A versão normal foi reinstalada na TV pelo mesmo certificado, preservando os dados; falta repetir a entrada em categorias para medir o efeito.

Durante essa repetição foi identificado um segundo caminho de gravação: o favorito de filme escrevia diretamente em `userStates`, sem a mesma recuperação de cota usada pelo catálogo. `userStateRepository.upsert` agora usa `withStorageRelief`, preservando a gravação de “Minha Lista” mesmo quando a primeira tentativa encontra `QuotaExceededError`. A regressão foi coberta por teste com falha de cota na primeira gravação; 44 testes de favoritos/estado passaram, `tsc` e lint passaram, e o pacote normal foi reinstalado na TV pelo mesmo certificado. A confirmação visual ainda depende de repetir “adicionar à Minha Lista” no aparelho.

## Ressalva da revisão (2026-10-19)

A revisão do código achou que o pacote medido acima gravava cada categoria **duas vezes** (bloco antigo com `items` e
pedaços comprimidos), reconstruía a projeção 065 a partir dos pedaços a cada renovação, não convertia os blocos antigos
já gravados e gravava o guia em linhas **e** em pedaços, acumulando pedaços a cada sincronização. Os 97 MiB lidos em
Sobre & créditos são dessa versão e não medem o formato comprimido. Corrigido em T054–T064 (`tasks.md`); a T050 precisa
ser repetida com o pacote novo.
