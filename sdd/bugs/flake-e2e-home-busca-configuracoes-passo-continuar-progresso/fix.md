# Bug Fix: Detalhe do filme pode voltar do player sem "Continuar" (flake do E2E da 026)

- **Slug**: flake-e2e-home-busca-configuracoes-passo-continuar-progresso
- **Corrigido**: 2026-09-29
- **Assessment**: ./assessment.md
- **Status**: partial

## Summary

A causa do assessment (gravação do progresso perdendo a corrida contra a
releitura) foi **refutada** por medição. O progresso é sempre gravado antes do
RETURN; o que oscila é o detalhe mostrar por ~60 ms o estado em cache
("▶ Assistir") até a releitura invalidada terminar, e o script lia o texto sem
esperar. O fix aplicado é a alternativa que o assessment listava: o script passa
a esperar o "Continuar" (até 3 s). Nenhum código do app foi alterado.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `tv-web/e2e/home-busca-configuracoes.mjs` | modified | O passo "com progresso salvo… vira Continuar" usa `locator('.vod-detail-action', { hasText: 'Continuar' }).waitFor({ timeout: 3000 })` em vez de `textContent()` imediato; comentário aponta esta pasta |

## Tests Added or Updated

- Nenhum teste de unidade novo: não há defeito de app a travar. O próprio passo do E2E é a trava; se o "Continuar" não aparecer em 3 s, ele falha.

## Local Verification

- **Tentativa 1 (descartada e revertida)**: iniciar `onExit('close')` antes de `onClose` (e uma variante que aguardava a gravação) em `PlayerLayer.tsx`. A variante com `await` quebrou 11 testes, inclusive o contrato travado da 027 (`onClose` síncrono no RETURN). A variante síncrona não mudava nada: `onExit('close')` aplica o mesmo limiar de 5 s do `onProgress` (`shouldWriteProgress`), então na saída praticamente nunca grava algo novo. Um teste de regressão escrito para ela provou isso (a 2ª gravação nunca ocorria). Tudo revertido com `git checkout`; `tv-web/src` sem alterações.
- **Medição** (cópia temporária do E2E, já removida; 12 execuções): em todas, `userStates` já tinha `progressSeconds: 60` quando o passo rodou. Em 4 de 12 o texto imediato era "▶ Assistir" e virava "▶ Continuar de 1:00" 56–65 ms depois; nas outras 8 já estava correto (1–4 ms).
- **Antes do fix**: `node e2e/home-busca-configuracoes.mjs` × 10 → 2 falhas, ambas neste passo.
- **Depois do fix**: ver `test.md` (loop de 30 execuções).

## Deviations from Assessment

- A **remediação preferida do assessment não foi aplicada**: a hipótese de causa (gravação perde a corrida) está refutada acima. Foi aplicada a alternativa "endurecer o script", que o assessment desaconselhava como única medida por supor que o app podia voltar sem "Continuar" para a pessoa. A medição mostra que isso não acontece: o rótulo correto chega em ~60 ms e o dado nunca se perde.
- O assessment marcava confiança **medium** e uma pergunta em aberto (qual gravação perde a corrida); ela se resolveu: nenhuma.
- `assessment.md` não foi reescrito, conforme a regra da fase; a correção da hipótese vive aqui.

## Follow-ups

- Opcional, de produto: o detalhe pisca "Assistir" por ~60 ms ao voltar do player. Se incomodar na TV, dá para segurar o rótulo enquanto `useUserState` está `isFetching` depois de fechar o player, ou preencher o cache no `onClose`. Não foi feito: é mudança de comportamento de UI sem demanda, e nenhum estado errado persiste.
- O mesmo padrão de "ler o texto na hora" pode existir em outros passos de E2E após fechar o player; quem tocar neles deve esperar o estado, não lê-lo.
