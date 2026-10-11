import { expect, test } from '@playwright/test'
test('bootstrap acessível mantém venda indisponível e saída por teclado', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('Compras ainda não estão disponíveis')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Recarregar' })).toBeFocused()
})
