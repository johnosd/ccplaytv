# Assessment Problem: Cota de armazenamento do app na TV estourando

- **Slug**: cota-armazenamento-app-na-tv-estourando
- **Criado**: 2026-10-17
- **Explora**: ./explora.md

## Problem Statement

Na TV, o app tem cerca de **80 MB** de cota no IndexedDB, mesmo com `unlimitedstorage` e mais de 1 GB livre no aparelho.
O catálogo de uma única lista grande já ocupa boa parte disso: ≈28 MB de listagens e 15 MB de EPG, antes de contar
metadados e o formato gravado. Por isso o app chega à cota com frequência. Quando chega, qualquer gravação falha,
inclusive licença, pareamento, favoritos e progresso. Nada no app limita ou mede quanto cada parte pode ocupar.

## Usuários / Partes Afetadas

- **Quem usa a TV com uma lista grande**: vê "armazenamento do app cheio" ao abrir séries e perde favoritos, progresso e
  o guia. O guia some quando a liberação de emergência o apaga.
- **Quem paga a licença**: a compra aprovada pode não chegar à TV. Isso já aconteceu na 081 (R-014).
- **Quem tem mais de uma lista**: cada lista mantém o próprio cache, então as listas competem pela mesma cota.
- **Publicação na loja (078)**: o app iria para a loja com um teto que se atinge em poucos dias de uso real.
- **Desenvolvimento**: hoje os bugfixes só contornam o problema (folga de 8 MB e liberação de emergência), sem
  orçamento nem medição por parte.

## Goals

- **Medir** quanto cada parte ocupa na TV com a lista real (`categoryBlocks`, `storedEntries`, `epgPrograms`,
  `titleMetadata`/`tmdbPeople`, `discoveryCache` e o resto), antes de escolher o que mudar.
- **Caber com folga**: a lista ativa grande, com cache completo, EPG e metadados, ocupa no máximo ~60 % da cota
  medida. Assim sobra espaço permanente para o estado da pessoa e as gravações críticas.
- **Orçamento explícito**: só a lista **ativa** mantém cache completo. As outras listas guardam só a estrutura e recarregam
  quando são ativadas, coerente com o ADR-011 (lista ativa única) e com a cobertura parcial do ADR-002.
- **Encolher o formato** do que é gravado. Candidatos, a validar com a medição:
  - montar a URL de reprodução a partir da fonte, em vez de guardá-la por item;
  - comprimir os blocos num Worker;
  - guardar o EPG só numa janela de tempo.
- **Spike do Filesystem do Tizen** (`wgt-private`): provar na TV física se gravar ali escapa da cota de 80 MB, e quanto
  custa ler e gravar. A instalação na TV só ocorre com aviso e permissão do usuário. O resultado decide se vale um ADR
  para mais espaço.
- **Prós e contras de mais espaço**, documentados para o usuário decidir com dados. O usuário pediu isso explicitamente.

## Non-Goals

- Migrar o catálogo para o Filesystem nesta feature. Se o spike provar que funciona, a migração vira um ADR e uma
  feature próprios.
- Tela de "gerenciar armazenamento" ou "liberar espaço por lista". Fica para depois, se a medição mostrar que é
  necessária.
- Apagar estado da pessoa (favoritos, histórico, progresso, PIN, listas, pareamento, licença) para ganhar espaço. Isso
  nunca é aceitável.
- Suportar no aparelho, com cache completo, um M3U avulso de ~80 MB. Esse caso segue sob demanda ou recebe uma mensagem
  honesta.
- Backend ou proxy para guardar o catálogo fora da TV, o que contraria o ADR-008.
- Mexer na cota pelo `config.xml` além do que já existe, porque não há API documentada para isso (Quota Management API:
  No).

## Success Metrics

- Com a lista real de referência ativa, a pré-carga completa e o EPG sincronizado, o uso medido na TV (Sobre &
  créditos) fica em **≤ 60 % da cota**. Hoje fica em 100 %+.
- Durante um roteiro de uso na TV, com a lista ativa e mais duas cadastradas, **zero `QuotaExceededError`**. O roteiro
  troca de lista, abre séries, favorita, assiste e faz o Atualizar da licença.
- A liberação de emergência do bugfix não é acionada no roteiro acima.
- A redução de cada mudança de formato é medida por tabela no PC (antes e depois), sem números inventados.
- O spike tem resultado registrado: `wgt-private` escapa ou não da cota, com o número gravado e lido e o tempo medido.

## Cost of Inaction

O app vai para a loja com um teto que uma lista grande atinge sozinha. A partir daí, o problema aparece como bugs
intermitentes e difíceis de suportar:
- licença paga que não chega à TV;
- favoritos e progresso que não são gravados;
- guia que some na liberação de emergência.

Cada bugfix futuro seria mais um contorno em volta do mesmo teto. O custo de reputação na loja (avaliações) e de suporte
cresce com cada usuário que tem uma lista grande, que é o público principal de um app de IPTV.
