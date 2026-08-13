import { expect, test, type Page } from '@playwright/test'

/**
 * The history screen, against the real API.
 *
 * Every assertion here is about a job that was really run — the point of a
 * history is that it reflects what happened, and a fixture would prove nothing
 * about that.
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
  const email = `history-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`
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
  await expect(page.getByRole('progressbar')).toHaveCount(0)
  await expect(page.getByText(name).first()).toBeVisible()
}

/** Run a split, so there is something in the history to look at. */
async function runSplit(page: Page, name: string, ranges: string) {
  await page.goto('/dashboard/tools/split')
  await page.getByRole('radio', { name: new RegExp(name.replaceAll('.', String.raw`\.`)) }).click()
  await page.getByLabel('Pages to split out').fill(ranges)
  await page.getByRole('button', { name: 'Split PDF' }).click()
  await expect(page.getByRole('status', { name: 'Result' })).toBeVisible()
}

test('history is reachable from the header and lists what was run', async ({ page }) => {
  await signUp(page)
  await upload(page, 'report.pdf', 6)
  await runSplit(page, 'report.pdf', '1-3')

  await page.getByRole('link', { name: 'History' }).click()

  await expect(page).toHaveURL(/\/dashboard\/history$/)
  await expect(page.getByText(/Split pages 1-3/)).toBeVisible()
})

test('a brand-new account is told what will appear in its history', async ({ page }) => {
  await signUp(page)

  await page.goto('/dashboard/history')

  await expect(page.getByText('Nothing here yet')).toBeVisible()
  await page.getByRole('link', { name: 'Try a tool' }).click()
  await expect(page.getByRole('heading', { name: 'Tools' })).toBeVisible()
})

test('history can be narrowed to one tool', async ({ page }) => {
  await signUp(page)
  await upload(page, 'a.pdf', 2)
  await upload(page, 'b.pdf', 2)
  await runSplit(page, 'a.pdf', '1')

  await page.goto('/dashboard/tools/merge')
  await page.getByRole('checkbox', { name: /a\.pdf/ }).click()
  await page.getByRole('checkbox', { name: /b\.pdf/ }).click()
  await page.getByRole('button', { name: /^Merge/ }).click()
  await expect(page.getByRole('status', { name: 'Result' })).toBeVisible()

  await page.goto('/dashboard/history')
  await expect(page.getByText(/Merged 2 PDFs/)).toBeVisible()
  await expect(page.getByText(/Split pages 1/)).toBeVisible()

  await page.getByLabel('Tool').selectOption('MERGE')

  await expect(page.getByText(/Merged 2 PDFs/)).toBeVisible()
  await expect(page.getByText(/Split pages 1/)).toHaveCount(0)
})

test('an entry can be removed without losing the files it made', async ({ page }) => {
  await signUp(page)
  await upload(page, 'report.pdf', 6)
  await runSplit(page, 'report.pdf', '1-3')

  await page.goto('/dashboard/history')
  await page.getByRole('button', { name: /^Remove this split entry/ }).click()

  await expect(page.getByText('Nothing here yet')).toBeVisible()

  // The file the split produced is still there, which is the whole promise.
  await page.goto('/dashboard')
  await expect(page.getByText('report-1-3.pdf')).toBeVisible()
})

test('deleting a document does not erase the record of what was done to it', async ({ page }) => {
  // The reason document_id is SET NULL rather than CASCADE: tidying up your
  // documents used to silently delete your history.
  await signUp(page)
  await upload(page, 'report.pdf', 6)
  await runSplit(page, 'report.pdf', '2-4')

  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'Delete report.pdf' }).click()
  await expect(page.getByText('report.pdf', { exact: true })).toHaveCount(0)

  await page.goto('/dashboard/history')
  await expect(page.getByText(/Split pages 2-4/)).toBeVisible()
})

test('the dashboard shows what you did last, and links to the rest', async ({ page }) => {
  await signUp(page)
  await upload(page, 'report.pdf', 6)
  await runSplit(page, 'report.pdf', '1-2')

  await page.goto('/dashboard')

  const activity = page.getByRole('heading', { name: 'Recent activity' })
  await expect(activity).toBeVisible()
  await expect(page.getByText(/Split pages 1-2/)).toBeVisible()

  await page.getByRole('link', { name: 'All history' }).click()
  await expect(page).toHaveURL(/\/dashboard\/history$/)
})

test('a brand-new dashboard has no empty activity panel', async ({ page }) => {
  // Nothing at all, rather than a box that exists only to say it is empty.
  await signUp(page)

  await expect(page.getByRole('heading', { name: 'Recent activity' })).toHaveCount(0)
})

test('every tool is one click from the dashboard', async ({ page }) => {
  await signUp(page)

  for (const name of ['Merge PDFs', 'Split a PDF', 'Organise pages', 'Compress', 'Images to PDF']) {
    await expect(page.getByRole('link', { name, exact: true })).toBeVisible()
  }
})
