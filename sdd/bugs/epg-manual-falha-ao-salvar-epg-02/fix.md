# Bug Fix: EPG manual falha com EPG-02 embora o navegador baixe o XML

- **Slug**: epg-manual-falha-ao-salvar-epg-02
- **Corrigido**: 2026-10-05
- **Assessment**: ./assessment.md
- **Status**: partial

## Summary

A causa é do servidor do EPG (o 302 sem `Access-Control-Allow-Origin` aborta o `fetch` sob CORS) e o app não consegue contorná-la. Aplicada só a "melhoria opcional" do assessment: o texto da falha `network` agora orienta a conferir se o endereço é o final, sem redirecionamento. O sintoma em si não é corrigível no cliente; a saída é usar o endereço final ou deixar o campo manual vazio (o `xmltv.php` do painel já sincroniza).

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `tv-web/src/lib/i18n/messages/sources.ts` | modified | `src.epgError.network` em pt/en/es; mantém o prefixo "Não foi possível baixar a programação." Sem URL nem credencial no texto. |
| `tv-web/src/lib/epg/epgStatus.test.ts` | modified | Nova asserção do texto de `network` nos 3 idiomas. |

## Tests Added or Updated

- `tv-web/src/lib/epg/epgStatus.test.ts::epgErrorMessage (§45) › network orienta a conferir o endereço final (sem redirecionamento), nos 3 idiomas` — trava o texto e o i18n.

## Local Verification

- `npx vitest run src/lib/epg src/features/settings/EpgSettingsScreen.test.tsx src/features/sources src/lib/i18n` → 26 arquivos, 148 testes passando.
- `npx tsc -b` → exit 0.
- Testes existentes que citam "Não foi possível baixar a programação" (EpgSettingsScreen) continuam passando.

## Deviations from Assessment

Nenhum. Os dois `[NEEDS CLARIFICATION]` do assessment seguem abertos: a melhoria de texto foi aplicada por ser a única mudança de código prevista e de baixo risco (trivial de reverter), e o comportamento na TV física não foi confirmado.

## Follow-ups

- Confirmar na TV física que o endereço final (`epg.php`) ou o campo vazio sincroniza.
- Apurar por que o EPG automático não sincronizou para o usuário preencher o manual.
- Fix `partial`: o sintoma depende de ação do usuário (trocar o endereço), não de código.
