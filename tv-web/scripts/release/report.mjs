// Feature 078: Markdown do relatório do gate. Só imprime campos do resultado
// (ID, status, detalhe, caminhos, dono, próxima ação) — nunca conteúdo de
// artefato (FR-016).
import { CHECKLIST, checklistItem } from './checklist.mjs'

const cell = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')

/**
 * @param {{ candidate: Record<string, unknown>, results: import('./checklist.mjs').CheckResult[], decision: string, blockers: string[], approvedTargets: Array<Record<string, string>>, stale?: { stale: boolean, reasons: string[] }, generatedAt?: string }} report
 * @returns {string}
 */
export function renderReport(report) {
  const { candidate, results, decision, blockers, approvedTargets, stale, generatedAt } = report
  const lines = []
  lines.push(`# Gate Seller Office — ${cell(candidate.version)} (${cell(candidate.variant)})`, '')
  if (stale?.stale) {
    lines.push(`> **Atenção:** o relatório anterior desta variante está obsoleto (${stale.reasons.map(cell).join(', ')}).`, '')
  }
  lines.push(
    `- **Decisão:** ${cell(decision)}`,
    `- **Revisão:** \`${cell(candidate.revision)}\`${candidate.dirty ? ' (árvore suja)' : ''}`,
    `- **Modo de build:** ${cell(candidate.buildMode)}`,
    `- **SHA-256 do .wgt:** \`${cell(candidate.wgtSha256)}\``,
  )
  if (generatedAt) lines.push(`- **Gerado em:** ${cell(generatedAt)}`)
  lines.push('', `## Bloqueios (${blockers.length})`, '')
  lines.push(blockers.length ? blockers.map((id) => `- \`${cell(id)}\``).join('\n') : '- nenhum')

  lines.push('', '## Alvos aprovados', '')
  lines.push(approvedTargets.length
    ? approvedTargets.map((t) => `- ${cell(t.country)} · ${cell(t.model)} · ${cell(t.firmware)} (${cell(t.date)})`).join('\n')
    : '- nenhum')

  const byId = new Map(results.map((result) => [result.id, result]))
  const ordered = [
    ...CHECKLIST.map((item) => byId.get(item.id) ?? { id: item.id, status: 'Pending', detail: 'sem resultado' }),
    ...results.filter((result) => !checklistItem(result.id)),
  ]
  lines.push('', '## Itens', '', '| ID | Classe | Status | Detalhe | Caminhos | Dono | Próxima ação |', '| --- | --- | --- | --- | --- | --- | --- |')
  for (const result of ordered) {
    const klass = checklistItem(result.id)?.klass ?? (result.id.startsWith('SAM-') ? 'samsung' : 'internal')
    const paths = (result.paths ?? []).map((p) => `\`${cell(p)}\``).join(', ')
    lines.push(`| \`${cell(result.id)}\` | ${klass} | ${cell(result.status)} | ${cell(result.detail)} | ${paths} | ${cell(result.owner)} | ${cell(result.nextAction)} |`)
  }
  return `${lines.join('\n')}\n`
}
