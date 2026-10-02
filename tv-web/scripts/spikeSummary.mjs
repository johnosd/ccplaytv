// Feature 047 (spike, US1): resume amostras de reprodução SEM expor nada que
// identifique a lista — só categorias e contagens (FR-001/FR-010). Puro: não
// lê rede, `.env` nem DOM, para o teste provar que a saída não carrega URL.

/**
 * Classifica uma amostra. Entrada: só números/rótulos medidos no navegador.
 * @param {{ played: boolean, videoBytes: number, audioBytes: number, errKind: string | null, timedOut: boolean }} sample
 * @returns {'ok' | 'so-video' | 'so-audio' | 'sem-decodificacao' | 'rede' | 'erro-demux' | 'timeout'}
 */
export function classifySample(sample) {
  const hasVideo = sample.played && sample.videoBytes > 0
  const hasAudio = sample.audioBytes > 0
  if (hasVideo && hasAudio) return 'ok'
  if (hasVideo) return 'so-video'
  if (hasAudio) return 'so-audio'
  if (sample.errKind) return /network/i.test(sample.errKind) ? 'rede' : 'erro-demux'
  return sample.timedOut ? 'timeout' : 'sem-decodificacao'
}

const ROTULOS = {
  ok: 'vídeo e áudio',
  'so-video': 'só vídeo (sem áudio decodificado)',
  'so-audio': 'só áudio (sem vídeo decodificado)',
  'sem-decodificacao': 'nada decodificado',
  rede: 'erro de rede',
  'erro-demux': 'erro do demux (formato/codec)',
  timeout: 'tempo esgotado',
}

/**
 * @param {Array<ReturnType<typeof classifySample>>} categories
 * @returns {{ total: number, ok: number, counts: Record<string, number>, lines: string[], verdict: 'seguir' | 'parar' }}
 */
export function summarize(categories) {
  const counts = {}
  for (const c of categories) counts[c] = (counts[c] ?? 0) + 1
  const total = categories.length
  const ok = counts.ok ?? 0
  const lines = [`${ok} de ${total} canais amostrados decodificaram vídeo e áudio`]
  for (const [cat, label] of Object.entries(ROTULOS)) {
    if (cat !== 'ok' && counts[cat]) lines.push(`  - ${label}: ${counts[cat]}`)
  }
  // "Maioria" = mais da metade da amostra (FR-002).
  const verdict = total > 0 && ok * 2 > total ? 'seguir' : 'parar'
  return { total, ok, counts, lines, verdict }
}
