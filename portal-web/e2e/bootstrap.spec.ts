import { expect, test } from '@playwright/test'
test('bootstrap acessível mantém o login enxuto e sem ações autenticadas', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.locator('.portal-header').getByText('CCPlayTV', { exact: true })).toBeVisible()
  await expect(page.locator('input')).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Conectar', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Recarregar', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Recuperar acesso à TV', exact: true })).toHaveCount(0)
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Endereço MAC da TV', { exact: true })).toBeFocused()
})
