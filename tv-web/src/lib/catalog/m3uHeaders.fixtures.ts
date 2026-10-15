/**
 * Só para testes (feature 044, FR-013): amostras no FORMATO de listas reais
 * (Kodi/TiviMate/VLC), anonimizadas — hosts `exemplo.test`, tokens falsos.
 * Nunca copiar valor de lista, `.env` ou `docs/m3u/dados.md` para cá.
 */

/** Sufixo `|` no estilo Kodi/TiviMate, com e sem codificação. */
export const M3U_PIPE_SAMPLE = [
  '#EXTM3U',
  '#EXTINF:-1 tvg-id="canal.1" tvg-logo="http://exemplo.test/logo/1.png" group-title="Canais | Abertos",Canal Um',
  'http://exemplo.test/live/token-falso-1/1.m3u8|User-Agent=Mozilla/5.0 (Linux; Tizen 9.0)&Referer=http://portal.exemplo.test/',
  '#EXTINF:-1 group-title="Canais | Abertos",Canal Dois',
  'http://exemplo.test/live/token-falso-2/2.ts|User-Agent=Exemplo%20Player/1.0',
  '#EXTINF:-1 group-title="Canais | Abertos",Canal Tres',
  'http://exemplo.test/live/3.ts|Referer=http://portal.exemplo.test/p?x=1&y=2&Cookie=sessao-falsa',
  '#EXTINF:-1 group-title="Canais | Abertos",Canal Quatro',
  'http://exemplo.test/live/4.ts',
].join('\n')

/** `#EXTVLCOPT` (VLC) antes e depois do `#EXTINF`, e `#KODIPROP` de DRM e de headers. */
export const M3U_DIRECTIVES_SAMPLE = [
  '#EXTM3U',
  '#EXTINF:-1 group-title="Canais",Canal Vlc',
  '#EXTVLCOPT:http-user-agent=Exemplo VLC/3.0',
  '#EXTVLCOPT:http-referrer=http://portal.exemplo.test/',
  'http://exemplo.test/live/vlc.ts',
  '#KODIPROP:inputstream.adaptive.license_type=com.widevine.alpha',
  '#KODIPROP:inputstream.adaptive.license_key=http://licenca.exemplo.test/chave-falsa',
  '#EXTINF:-1 group-title="Canais",Canal Drm',
  'http://exemplo.test/live/drm.mpd',
  '#KODIPROP:inputstream.adaptive.stream_headers=User-Agent=Exemplo%20Kodi&Referer=http://portal.exemplo.test/',
  '#EXTINF:-1 group-title="Canais",Canal Kodi',
  'http://exemplo.test/live/kodi.m3u8',
].join('\n')

/** Atributos de rádio e de número de canal, válidos e inválidos. */
export const M3U_RADIO_CHNO_SAMPLE = [
  '#EXTM3U',
  '#EXTINF:-1 tvg-chno="101" radio="true" group-title="Radios",Radio Um',
  'http://exemplo.test/radio/1.mp3',
  '#EXTINF:-1 tvg-chno="0" radio="false" group-title="Radios",Radio Dois',
  'http://exemplo.test/radio/2.mp3',
  '#EXTINF:-1 tvg-chno="abc" group-title="Radios",Radio Tres',
  'http://exemplo.test/radio/3.mp3',
].join('\n')
