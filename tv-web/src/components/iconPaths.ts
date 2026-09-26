/**
 * Desenho de cada ícone do conjunto mínimo do DS V14 (§15, feature 021,
 * US5): traço consistente, `viewBox="0 0 24 24"`, sem preenchimento —
 * `Icon.tsx` aplica `stroke="currentColor"`/`fill="none"` a todas as
 * formas daqui. Fica em `.ts` (não `.tsx`): é só dado, sem JSX — cada
 * ícone é uma lista de formas SVG primitivas que `Icon.tsx` traduz em
 * elementos.
 *
 * Inclui Rewind/Forward além da família mínima da Spec porque o player
 * (`PlayerControls.tsx`) já usa esses dois glifos hoje (FR-020) — nenhuma
 * tela passa a usar nada daqui nesta feature (FR-022).
 */

export type IconShape =
  | { tag: 'path'; d: string }
  | { tag: 'circle'; cx: number; cy: number; r: number }
  | { tag: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { tag: 'polygon'; points: string }
  | { tag: 'polyline'; points: string }
  | { tag: 'rect'; x: number; y: number; width: number; height: number; rx?: number }

export const ICON_PATHS = {
  play: [{ tag: 'polygon', points: '5 3 19 12 5 21 5 3' }],
  pause: [
    { tag: 'rect', x: 6, y: 4, width: 4, height: 16 },
    { tag: 'rect', x: 14, y: 4, width: 4, height: 16 },
  ],
  search: [
    { tag: 'circle', cx: 11, cy: 11, r: 8 },
    { tag: 'line', x1: 21, y1: 21, x2: 16.65, y2: 16.65 },
  ],
  add: [
    { tag: 'line', x1: 12, y1: 5, x2: 12, y2: 19 },
    { tag: 'line', x1: 5, y1: 12, x2: 19, y2: 12 },
  ],
  next: [
    { tag: 'polygon', points: '5 4 15 12 5 20 5 4' },
    { tag: 'line', x1: 19, y1: 5, x2: 19, y2: 19 },
  ],
  back: [
    { tag: 'line', x1: 19, y1: 12, x2: 5, y2: 12 },
    { tag: 'polyline', points: '12 19 5 12 12 5' },
  ],
  menu: [
    { tag: 'line', x1: 3, y1: 6, x2: 21, y2: 6 },
    { tag: 'line', x1: 3, y1: 12, x2: 21, y2: 12 },
    { tag: 'line', x1: 3, y1: 18, x2: 21, y2: 18 },
  ],
  device: [
    { tag: 'rect', x: 2, y: 3, width: 20, height: 14, rx: 2 },
    { tag: 'line', x1: 8, y1: 21, x2: 16, y2: 21 },
    { tag: 'line', x1: 12, y1: 17, x2: 12, y2: 21 },
  ],
  settings: [
    { tag: 'circle', cx: 12, cy: 12, r: 3 },
    {
      tag: 'path',
      d: 'M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
    },
  ],
  audio: [
    { tag: 'polygon', points: '11 5 6 9 2 9 2 15 6 15 11 19 11 5' },
    { tag: 'path', d: 'M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07' },
  ],
  subtitles: [
    { tag: 'rect', x: 2, y: 5, width: 20, height: 14, rx: 2 },
    { tag: 'line', x1: 6, y1: 10, x2: 10, y2: 10 },
    { tag: 'line', x1: 6, y1: 14, x2: 14, y2: 14 },
    { tag: 'line', x1: 13, y1: 10, x2: 18, y2: 10 },
  ],
  quality: [
    { tag: 'line', x1: 4, y1: 21, x2: 4, y2: 14 },
    { tag: 'line', x1: 4, y1: 10, x2: 4, y2: 3 },
    { tag: 'line', x1: 12, y1: 21, x2: 12, y2: 12 },
    { tag: 'line', x1: 12, y1: 8, x2: 12, y2: 3 },
    { tag: 'line', x1: 20, y1: 21, x2: 20, y2: 16 },
    { tag: 'line', x1: 20, y1: 12, x2: 20, y2: 3 },
    { tag: 'line', x1: 1, y1: 14, x2: 7, y2: 14 },
    { tag: 'line', x1: 9, y1: 8, x2: 15, y2: 8 },
    { tag: 'line', x1: 17, y1: 16, x2: 23, y2: 16 },
  ],
  info: [
    { tag: 'circle', cx: 12, cy: 12, r: 10 },
    { tag: 'line', x1: 12, y1: 16, x2: 12, y2: 12 },
    { tag: 'line', x1: 12, y1: 8, x2: 12.01, y2: 8 },
  ],
  favorite: [
    {
      tag: 'polygon',
      points: '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2',
    },
  ],
  live: [
    { tag: 'circle', cx: 12, cy: 12, r: 2 },
    { tag: 'circle', cx: 12, cy: 12, r: 6 },
    { tag: 'circle', cx: 12, cy: 12, r: 10 },
  ],
  rewind: [
    { tag: 'polygon', points: '11 19 2 12 11 5 11 19' },
    { tag: 'polygon', points: '22 19 13 12 22 5 22 19' },
  ],
  forward: [
    { tag: 'polygon', points: '13 19 22 12 13 5 13 19' },
    { tag: 'polygon', points: '2 19 11 12 2 5 2 19' },
  ],
} as const satisfies Record<string, readonly IconShape[]>

export type IconName = keyof typeof ICON_PATHS
