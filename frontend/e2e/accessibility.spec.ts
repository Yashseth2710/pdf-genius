import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/**
 * Every screen, checked against WCAG 2 A and AA.
 *
 * axe finds the mechanical failures — a control with no name, text that misses
 * contrast, a heading level skipped, a landmark missing. It cannot tell whether
 * an interface makes sense, so this file is a floor rather than a pass mark:
 * the keyboard and focus behaviour it says nothing about is checked in
 * `keyboard.spec.ts`.
 *
 * Run in both themes. Contrast is the most common failure and the two palettes
 * are different colours, so a light-only pass proves nothing about dark.
 */

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

const STANDARD = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

async function signUp(page: Page) {
  const email = `a11y-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`
  await page.goto('/register')
  await page.getByLabel('First name').fill('Ada')
  await page.getByLabel('Last name').fill('Lovelace')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('a-good-long-password')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

/** Every violation, with the offending markup, so a failure is actionable. */
async function audit(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(STANDARD).analyze()

  return violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.map((node) => node.html),
  }))
}

test.describe('signed out', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`the landing page has no violations in ${theme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme })
      await page.goto('/')

      expect(await audit(page)).toEqual([])
    })

    test(`sign in and sign up have no violations in ${theme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme })

      await page.goto('/login')
      expect(await audit(page)).toEqual([])

      await page.goto('/register')
      expect(await audit(page)).toEqual([])
    })
  }
})

test.describe('signed in', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`the dashboard and tools have no violations in ${theme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme })
      await signUp(page)

      // An empty dashboard, which is a different screen from a full one: it is
      // all empty states, and those are easy to leave unlabelled.
      expect(await audit(page)).toEqual([])

      await page.goto('/dashboard/tools')
      expect(await audit(page)).toEqual([])

      await page.goto('/dashboard/history')
      expect(await audit(page)).toEqual([])
    })

    test(`every tool screen has no violations in ${theme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme })
      await signUp(page)

      for (const tool of ['merge', 'split', 'organise', 'compress', 'images-to-pdf']) {
        await page.goto(`/dashboard/tools/${tool}`)
        // These land on their "you have no PDFs yet" state, which is the one a
        // first-time user actually meets.
        expect(await audit(page), `${tool} in ${theme}`).toEqual([])
      }
    })
  }
})

test('a dashboard with real content has no violations', async ({ page }) => {
  // The empty states above hide most of the interface. This is the screen with
  // a document row, its icon buttons and their tooltips actually present.
  await signUp(page)
  await page.getByLabel('Choose files to upload').setInputFiles({
    name: 'report.pdf',
    mimeType: 'application/pdf',
    buffer: PDF,
  })
  await expect(page.getByRole('link', { name: 'report.pdf' })).toBeVisible()

  expect(await audit(page)).toEqual([])
})

test('a tool with a document to choose from has no violations', async ({ page }) => {
  await signUp(page)
  await page.getByLabel('Choose files to upload').setInputFiles({
    name: 'report.pdf',
    mimeType: 'application/pdf',
    buffer: PDF,
  })
  await expect(page.getByRole('link', { name: 'report.pdf' })).toBeVisible()

  await page.goto('/dashboard/tools/split')
  await expect(page.getByText('report.pdf')).toBeVisible()

  expect(await audit(page)).toEqual([])
})
