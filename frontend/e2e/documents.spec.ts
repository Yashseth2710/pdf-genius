import { expect, test, type Page } from '@playwright/test'

/**
 * Uploading, listing, downloading and deleting, against the real API.
 */

// A minimal but structurally valid single-page PDF. Built by hand rather than
// checked in as a fixture, so the test carries everything it needs.
const PDF = Buffer.from(
  `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj
trailer<</Root 1 0 R/Size 4>>
%%EOF
`,
  'latin1',
)

async function signUp(page: Page) {
  const email = `docs-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`
  await page.goto('/register')
  await page.getByLabel('First name').fill('Ada')
  await page.getByLabel('Last name').fill('Lovelace')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('a-good-long-password')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

test('a new account starts with an empty document list', async ({ page }) => {
  await signUp(page)

  await expect(page.getByRole('heading', { name: 'No documents yet' })).toBeVisible()
})

test('uploading a PDF puts it in the list, and it can be deleted again', async ({ page }) => {
  await signUp(page)

  await page.getByLabel('Choose files to upload').setInputFiles({
    name: 'quarterly-report.pdf',
    mimeType: 'application/pdf',
    buffer: PDF,
  })

  await expect(page.getByText('quarterly-report.pdf')).toBeVisible()
  await expect(page.getByText('1 page')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'No documents yet' })).toBeHidden()

  await page.getByRole('button', { name: 'Delete quarterly-report.pdf' }).click()

  await expect(page.getByRole('heading', { name: 'No documents yet' })).toBeVisible()
})

test('a file type the app does not accept is refused in the browser', async ({ page }) => {
  await signUp(page)

  await page.getByLabel('Choose files to upload').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('just some text'),
  })

  // Scoped: Next renders its own role="alert" route announcer.
  await expect(page.locator('li [role="alert"]')).toContainText('not supported')
  // And nothing was recorded.
  await expect(page.getByRole('heading', { name: 'No documents yet' })).toBeVisible()
})

test('a document survives a reload', async ({ page }) => {
  await signUp(page)

  await page.getByLabel('Choose files to upload').setInputFiles({
    name: 'kept.pdf',
    mimeType: 'application/pdf',
    buffer: PDF,
  })
  await expect(page.getByText('kept.pdf')).toBeVisible()

  await page.reload()

  await expect(page.getByText('kept.pdf')).toBeVisible()
})

test('documents are private to the account that uploaded them', async ({ page }) => {
  await signUp(page)
  await page.getByLabel('Choose files to upload').setInputFiles({
    name: 'private.pdf',
    mimeType: 'application/pdf',
    buffer: PDF,
  })
  await expect(page.getByText('private.pdf')).toBeVisible()

  // A second account must see none of it.
  await page.getByRole('button', { name: /Account menu/ }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await signUp(page)

  await expect(page.getByText('private.pdf')).toBeHidden()
  await expect(page.getByRole('heading', { name: 'No documents yet' })).toBeVisible()
})
