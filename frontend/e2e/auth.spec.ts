import { expect, test } from '@playwright/test'

/**
 * The critical journey from spec section 53, against the real backend and a
 * real database: register, land on the dashboard, sign out, sign back in.
 */

function uniqueEmail() {
  // A fresh address per run, so repeated local runs do not collide with
  // accounts left behind by the last one.
  return `e2e-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`
}

const PASSWORD = 'a-good-long-password'

test('a visitor can register, sign out and sign back in', async ({ page }) => {
  const email = uniqueEmail()

  await page.goto('/')
  await expect(
    page.getByRole('heading', {
      name: 'Merge, split and shrink PDFs without hunting for a website.',
    }),
  ).toBeVisible()

  await page.getByRole('link', { name: 'Sign up' }).first().click()
  await expect(page).toHaveURL(/\/register$/)

  await page.getByLabel('First name').fill('Ada')
  await page.getByLabel('Last name').fill('Lovelace')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { name: 'Welcome, Ada' })).toBeVisible()

  await page.getByRole('button', { name: /Account menu/ }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()

  // Signing out of a protected page hands you to the sign-in screen.
  await expect(page).toHaveURL(/\/login$/)

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { name: 'Welcome, Ada' })).toBeVisible()
})

test('the dashboard is not reachable without signing in', async ({ page }) => {
  await page.goto('/dashboard')

  await expect(page).toHaveURL(/\/login$/)
})

test('signing in with the wrong password shows an error and stays put', async ({ page }) => {
  await page.goto('/login')

  await page.getByLabel('Email').fill('nobody@example.com')
  await page.getByLabel('Password').fill('definitely-not-the-password')
  await page.getByRole('button', { name: 'Sign in' }).click()

  // Scoped to the form: Next renders its own role="alert" route announcer,
  // which an unscoped getByRole('alert') matches first.
  await expect(page.locator('form [role="alert"]')).toContainText('Incorrect email or password.')
  await expect(page).toHaveURL(/\/login$/)
})
