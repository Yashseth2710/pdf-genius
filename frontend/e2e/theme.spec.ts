import { expect, test } from '@playwright/test'

/**
 * Guards a bug that shipped silently once: the menu items used onSelect, which
 * TypeScript accepts as a native event and which never fires, so the menu
 * opened and choosing a theme did nothing.
 */
test('a visitor can switch between light and dark', async ({ page }) => {
  await page.goto('/')
  const html = page.locator('html')

  await page.getByRole('button', { name: 'Change theme' }).click()
  await page.getByRole('menuitem', { name: 'Dark' }).click()
  await expect(html).toHaveClass(/dark/)

  await page.getByRole('button', { name: 'Change theme' }).click()
  await page.getByRole('menuitem', { name: 'Light' }).click()
  await expect(html).toHaveClass(/light/)
})

test('the chosen theme survives a reload', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: 'Change theme' }).click()
  await page.getByRole('menuitem', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)

  await page.reload()

  await expect(page.locator('html')).toHaveClass(/dark/)
})
