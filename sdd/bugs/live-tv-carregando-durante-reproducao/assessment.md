# Bug Assessment: Live TV carregando durante reprodução

- **Slug**: live-tv-carregando-durante-reproducao
- **Criado**: 2026-10-11
- **Origem**: texto colado e foto da TV
- **Veredito**: valid
- **Severidade**: medium

## Report

Canal toca, mas Carregando... continua sobre o vídeo (foto do usuário).

## Symptom

Canal toca, mas Carregando... continua sobre o vídeo (foto do usuário). Esperado: estado visual e comandos coerentes com a reprodução e os botões disponíveis.

## Reproduction

Abrir canal na TV; observar vídeo tocando e aviso persistente. Equivalente automatizado: preparar AVPlay, omitir bufferingcomplete e emitir tempos crescentes; repetir após novo buffering.

## Suspected Code Paths

tv-web/src/lib/player/avplayAdapter.ts:420 — playing depende exclusivamente de onbufferingcomplete; prepareAsync pode sobrescrever playing com buffering. PlayerLayer mostra o rótulo enquanto sessão permanece buffering.

## Root Cause Hypothesis

Alta confiança no caminho estático: oncurrentplaytime só publica progresso, não recupera playing. A sequência exata do firmware na foto ainda precisa de validação física.

## Proposed Remediation

**Preferida**: Confirmar playing quando dois tempos válidos crescem durante buffering, sem timer arbitrário. Preservar pausa, erro, fechamento e buffering real.

**Files likely to change**:

- `tv-web/src/lib/player/avplayAdapter.ts`
- `tv-web/src/lib/player/avplayAdapter.test.ts`
- `tv-web/src/components/PlayerLayer.avplay-loading.test.tsx`

**Tests to add or update**:

Regressão com AVPlay simulado e sessão real; progresso congelado/inválido; novo buffering; pausa e fechamento; integração PlayerLayer remove aviso.

## Risks & Considerations

Preservar alterações locais anteriores. Constituição: foco seleciona, SELECT executa; progresso/estado requer evidência real. DS V14 §§11/27/43 e Lab/protótipo player consultados. Não alterar armazenamento, credenciais ou arquitetura. Simulação não comprova firmware, IPTV ou controle físico.

## Open Questions

Nenhuma decisão de produto pendente. Aceite físico fica explícito na verificação.
