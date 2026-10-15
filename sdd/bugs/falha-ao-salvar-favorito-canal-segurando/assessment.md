# Bug Assessment: Falha ao salvar favorito de canal segurando OK

- **Slug**: falha-ao-salvar-favorito-canal-segurando
- **Criado**: 2026-10-11
- **Origem**: texto colado
- **Veredito**: valid
- **Severidade**: medium

## Report

Ao segurar OK sobre um canal, aparece “Não foi possível salvar o favorito”. Usuário pediu evitar testes extensos.

## Symptom

A ação de favoritar informa falha em vez de confirmar o favorito e atualizar a estrela.

## Reproduction

1. Abrir uma categoria de Live TV e focar um canal.
2. Segurar OK além de 800 ms.
3. Equivalente automatizado: provocar falha na consulta ao cache `seriesWatchMembers` durante a ação.

O teste existente `(b) segurar OK favorita` passou antes da correção (1 teste; 18 ignorados pelo filtro). O ambiente/dado específico da TV ainda não foi reproduzido.

## Suspected Code Paths

- `tv-web/src/features/favorites/useFavoriteToggle.ts`: traduz rejeição da mutação em aviso genérico.
- `tv-web/src/features/catalog/catalogApi.ts`: grava via `toggleFavorite` e só invalida consultas no sucesso.
- `tv-web/src/lib/catalog/userStateRepository.ts`: `upsert` confirma a transação de `userStates` e depois aguarda invalidação de cache de séries.
- `tv-web/src/lib/catalog/seriesWatchRepository.ts`: consulta auxiliar pode rejeitar depois de o favorito já estar persistido.

## Root Cause Hypothesis

Confiança alta no defeito estrutural, média na correspondência com o aparelho: uma falha na invalidação de séries rejeita a ação depois do commit do favorito. Favoritar não muda progresso nem estado de assistido; portanto essa consulta é desnecessária e pode impedir o aviso de sucesso e a atualização da estrela. Não há evidência capturada do erro interno na TV; não atribuir a ela uma exceção específica.

## Proposed Remediation

**Preferida**: permitir que `upsert` dispense a invalidação de séries ao alterar somente favorito. Manter a invalidação nas operações de progresso/assistido e propagar falhas reais de persistência.

**Files likely to change**:
- `tv-web/src/lib/catalog/userStateRepository.ts`
- `tv-web/src/features/live/LiveScreen.favorites.test.tsx`

**Tests to add or update**:
- Segurar OK com consulta de cache de séries indisponível deve confirmar favorito, persistir estado e mostrar estrela sem abrir player.
- Reutilizar cenários existentes de toque curto, segurar e alternância única.

## Risks & Considerations

- Preservar IndexedDB e identidade estável; não limpar dados nem reinstalar.
- Não engolir falhas da transação que salva o favorito.
- Testes direcionados somente, conforme pedido. Confirmação na TV permanece separada.

## Open Questions

- Sem bloqueio para corrigir o acoplamento; causa específica na TV ainda não confirmada.
