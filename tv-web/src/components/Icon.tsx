import { createElement } from 'react'
import { ICON_PATHS, type IconName, type IconShape } from './iconPaths'

export interface IconProps {
  name: IconName
  /**
   * Nome acessível. Presente: `role="img"` + `aria-label` (o ícone
   * carrega o significado sozinho). Ausente: `aria-hidden="true"` (o
   * ícone é decorativo/redundante — o texto ao lado já diz o que ele diz).
   */
  label?: string
  className?: string
}

function shapeKey(shape: IconShape, i: number): string {
  return `${shape.tag}-${i}`
}

function renderShape(shape: IconShape, i: number) {
  const key = shapeKey(shape, i)
  const { tag, ...props } = shape
  return createElement(tag, { key, ...props })
}

/**
 * Ícone SVG local do DS V14 (§15, feature 021, D-006 do plan.md).
 * `stroke="currentColor"` (herda a cor do texto ao redor), sem
 * preenchimento, tamanho controlado por `--icon-size` (padrão `1em`).
 *
 * Tamanho por `style`, não por atributo (feature 028, D-007 do plan.md):
 * o atributo SVG `width`/`height` não aceita `var()` — o navegador o
 * ignora e cai no tamanho intrínseco do SVG (achado real, backlog item,
 * confirmado na TV física onde `--icon-size` resolvia de forma instável
 * nesse caminho). `style` aceita `var()` normalmente.
 */
export function Icon({ name, label, className }: IconProps) {
  const shapes = ICON_PATHS[name]
  return (
    <svg
      viewBox="0 0 24 24"
      style={{ width: 'var(--icon-size)', height: 'var(--icon-size)' }}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
    >
      {shapes.map(renderShape)}
    </svg>
  )
}
