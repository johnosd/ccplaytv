/**
 * A TV mostra a chave do dispositivo em grupos para leitura ("370 362 8660"); quem copia e cola traz os espaços junto.
 * Antes de enviar, o portal tira espaços (inclusive o sem quebra e os de largura zero) e os separadores comuns (hífen,
 * ponto, barra), sem mexer em mais nada: letras ou dígitos a mais continuam falhando no servidor, como antes.
 */
export function normalizeDeviceKey(raw: string): string {
  return raw.replace(/[\s ​-‍﻿.\-‐-―/]/g, '')
}
