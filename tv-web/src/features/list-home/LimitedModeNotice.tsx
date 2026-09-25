/**
 * Explicação do Modo limitado no hub da lista (feature 014, US2, FR-021).
 *
 * O selo "Modo limitado" da Home (feature 004) já dizia QUE a fonte estava
 * assim; esta explicação diz POR QUÊ, o que a fonte perde em relação ao
 * protocolo completo e o que a pessoa pode fazer — sem isso, a pessoa não
 * tinha como entender nem agir.
 *
 * Informação, não erro (D-008 da feature 004): mesmo tom do selo, nunca a
 * cor/estilo de `.form-error`. E nunca o endereço do painel, o usuário ou
 * a senha (FR-022) — o componente nem recebe esses dados como prop.
 */

const REASON_TEXT: Record<string, string> = {
  protocol_unavailable: 'O painel deste provedor não respondeu ao protocolo completo de catálogo.',
  panel_unreachable: 'Não foi possível falar com o painel deste provedor pela rede na última sincronização.',
}

const GENERIC_REASON_TEXT = 'Este provedor não respondeu ao protocolo completo de catálogo.'

export interface LimitedModeNoticeProps {
  /** Categoria fixa (FR-020) — nunca texto de erro cru. */
  reason: string
  /** Entradas descartadas por não serem identificadas (FR-021). `0` omite a linha. */
  discardedCount: number
}

export function LimitedModeNotice({ reason, discardedCount }: LimitedModeNoticeProps) {
  const reasonText = REASON_TEXT[reason] ?? GENERIC_REASON_TEXT

  return (
    <div className="limited-mode-notice" role="note" aria-label="Fonte em Modo limitado">
      <p className="limited-mode-notice-title">Modo limitado</p>
      <p>{reasonText}</p>
      <p>Todos os canais, filmes e séries identificados nesta lista continuam disponíveis.</p>
      <p className="limited-mode-notice-subhead">O que fica de fora, em relação ao protocolo completo:</p>
      <ul className="limited-mode-notice-list">
        <li>ordem e identificação das categorias como o painel declara</li>
        <li>quantidade de itens de cada categoria, conhecida antes de abri-la</li>
        <li>temporadas e episódios de série como o painel organiza</li>
        <li>situação da assinatura (validade, formatos permitidos)</li>
      </ul>
      {discardedCount > 0 && (
        <p>
          {discardedCount === 1
            ? '1 entrada não foi reconhecida e ficou de fora.'
            : `${discardedCount} entradas não foram reconhecidas e ficaram de fora.`}
        </p>
      )}
      <p>
        Ressincronizar mais tarde pode resolver, se o painel passar a responder ao protocolo
        completo — falar com o provedor sobre isso também pode ajudar.
      </p>
    </div>
  )
}
