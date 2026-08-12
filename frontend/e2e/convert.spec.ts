import { expect, test, type Page } from '@playwright/test'

/**
 * Compressing and converting, against the real API.
 *
 * The compression journey covered here is the one that cannot be faked: a PDF
 * that will not get any smaller. It is the honest-answer path, it is the one
 * the roadmap warned about, and unlike a big saving it is exactly reproducible
 * from a file this test can build itself.
 */

/** A structurally valid PDF with `pages` empty pages. */
function makePdf(pages: number): Buffer {
  const kids = Array.from({ length: pages }, (_, index) => `${index + 3} 0 R`).join(' ')
  const pageObjects = Array.from(
    { length: pages },
    (_, index) =>
      `${index + 3} 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj`,
  ).join('\n')

  return Buffer.from(
    `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[${kids}]/Count ${pages}>>endobj
${pageObjects}
trailer<</Root 1 0 R/Size ${pages + 3}>>
%%EOF
`,
    'latin1',
  )
}

/** A real, if very small, PNG. */
function makePng(): Buffer {
  return Buffer.from(
    '89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
      '1f15c4890000000a49444154789c630001000005000' +
      '10d0a2db40000000049454e44ae426082',
    'hex',
  )
}

async function signUp(page: Page) {
  const email = `convert-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`
  await page.goto('/register')
  await page.getByLabel('First name').fill('Ada')
  await page.getByLabel('Last name').fill('Lovelace')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('a-good-long-password')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

async function uploadFile(page: Page, name: string, mimeType: string, buffer: Buffer) {
  await page.getByLabel('Choose files to upload').setInputFiles({ name, mimeType, buffer })
  // The progress bar disappearing is what actually means "stored"; the
  // filename appears on the progress row first, and matching that would let
  // the test navigate away mid-upload and cancel it.
  await expect(page.getByRole('progressbar')).toHaveCount(0)
  await expect(page.getByText(name).first()).toBeVisible()
}

const uploadPdf = (page: Page, name: string, pages: number) =>
  uploadFile(page, name, 'application/pdf', makePdf(pages))

const uploadPng = (page: Page, name: string) => uploadFile(page, name, 'image/png', makePng())

test('the new tools are on the tools page', async ({ page }) => {
  await signUp(page)

  await page.goto('/dashboard/tools')

  await expect(page.getByRole('link', { name: /Compress a PDF/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Images to PDF/ })).toBeVisible()
})

test('a PDF that cannot be compressed says so instead of saving a copy', async ({ page }) => {
  await signUp(page)
  await uploadPdf(page, 'plain.pdf', 3)

  await page.goto('/dashboard/tools/compress')
  await page.getByRole('radio', { name: /plain\.pdf/ }).click()
  await page.getByRole('radio', { name: /Strong/ }).click()
  await page.getByRole('button', { name: 'Compress PDF' }).click()

  const result = page.getByRole('status', { name: 'Result' })
  await expect(result).toContainText('Already as small as it goes')

  // The real check: nothing was added to the documents. A tool that quietly
  // saved a same-sized duplicate would look identical up to this point.
  await page.goto('/dashboard')
  await expect(page.getByText('plain.pdf')).toHaveCount(1)
})

test('images become one PDF in the order they were arranged', async ({ page }) => {
  await signUp(page)
  await uploadPng(page, 'first.png')
  await uploadPng(page, 'second.png')

  await page.goto('/dashboard/tools/images-to-pdf')
  await page.getByRole('checkbox', { name: /first\.png/ }).click()
  await page.getByRole('checkbox', { name: /second\.png/ }).click()

  const order = page.getByRole('list', { name: 'Page order' })
  await expect(order.getByRole('listitem').first()).toContainText('first.png')

  await page.getByRole('button', { name: 'Move second.png up' }).click()
  await expect(order.getByRole('listitem').first()).toContainText('second.png')

  await page.getByRole('button', { name: 'Create PDF' }).click()

  const result = page.getByRole('status', { name: 'Result' })
  // Two images in, one PDF of two pages out — counted by the server after
  // reopening what it produced.
  await expect(result).toContainText('2 pages')

  const download = page.waitForEvent('download')
  await result.getByRole('button', { name: 'Download images.pdf' }).click()
  expect((await download).suggestedFilename()).toBe('images.pdf')
})

test('the images tool offers images and not PDFs', async ({ page }) => {
  await signUp(page)
  await uploadPdf(page, 'report.pdf', 1)
  await uploadPng(page, 'photo.png')

  await page.goto('/dashboard/tools/images-to-pdf')

  await expect(page.getByRole('checkbox', { name: /photo\.png/ })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: /report\.pdf/ })).toHaveCount(0)
})

test('an image can be checked before it is bound into a PDF', async ({ page }) => {
  // Every other picker in the app offers a preview, and choosing the wrong
  // photo is exactly as easy as choosing the wrong PDF.
  await signUp(page)
  await uploadPng(page, 'photo.png')

  await page.goto('/dashboard/tools/images-to-pdf')
  await page.getByRole('button', { name: 'Preview photo.png' }).click()

  await expect(page.getByRole('img', { name: 'photo.png' })).toBeVisible()
})
