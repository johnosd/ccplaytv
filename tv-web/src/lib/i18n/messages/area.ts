/**
 * Uma "área" do catálogo (feature 054): os textos de uma parte do app nos TRÊS
 * idiomas, lado a lado. O tipo obriga `en` e `es` a terem exatamente as chaves de
 * `pt` (completude no `tsc`); `pt.ts`/`en.ts`/`es.ts` apenas juntam as áreas.
 * Chaves de áreas diferentes não podem se repetir (`areas.test.ts` confere).
 */
export interface MessageArea<P extends Record<string, string>> {
  pt: P
  en: Record<keyof P & string, string>
  es: Record<keyof P & string, string>
}

export function defineArea<P extends Record<string, string>>(
  pt: P,
  en: Record<keyof P & string, string>,
  es: Record<keyof P & string, string>,
): MessageArea<P> {
  return { pt, en, es }
}
