import type { Translator } from '../../lib/i18n/translate'

/** Avisos reais do cartão, numa linha compacta abaixo do nome (FR-006) — pastilha com texto, nunca só cor. */
export function sourceNotices(source: { provider_import_mode: string | null; last_truncated_by_storage: boolean; last_discarded_by_type: number }, t: Translator): string[] {
  const notices: string[] = []
  if (source.provider_import_mode === 'legacy_m3u') notices.push(t('profiles.notice.limited'))
  if (source.last_truncated_by_storage) notices.push(t('profiles.notice.truncated'))
  if (source.last_discarded_by_type > 0) notices.push(t('profiles.notice.discarded'))
  return notices
}

