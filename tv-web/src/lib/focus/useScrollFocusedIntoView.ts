import { useEffect, useRef } from 'react'

/**
 * Rola o elemento focado pra dentro da área visível do seu contêiner com
 * `overflow: auto`, quando esse contêiner **não** é virtualizado.
 *
 * Achado durante a verificação na TV física da feature 009 (Cenário B):
 * a trilha de categorias (`.live-column-groups`, D-004 — deliberadamente
 * fora da virtualização) usa uma classe CSS (`tv-focus`) pra comunicar o
 * item focado, não o foco real de DOM — então o comportamento nativo do
 * navegador de rolar um elemento focado pra dentro da tela **não** se
 * aplica aqui. Numa fonte real com dezenas de categorias, o item focado
 * descia pra fora da área visível e ficava lá, sem nada trazendo-o de
 * volta — bug pré-existente desde a feature 010, exposto só agora por uma
 * fonte real grande o bastante pra a trilha não caber inteira na tela.
 *
 * `{ block: 'nearest' }`: rola o mínimo necessário pra revelar o item,
 * sem centralizar — evita o conteúdo "pular" mais do que o preciso a cada
 * passo do controle.
 */
export function useScrollFocusedIntoView<T extends HTMLElement>(dependency: unknown) {
  const ref = useRef<T>(null)

  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [dependency])

  return ref
}
