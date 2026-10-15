# Bug Assessment: Trailer: setas horizontais navegam botões

- **Slug**: trailer-setas-horizontais-avancam-video-vez
- **Criado**: 2026-10-11
- **Origem**: texto colado
- **Veredito**: valid
- **Severidade**: medium

## Report

←/→ saltam o trailer em vez de selecionar Pausar/Minha Lista.

## Symptom

←/→ saltam o trailer em vez de selecionar Pausar/Minha Lista. Esperado: estado visual e comandos coerentes com a reprodução e os botões disponíveis.

## Reproduction

Abrir trailer de filme com Minha Lista; pressionar → e SELECT; esperado selecionar e ativar Minha Lista sem seek ou pause. ← retorna a Pausar.

## Suspected Code Paths

tv-web/src/components/TrailerLayer.tsx:158 — setas horizontais chamam seek quando foco não está em Minha Lista; botões são irmãos em uma faixa.

## Root Cause Hypothesis

Alta confiança: handler e testes codificam salto de 10 s herdado, anterior ao botão Minha Lista. Pedido atual altera essa regra.

## Proposed Remediation

**Preferida**: Usar ←/→ para foco horizontal limitado aos botões existentes; manter ↑/↓ compatíveis, SELECT e RETURN. Remover seek morto da camada e atualizar dica pt/en/es e E2E.

**Files likely to change**:

- `tv-web/src/components/TrailerLayer.tsx`
- `tv-web/src/components/TrailerLayer.test.tsx`
- `tv-web/src/lib/i18n/messages/playerUi.ts`
- `tv-web/e2e/trailers.mjs`

**Tests to add or update**:

Sem seek nas setas com/sem Minha Lista; bordas; SELECT, pending, RETURN, auto-hide e pausa. Atualizar reprodução E2E.

## Risks & Considerations

Preservar alterações locais anteriores. Constituição: foco seleciona, SELECT executa; progresso/estado requer evidência real. DS V14 §§11/27/43 e Lab/protótipo player consultados. Não alterar armazenamento, credenciais ou arquitetura. Simulação não comprova firmware, IPTV ou controle físico.

## Open Questions

Nenhuma decisão de produto pendente. Aceite físico fica explícito na verificação.
