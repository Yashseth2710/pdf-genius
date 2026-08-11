import { expect, test } from '@playwright/test'

/**
 * Proves the app builds, serves and renders in a real browser. The full
 * journey (register, log in, upload, merge, download) is added as those
 * features land.
 */
test('the app serves a page', async ({ page }) => {
  const response = await page.goto('/')

  expect(response?.status()).toBe(200)
  await expect(page).toHaveTitle(/.+/)
})
