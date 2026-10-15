// Feature 063 (US3, item 35): ajudantes PUROS do runner do benchmark — slug do
// aparelho, nome do arquivo de resultado, busca do anterior e tabela de variação.
// Nada aqui lê o ambiente (nem nome da máquina, nem usuário): quem chama passa o
// que quer gravar. Formato: `sdd/specs/063-codigo-saudavel-benchmark/logic/benchmark.md` §4 e §5.

/** Etapas comparadas, na ordem em que aparecem na tabela. */
export const STAGE_KEYS = ['fetchMs', 'parseMs', 'classifyMs', 'storeMs', 'totalMs']

export const slugify = (text) =>
  String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\(r\)|\(tm\)/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')

/** `desktop-<plataforma>-<modelo-da-cpu>`: só o que descreve o hardware, nunca quem usa nem como a máquina se chama. */
export function deviceSlug({ platform, cpuModel }) {
  return ['desktop', slugify(platform) || 'desconhecido', slugify(cpuModel) || 'cpu-desconhecida'].join('-')
}

const pad = (value, size = 2) => String(value).padStart(size, '0')

/** `AAAA-MM-DDTHHmm-<device>-<commit>.json`, em UTC. */
export function resultFileName({ date, device, commit }) {
  const d = new Date(date)
  const stamp = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`
  return `${stamp}-${slugify(device)}-${slugify(commit) || 'sem-commit'}.json`
}

/**
 * O resultado mais recente, anterior a `current`, **do mesmo aparelho**. Resultado de outro aparelho
 * nunca serve: tempo de desktop e de TV não se comparam (FR-021).
 * @param {Array<{ date: string, device: { slug: string } }>} results
 */
export function findPrevious(results, current) {
  return (
    results
      .filter((result) => result.device?.slug === current.device?.slug && Date.parse(result.date) < Date.parse(current.date))
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0] ?? undefined
  )
}

const keyOf = (entry) => `${entry.format}/${entry.size}`

/**
 * Uma linha por combinação e etapa presente nos dois resultados, mais uma linha por combinação com
 * falha — nenhuma falha derruba as outras (FR-023). Sem anterior, devolve só as falhas do atual.
 * @returns {Array<{ format: string, size: number, stage: string, previousMs?: number, currentMs?: number, deltaMs?: number, deltaPct?: number, status?: 'failed', failedStage?: string }>}
 */
export function compareResults(previous, current) {
  const before = new Map((previous?.results ?? []).map((entry) => [keyOf(entry), entry]))
  const rows = []
  for (const entry of current.results ?? []) {
    if (entry.status === 'failed') {
      rows.push({ format: entry.format, size: entry.size, stage: '—', status: 'failed', failedStage: entry.failedStage ?? 'desconhecida' })
      continue
    }
    const old = before.get(keyOf(entry))
    if (!old || old.status === 'failed') continue
    const pairs = [
      ...STAGE_KEYS.map((stage) => [stage, old.stages?.[stage], entry.stages?.[stage]]),
      ['realMs', old.realPath?.totalMs, entry.realPath?.totalMs],
    ]
    for (const [stage, previousMs, currentMs] of pairs) {
      if (typeof previousMs !== 'number' || typeof currentMs !== 'number') continue
      const deltaMs = currentMs - previousMs
      rows.push({
        format: entry.format,
        size: entry.size,
        stage,
        previousMs,
        currentMs,
        deltaMs,
        deltaPct: previousMs === 0 ? undefined : (deltaMs / previousMs) * 100,
      })
    }
  }
  return rows
}

const fixed = (value) => (value === undefined ? '—' : value.toFixed(1))
const signed = (value, suffix) => (value === undefined ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(1)}${suffix}`)

/** A tabela do `compareResults` em linhas de texto (só números e nomes de etapa). */
export function formatComparison(rows) {
  if (rows.length === 0) return ['Sem resultado anterior do mesmo aparelho para comparar.']
  const lines = ['formato  tamanho  etapa       anterior(ms)  atual(ms)  variação']
  for (const row of rows) {
    if (row.status === 'failed') {
      lines.push(`${row.format.padEnd(7)}  ${String(row.size).padStart(7)}  FALHOU na etapa ${row.failedStage}`)
      continue
    }
    lines.push(
      `${row.format.padEnd(7)}  ${String(row.size).padStart(7)}  ${row.stage.padEnd(10)}  ${fixed(row.previousMs).padStart(12)}  ${fixed(row.currentMs).padStart(9)}  ${signed(row.deltaMs, ' ms')} (${signed(row.deltaPct, '%')})`,
    )
  }
  return lines
}

/**
 * O que não pode existir num resultado gravado: qualquer URL e os nomes que o runner conhece da máquina.
 * @param {unknown} result
 * @param {string[]} forbidden trechos proibidos (nome da máquina, usuário…); vazios são ignorados
 * @returns {string[]} o que foi achado (a descrição, nunca o trecho)
 */
export function findLeaks(result, forbidden = []) {
  const text = JSON.stringify(result)
  const found = []
  if (/https?:\/\//i.test(text) || /\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\//.test(text)) found.push('url')
  for (const piece of forbidden) {
    if (piece && text.toLowerCase().includes(piece.toLowerCase())) found.push('nome-da-maquina-ou-usuario')
  }
  return found
}
