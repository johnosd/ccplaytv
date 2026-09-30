/**
 * Avatar de uma lista na tela de listas (feature 037, FR-005): iniciais do
 * nome sobre um gradiente escolhido de forma estável pela identidade da lista.
 * Derivado, nunca persistido — a mesma lista tem sempre as mesmas cores.
 * Regras: `sdd/specs/037-entrada-listas-prototipo/logic/avatar-da-lista.md`.
 */

/** Quantos pares de cores existem (`--list-avatar-N-from/to` em `index.css`, N = 0..VARIANTS-1). */
export const LIST_AVATAR_VARIANTS = 6

/** Até duas iniciais em maiúsculas, a partir do nome de exibição. */
export function listInitials(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter((word) => word.length > 0)
  // Code points (`Array.from`), nunca unidades UTF-16: um emoji ou caractere
  // fora do BMP não pode ser partido ao meio.
  let initials = ''
  if (words.length >= 2) {
    initials = (Array.from(words[0])[0] ?? '') + (Array.from(words[1])[0] ?? '')
  } else if (words.length === 1) {
    initials = Array.from(words[0]).slice(0, 2).join('')
  }
  return initials.toLocaleUpperCase('pt-BR')
}

/** Índice estável do par de cores (0..LIST_AVATAR_VARIANTS-1) para o id da lista. */
export function listAvatarVariant(sourceId: string): number {
  // FNV-1a 32 bits sobre o **id** — nunca o nome (renomear não troca a cor)
  // nem a URL (identidade por URL é proibida pela constitution).
  let hash = 0x811c9dc5
  for (let i = 0; i < sourceId.length; i++) {
    hash ^= sourceId.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash % LIST_AVATAR_VARIANTS
}
