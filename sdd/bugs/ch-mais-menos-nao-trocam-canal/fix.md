# Bug Fix: CH+/CH− não trocam canal no player

- **Slug**: ch-mais-menos-nao-trocam-canal
- **Corrigido**: 2026-10-11
- **Assessment**: ./assessment.md (incluindo complemento da fase Assess)
- **Status**: applied

## Summary

Corrigida a permissão de entrada de controle remoto no manifesto: `http://tizen.org/privilege/tvinputdevice` → `http://tizen.org/privilege/tv.inputdevice`. O registro de CH± já existia, mas a URI declarada não era a exigida pela plataforma. Nenhuma alteração de direção, foco, política de camadas ou estado do player.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `CCPlayTv/config.xml` | modified | URI oficial e comentário atualizado; demais configurações preservadas |
| `tv-web/scripts/tizenInputPrivilege.test.mjs` | added | Lê o manifesto real e exige a permissão oficial |
| `tv-web/src/lib/tizenMediaKeys.test.ts` | modified | CH± reconhecidas por códigos físicos sem event.key |
| `tv-web/src/components/PlayerLayer.test.tsx` | modified | Player encaminha códigos 427/428 ao callback de troca |

## Tests Added or Updated

- `tizenInputPrivilege.test.mjs`: falhou antes do patch (1/1) por permissão ausente. Esta é a reprodução automatizada do defeito de empacotamento, não uma reprodução física do sintoma.
- `tizenMediaKeys.test.ts`: casos de ChannelUp/ChannelDown sem nome da tecla.
- `PlayerLayer.test.tsx`: ambos os códigos físicos durante reprodução Live.

## Local Verification

- Linha de base: 3 arquivos / 74 testes passaram antes da investigação do manifesto.
- Teste de manifesto antes do patch: 1 teste falhou, exit 1.
- Lint (`oxlint` + `scripts/architecture.mjs`): exit 0, avisos na árvore atual, nenhum erro.
- Regressão ampliada e build/type-check: resultados consolidados em `test.md` após execução.

## Deviations from Assessment

A avaliação inicial não incluía o manifesto. Antes de corrigi-lo, a fase Assess foi retomada e recebeu um complemento com evidência da documentação oficial, remediação e os quatro arquivos autorizados. Não houve patch especulativo no teclado ou no registro.

## Follow-ups

- Instalar atualização preservando o IndexedDB e confirmar CH+/CH− num canal intermediário na TV física. `sdb devices` não mostrou aparelho conectado nesta sessão.
- Sem deploy ou commit nesta fase. Commit sugerido: `fix(player): corrigir permissao Tizen das teclas de canal`.
