import { expect, test, type Page } from '@playwright/test'

/**
 * Opens the theme menu, retrying the click until it actually opens.
 *
 * A click that lands before React has hydrated hits a real DOM element, so
 * Playwright counts it as a success, but no handler runs and the menu never
 * appears. Retrying the click is the difference between a test that passes
 * alone and one that passes on a cold server too.
 */
async function openThemeMenu(page: Page) {
  const trigger = page.getByRole('button', { name: 'Change theme' })
  await expect(async () => {
    await trigger.click()
    await expect(page.getByRole('menu')).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 15_000 })
}

/**
 * Guards a bug that shipped silently once: the menu items used onSelect, which
 * TypeScript accepts as a native event and which never fires, so the menu
 * opened and choosing a theme did nothing.
 */
test('a visitor can switch between light and dark', async ({ page }) => {
  await page.goto('/')
  const html = page.locator('html')

  await openThemeMenu(page)
  await page.getByRole('menuitem', { name: 'Dark' }).click()
  await expect(html).toHaveClass(/dark/)

  await openThemeMenu(page)
  await page.getByRole('menuitem', { name: 'Light' }).click()
  await expect(html).toHaveClass(/light/)
})

test('the chosen theme survives a reload', async ({ page }) => {
  await page.goto('/')

  await openThemeMenu(page)
  await page.getByRole('menuitem', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)

  await page.reload()

  await expect(page.locator('html')).toHaveClass(/dark/)
})
