// Guarda do pacote Tizen (feature 021, D-009 do plan.md): todo arquivo que o
// build emite precisa estar na lista `files:` de
// `CCPlayTv/tizen_web_project.yaml`. Um arquivo fora da lista NÃO falha no
// navegador nem nos testes — só na TV (ver R-002 da feature 005).

/** Remove aspas simples/duplas envolvendo o valor, se houver. */
function unquote(value) {
  if (value.length >= 2) {
    const first = value[0]
    const last = value[value.length - 1]
    if ((first === '"' || first === "'") && last === first) return value.slice(1, -1)
  }
  return value
}

/**
 * Caminhos declarados na seção `files:` de um YAML de projeto Tizen —
 * parser mínimo, não um parser YAML genérico: só o suficiente pra esta
 * seção (itens `- caminho`, comentários `#` e indentação de 2 ou mais
 * espaços ignorados; termina no próximo item de topo, sem indentação, ou
 * no fim do arquivo).
 *
 * @param {string} yamlText
 * @returns {Set<string>}
 */
function parseFilesSection(yamlText) {
  const lines = yamlText.split(/\r?\n/)
  const startIdx = lines.findIndex((line) => /^files:\s*$/.test(line))
  const declared = new Set()
  if (startIdx === -1) return declared

  for (let i = startIdx + 1; i < lines.length; i += 1) {
    const line = lines[i]
    if (line.trim() === '') continue // linha em branco não encerra a seção
    if (/^\S/.test(line)) break // próxima chave de topo (sem indentação)
    const trimmed = line.trim()
    if (trimmed.startsWith('#')) continue // comentário no meio da lista
    if (!trimmed.startsWith('-')) continue
    const value = unquote(trimmed.slice(1).trim())
    if (value) declared.add(value)
  }
  return declared
}

/**
 * Arquivos de `distFiles` (caminhos relativos a `dist/`, com `/` ou `\`)
 * que não aparecem na seção `files:` de `yamlText`. Retorna os caminhos
 * normalizados com `/`, na ordem de entrada.
 *
 * @param {string[]} distFiles
 * @param {string} yamlText
 * @returns {string[]}
 */
export function findUnlistedFiles(distFiles, yamlText) {
  const declared = parseFilesSection(yamlText)
  const unlisted = []
  for (const raw of distFiles) {
    const normalized = raw.replace(/\\/g, '/')
    if (!declared.has(normalized)) unlisted.push(normalized)
  }
  return unlisted
}
