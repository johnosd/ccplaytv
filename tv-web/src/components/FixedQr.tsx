import { useMemo, type ReactNode } from 'react'
import qrcode from 'qrcode-generator'

/**
 * QR fixo desenhado na TV (feature 071, FR-013): módulos do `qrcode-generator` como um único `<path>` SVG —
 * nenhuma imagem do serviço, nenhuma requisição. O conteúdo é a URL do `buildFixedQrUrl` (chave no fragmento);
 * ele nunca é escrito em texto no DOM, só no desenho. A zona de silêncio vem da moldura clara do chamador.
 */
export function FixedQr({ value, label }: { value: string; label: string }): ReactNode {
  const drawing = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(value)
    qr.make()
    const size = qr.getModuleCount()
    let path = ''
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) if (qr.isDark(row, col)) path += `M${col} ${row}h1v1h-1z`
    }
    return { size, path }
  }, [value])
  return <svg className="fixed-qr" role="img" aria-label={label} viewBox={`0 0 ${drawing.size} ${drawing.size}`}
    shapeRendering="crispEdges" preserveAspectRatio="xMidYMid meet">
    <path d={drawing.path} fill="currentColor" />
  </svg>
}
