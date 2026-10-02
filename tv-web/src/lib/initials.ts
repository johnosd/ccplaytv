/**
 * Até duas iniciais em maiúsculas de um nome (feature 037 — avatar da lista;
 * reaproveitada na feature 048 — tile da trilha da Live). Movida de
 * `features/profiles/listAvatar.ts`, que a re-exporta.
 */
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
