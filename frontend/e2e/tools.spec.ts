import { expect, test, type Page } from '@playwright/test'

/**
 * Merging and splitting, against the real API, with real PDFs going in and a
 * real file coming back out.
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

async function signUp(page: Page) {
  const email = `tools-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`
  await page.goto('/register')
  await page.getByLabel('First name').fill('Ada')
  await page.getByLabel('Last name').fill('Lovelace')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('a-good-long-password')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

async function upload(page: Page, name: string, pages: number) {
  await page.getByLabel('Choose files to upload').setInputFiles({
    name,
    mimeType: 'application/pdf',
    buffer: makePdf(pages),
  })
  // The filename appears twice while an upload is running: once on the
  // progress row and once, later, in the document list. Waiting for the text
  // alone would match the progress row and let the test navigate away
  // mid-upload, cancelling it. The progress bar disappearing is what actually
  // means "stored".
  await expect(page.getByRole('progressbar')).toHaveCount(0)
  await expect(page.getByText(name).first()).toBeVisible()
}

test('the tools page is reachable from the header', async ({ page }) => {
  await signUp(page)

  await page.getByRole('link', { name: 'Tools' }).click()

  await expect(page.getByRole('heading', { name: 'Tools' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Merge PDFs/ })).toBeVisible()
})

test('a tool tells you there is nothing to work on before anything is uploaded', async ({
  page,
}) => {
  await signUp(page)

  await page.goto('/dashboard/tools/merge')

  await expect(page.getByText('Nothing to work with yet')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Merge/ })).toBeDisabled()
})

test('two PDFs can be merged and the result downloaded', async ({ page }) => {
  await signUp(page)
  await upload(page, 'cover.pdf', 1)
  await upload(page, 'body.pdf', 3)

  await page.goto('/dashboard/tools/merge')

  await page.getByRole('checkbox', { name: /cover\.pdf/ }).click()
  await page.getByRole('checkbox', { name: /body\.pdf/ }).click()
  await page.getByRole('button', { name: /^Merge/ }).click()

  const result = page.getByRole('status', { name: 'Result' })
  await expect(result).toBeVisible()
  // 1 page + 3 pages, counted by the server after reopening the merged file.
  await expect(result).toContainText('4 pages')

  const download = page.waitForEvent('download')
  await result.getByRole('button', { name: 'Download merged.pdf' }).click()
  expect((await download).suggestedFilename()).toBe('merged.pdf')
})

test('the merge order can be changed before running it', async ({ page }) => {
  await signUp(page)
  await upload(page, 'first.pdf', 1)
  await upload(page, 'second.pdf', 1)

  await page.goto('/dashboard/tools/merge')
  await page.getByRole('checkbox', { name: /first\.pdf/ }).click()
  await page.getByRole('checkbox', { name: /second\.pdf/ }).click()

  const order = page.getByRole('list', { name: 'Merge order' })
  await expect(order.getByRole('listitem').first()).toContainText('first.pdf')

  await page.getByRole('button', { name: 'Move second.pdf up' }).click()

  await expect(order.getByRole('listitem').first()).toContainText('second.pdf')
})

test('a merge result is saved as a document of its own', async ({ page }) => {
  await signUp(page)
  await upload(page, 'one.pdf', 1)
  await upload(page, 'two.pdf', 1)

  await page.goto('/dashboard/tools/merge')
  await page.getByRole('checkbox', { name: /one\.pdf/ }).click()
  await page.getByRole('checkbox', { name: /two\.pdf/ }).click()
  await page.getByRole('button', { name: /^Merge/ }).click()
  await expect(page.getByRole('status', { name: 'Result' })).toBeVisible()

  await page.goto('/dashboard')

  await expect(page.getByText('merged.pdf')).toBeVisible()
})

test('a PDF can be split by page range', async ({ page }) => {
  await signUp(page)
  await upload(page, 'report.pdf', 6)

  await page.goto('/dashboard/tools/split')
  await page.getByRole('radio', { name: /report\.pdf/ }).click()
  await page.getByLabel('Pages to split out').fill('2-4')
  await page.getByRole('button', { name: 'Split PDF' }).click()

  const result = page.getByRole('status', { name: 'Result' })
  await expect(result).toContainText('3 pages')

  const download = page.waitForEvent('download')
  await result.getByRole('button', { name: 'Download report-2-4.pdf' }).click()
  expect((await download).suggestedFilename()).toBe('report-2-4.pdf')
})

test('several ranges come back as separate PDFs, not an archive', async ({ page }) => {
  await signUp(page)
  await upload(page, 'report.pdf', 8)

  await page.goto('/dashboard/tools/split')
  await page.getByRole('radio', { name: /report\.pdf/ }).click()
  await page.getByLabel('Pages to split out').fill('1-2, 5, 7-8')
  await page.getByRole('button', { name: 'Split PDF' }).click()

  const result = page.getByRole('status', { name: 'Result' })
  await expect(result).toContainText('Done — 3 files')
  await expect(result.getByRole('listitem')).toHaveCount(3)
  await expect(result).toContainText('report-1-2.pdf')
  await expect(result).toContainText('report-7-8.pdf')

  // Each part downloads on its own...
  const one = page.waitForEvent('download')
  await result.getByRole('button', { name: 'Download report-5.pdf' }).click()
  expect((await one).suggestedFilename()).toBe('report-5.pdf')

  // ...and they can still be collected in one go, zipped on the way out.
  const all = page.waitForEvent('download')
  await result.getByRole('button', { name: 'Download all 3' }).click()
  expect((await all).suggestedFilename()).toBe('report-split.zip')
})

test('split results are ordinary documents that other tools can use', async ({ page }) => {
  await signUp(page)
  await upload(page, 'report.pdf', 6)

  await page.goto('/dashboard/tools/split')
  await page.getByRole('radio', { name: /report\.pdf/ }).click()
  await page.getByLabel('Pages to split out').fill('1-2, 5-6')
  await page.getByRole('button', { name: 'Split PDF' }).click()
  await expect(page.getByRole('status', { name: 'Result' })).toBeVisible()

  // They are in the documents list, previewable, and offered by other tools -
  // none of which is true of an archive.
  await page.goto('/dashboard')
  await expect(page.getByText('report-1-2.pdf')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Preview report-1-2.pdf' })).toBeVisible()

  await page.goto('/dashboard/tools/merge')
  await expect(page.getByRole('checkbox', { name: /report-1-2\.pdf/ })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: /report-5-6\.pdf/ })).toBeVisible()
})

test('a page range past the end of the document is explained, not swallowed', async ({ page }) => {
  await signUp(page)
  await upload(page, 'short.pdf', 2)

  await page.goto('/dashboard/tools/split')
  await page.getByRole('radio', { name: /short\.pdf/ }).click()
  await page.getByLabel('Pages to split out').fill('1-9')
  await page.getByRole('button', { name: 'Split PDF' }).click()

  // Scoped: Next renders its own role="alert" route announcer.
  await expect(page.locator('p[role="alert"]')).toContainText('2 pages')
  await expect(page.getByRole('status', { name: 'Result' })).toBeHidden()
})

test('selected pages can be pulled into one new PDF', async ({ page }) => {
  await signUp(page)
  await upload(page, 'report.pdf', 10)

  await page.goto('/dashboard/tools/split')
  await page.getByRole('radio', { name: /report\.pdf/ }).click()
  await page.getByRole('radio', { name: /Selected pages into one file/ }).click()
  await page.getByLabel('Pages to keep').fill('2, 5, 9')
  await page.getByRole('button', { name: 'Split PDF' }).click()

  await expect(page.getByRole('status', { name: 'Result' })).toContainText('3 pages')
})
