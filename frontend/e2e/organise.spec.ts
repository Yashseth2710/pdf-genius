import { expect, test, type Page } from '@playwright/test'

/**
 * The page organiser, against the real API and a real PDF.js render.
 *
 * These tests are the only place the PDF.js worker is exercised: a worker that
 * fails to resolve leaves the grid stuck on skeletons, which no unit test in
 * jsdom would notice.
 */

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
  const email = `organise-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`
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
  // The progress bar going away is what means "stored"; the filename appears
  // on the progress row first.
  await expect(page.getByRole('progressbar')).toHaveCount(0)
  await expect(page.getByText(name).first()).toBeVisible()
}

async function openOrganiser(page: Page, name: string) {
  await page.goto('/dashboard/tools/organise')
  await page.getByRole('radio', { name: new RegExp(name.replaceAll('.', String.raw`\.`)) }).click()
  await expect(page.getByRole('list', { name: 'Pages' })).toBeVisible()
}

test('every page of the document is shown, drawn by PDF.js', async ({ page }) => {
  await signUp(page)
  await upload(page, 'report.pdf', 4)

  await openOrganiser(page, 'report.pdf')

  await expect(page.getByRole('listitem')).toHaveCount(4)
  // A canvas per page proves the worker resolved and actually drew something.
  // Without it the grid sits on skeleton placeholders and still "renders".
  await expect(page.locator('[data-testid="page-card-1"] canvas')).toBeVisible()
  await expect(page.locator('canvas')).toHaveCount(4)
})

test('nothing can be saved until something changes', async ({ page }) => {
  await signUp(page)
  await upload(page, 'report.pdf', 3)

  await openOrganiser(page, 'report.pdf')

  await expect(page.getByRole('button', { name: /^Save/ })).toBeDisabled()
  await expect(
    page.getByText('Nothing has changed yet, so there is nothing to save.'),
  ).toBeVisible()
})

test('a page can be removed and put back', async ({ page }) => {
  await signUp(page)
  await upload(page, 'report.pdf', 3)
  await openOrganiser(page, 'report.pdf')

  await page.getByRole('button', { name: 'Remove Page 2' }).click()

  await expect(page.locator('[data-testid="page-card-2"][data-removed="true"]')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Save 2 pages/ })).toBeEnabled()

  await page.getByRole('button', { name: 'Put Page 2 back' }).click()

  await expect(page.getByRole('button', { name: /^Save 3 pages/ })).toBeDisabled()
})

test('removing every page is refused rather than sent', async ({ page }) => {
  await signUp(page)
  await upload(page, 'report.pdf', 2)
  await openOrganiser(page, 'report.pdf')

  await page.getByRole('button', { name: 'Remove Page 1' }).click()
  await page.getByRole('button', { name: 'Remove Page 2' }).click()

  await expect(page.getByText('Every page is removed. Put at least one back.')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Save/ })).toBeDisabled()
})

test('pages can be turned, and the turn is shown before saving', async ({ page }) => {
  await signUp(page)
  await upload(page, 'report.pdf', 2)
  await openOrganiser(page, 'report.pdf')

  await page.getByRole('button', { name: 'Turn Page 1 right' }).click()

  await expect(page.locator('[data-testid="page-card-1"]')).toContainText('90°')
  await expect(page.getByRole('status').filter({ hasText: 'turned' })).toBeVisible()
})

test('a reordered and edited document is saved as a new file', async ({ page }) => {
  await signUp(page)
  await upload(page, 'report.pdf', 4)
  await openOrganiser(page, 'report.pdf')

  await page.getByRole('button', { name: 'Remove Page 3' }).click()
  await page.getByRole('button', { name: 'Turn Page 1 right' }).click()
  await page.getByRole('button', { name: 'Move Page 4 earlier' }).click()

  await page.getByRole('button', { name: /^Save 3 pages/ }).click()

  const result = page.getByRole('status', { name: 'Result' })
  await expect(result).toBeVisible()
  await expect(result).toContainText('3 pages')
  await expect(result).toContainText('report-organised.pdf')
})

test('the original is left alone', async ({ page }) => {
  await signUp(page)
  await upload(page, 'report.pdf', 3)
  await openOrganiser(page, 'report.pdf')

  await page.getByRole('button', { name: 'Remove Page 1' }).click()
  await page.getByRole('button', { name: /^Save 2 pages/ }).click()
  await expect(page.getByRole('status', { name: 'Result' })).toBeVisible()

  await page.goto('/dashboard')

  await expect(page.getByText('report.pdf', { exact: true })).toBeVisible()
  await expect(page.getByText('report-organised.pdf')).toBeVisible()
})

test('a document can be previewed from the list', async ({ page }) => {
  await signUp(page)
  await upload(page, 'report.pdf', 3)

  await page.getByRole('link', { name: 'report.pdf' }).click()

  await expect(page.getByRole('heading', { name: 'report.pdf' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Pages' })).toBeVisible()
  await expect(page.locator('canvas')).toHaveCount(3)
})

test('a page opens full screen and can be walked through', async ({ page }) => {
  await signUp(page)
  await upload(page, 'report.pdf', 3)

  await page.getByRole('link', { name: 'report.pdf' }).click()
  await page.getByRole('button', { name: 'View page 2 full screen' }).click()

  const viewer = page.getByRole('dialog')
  await expect(viewer).toContainText('page 2 of 3')
  // Drawn at full size, not the 160px thumbnail.
  await expect(viewer.locator('canvas')).toBeVisible()
  const width = await viewer.locator('canvas').evaluate((canvas) => canvas.clientWidth)
  expect(width).toBeGreaterThan(400)

  await viewer.getByRole('button', { name: 'Next page' }).click()
  await expect(viewer).toContainText('page 3 of 3')
  await expect(viewer.getByRole('button', { name: 'Next page' })).toBeDisabled()

  await page.keyboard.press('ArrowLeft')
  await expect(viewer).toContainText('page 2 of 3')

  await page.keyboard.press('Escape')
  await expect(viewer).toBeHidden()
})

test('a page opens showing the whole page, and can be zoomed in', async ({ page }) => {
  await signUp(page)
  await upload(page, 'report.pdf', 2)

  await page.getByRole('link', { name: 'report.pdf' }).click()
  await page.getByRole('button', { name: 'View page 1 full screen' }).click()

  const viewer = page.getByRole('dialog')
  const canvas = viewer.locator('canvas')
  await expect(canvas).toBeVisible()
  await expect(viewer).toContainText('Fit page')

  // The whole page fits inside the area it is drawn in. Before this, the page
  // was scaled to the window's width and an A4 page ran far off the bottom.
  const fitted = await canvas.evaluate((element) => ({
    page: element.clientHeight,
    stage: element.closest('[data-slot="dialog-content"]')!.clientHeight,
  }))
  expect(fitted.page).toBeLessThanOrEqual(fitted.stage)

  await viewer.getByRole('button', { name: 'Zoom in' }).click()
  await expect(viewer).toContainText('125%')
  await expect
    .poll(async () => canvas.evaluate((element) => element.clientHeight))
    .toBeGreaterThan(fitted.page)

  await viewer.getByRole('button', { name: 'Fit the whole page' }).click()
  await expect(viewer).toContainText('Fit page')
})

test('a PDF can be previewed from the tool that is about to change it', async ({ page }) => {
  await signUp(page)
  await upload(page, 'report.pdf', 3)

  await page.goto('/dashboard/tools/split')
  await page.getByRole('button', { name: 'Preview report.pdf' }).click()

  const viewer = page.getByRole('dialog')
  await expect(viewer).toContainText('page 1 of 3')
  await expect(viewer.locator('canvas')).toBeVisible()
})

test('a result can be checked before it is downloaded', async ({ page }) => {
  await signUp(page)
  await upload(page, 'report.pdf', 5)

  await page.goto('/dashboard/tools/split')
  await page.getByRole('radio', { name: /report\.pdf/ }).click()
  await page.getByLabel('Pages to split out').fill('2-3')
  await page.getByRole('button', { name: 'Split PDF' }).click()

  const result = page.getByRole('status', { name: 'Result' })
  await expect(result).toBeVisible()
  await result.getByRole('button', { name: /^Preview/ }).click()

  // Two pages came out, and they can be looked at without downloading first.
  await expect(page.getByRole('dialog')).toContainText('page 1 of 2')
})

test('choosing a different document starts from a clean plan', async ({ page }) => {
  await signUp(page)
  await upload(page, 'first.pdf', 3)
  await upload(page, 'second.pdf', 2)
  await openOrganiser(page, 'first.pdf')

  await page.getByRole('button', { name: 'Remove Page 1' }).click()
  await expect(page.getByRole('button', { name: /^Save 2 pages/ })).toBeEnabled()

  await page.getByRole('radio', { name: /second\.pdf/ }).click()

  // The second document has two pages, both kept: the first document's
  // deletion must not carry over.
  await expect(page.getByRole('listitem')).toHaveCount(2)
  await expect(page.getByRole('button', { name: /^Save 2 pages/ })).toBeDisabled()
})
