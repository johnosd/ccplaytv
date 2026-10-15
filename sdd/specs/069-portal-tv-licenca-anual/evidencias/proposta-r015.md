# Proposta de refatoração R-015 — autorizada em 2026-10-11

Falha estática: userStateRepository.ts tem 366 linhas, baseline 362. O diff anterior à 069 adicionou parâmetro invalidateSeriesWatch e false em toggleFavorite para preservar favorito já salvo quando cache auxiliar falha. Essa correção deve ficar intacta.

Menor separação útil proposta: mover a função pura isInHistory para lib/catalog/historyPolicy.ts, importando apenas o tipo UserStateRecord. userStateRepository importa e reexporta a mesma função; listPlayed e todos os consumidores mantêm API/comportamento. Não mover persistência, não alterar schema, não comprimir linhas nem aumentar baseline.

Validação: testes existentes de userStateRepository/histórico, contrato histórico intacto, arquitetura e TypeScript; E2E histórico na suíte. Extração aplicada após autorização: função pura em historyPolicy.ts, import/reexport preservados. Validação concluída: lint/build PASS, 47/47 testes afetados PASS, E2E histórico/limpeza/sonda 3/3 PASS. Baseline preservado.
