import { expect, it } from 'vitest'
import { safeCheckoutUrl } from './LicenseCard'
it('somente checkout HTTPS Mercado Pago BR sem usuário, fragmento ou porta alternativa', () => {
  expect(safeCheckoutUrl('https://www.mercadopago.com.br/checkout?pref_id=fixture')).toBeTruthy()
  for (const url of ['javascript:alert(1)', 'https://www.mercadopago.com.br.attacker.invalid/', 'https://private@www.mercadopago.com.br/', 'http://www.mercadopago.com.br/', 'https://www.mercadopago.com.br/#private', 'https://www.mercadopago.com.br:444/']) expect(safeCheckoutUrl(url)).toBeUndefined()
})
