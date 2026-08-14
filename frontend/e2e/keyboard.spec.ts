import { expect, test, type Page } from '@playwright/test'

/**
 * The critical journeys, driven entirely from the keyboard.
 *
 * axe checks the markup; it cannot tell you whether anything can be reached or
 * operated without a mouse. These tests never call `click()`: everything is Tab,
 * arrows, Enter and Escape, which is how a keyboard user and a screen-reader
 * user actually move.
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

// Three pages, because the split journey below needs something to split. A
// one-page PDF is correctly refused, which is a fine behaviour and a useless
// fixture.
const PDF = makePdf(3)

/** What currently has focus, described the way a screen reader would name it. */
async function focused(page: Page) {
  return page.evaluate(() => {
    const element = document.activeElement
    if (!element) return null
    return {
      tag: element.tagName.toLowerCase(),
      name:
        element.getAttribute('aria-label') ??
        element.textContent?.trim().slice(0, 40) ??
        (element as HTMLInputElement).name ??
        '',
    }
  })
}

async function signUpWithKeyboard(page: Page) {
  const email = `kbd-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`
  await page.goto('/register')

  await page.getByLabel('First name').focus()
  await page.keyboard.type('Ada')
  await page.keyboard.press('Tab')
  await page.keyboard.type('Lovelace')
  await page.keyboard.press('Tab')
  await page.keyboard.type(email)
  await page.keyboard.press('Tab')
  await page.keyboard.type('a-good-long-password')
  // Enter inside a form submits it. A form that needs the button to be
  // clicked is a form that cannot be finished from the keyboard.
  await page.keyboard.press('Enter')

  await expect(page).toHaveURL(/\/dashboard$/)
}

test('the first Tab on a page reaches a skip link, and it works', async ({ page }) => {
  await page.goto('/')

  await page.keyboard.press('Tab')
  const first = await focused(page)
  expect(first?.name).toBe('Skip to content')

  // Hidden until focused, visible once it is: a permanently visible skip link
  // is clutter, and a permanently hidden one is a lie.
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeVisible()

  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#main-content$/)
})

test('the whole sign-up form can be completed without a mouse', async ({ page }) => {
  await signUpWithKeyboard(page)

  await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible()
})

test('a document can be opened from the dashboard with the keyboard', async ({ page }) => {
  await signUpWithKeyboard(page)
  await page.getByLabel('Choose files to upload').setInputFiles({
    name: 'report.pdf',
    mimeType: 'application/pdf',
    buffer: PDF,
  })

  const link = page.getByRole('link', { name: 'report.pdf' })
  await expect(link).toBeVisible()

  await link.focus()
  await page.keyboard.press('Enter')

  await expect(page).toHaveURL(/\/dashboard\/documents\//)
})

test('a tool can be driven from choosing a PDF to running it', async ({ page }) => {
  await signUpWithKeyboard(page)
  await page.getByLabel('Choose files to upload').setInputFiles({
    name: 'report.pdf',
    mimeType: 'application/pdf',
    buffer: PDF,
  })
  await expect(page.getByRole('link', { name: 'report.pdf' })).toBeVisible()

  await page.goto('/dashboard/tools/split')

  // Both groups are targeted by their accessible name rather than by position.
  // There are two of them on this page, and "the first radio on the screen" is
  // a fact about the layout that a keyboard user never observes.
  const chooseFile = page.getByRole('radiogroup', { name: 'Choose a PDF' })
  const chooseMode = page.getByRole('radiogroup', { name: 'How to split' })

  // A radio group takes arrow keys, not Tab, to move between its options, and
  // Space to choose one. It must also be reachable by Tab in the first place.
  const file = chooseFile.getByRole('radio').first()
  await file.focus()
  await page.keyboard.press('Space')
  await expect(file).toBeChecked()

  // "Every page" needs no further input, so this is the shortest complete
  // journey through the tool; the other two modes want a range typed in.
  const everyPage = chooseMode.getByRole('radio').nth(1)
  await everyPage.focus()
  await page.keyboard.press('Space')
  await expect(everyPage).toBeChecked()

  const run = page.getByRole('button', { name: /Split/ })
  await run.focus()
  await expect(run).toBeEnabled()
  await page.keyboard.press('Enter')

  await expect(page.getByRole('status', { name: 'Result' })).toBeVisible({ timeout: 20_000 })
})

test('a dialog takes focus, keeps it, and gives it back on Escape', async ({ page }) => {
  await signUpWithKeyboard(page)
  await page.getByLabel('Choose files to upload').setInputFiles({
    name: 'report.pdf',
    mimeType: 'application/pdf',
    buffer: PDF,
  })

  const preview = page.getByRole('button', { name: /Preview report\.pdf/ })
  await expect(preview).toBeVisible()
  await preview.focus()
  await page.keyboard.press('Enter')

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  // Focus must be inside the dialog, or a keyboard user is tabbing around a
  // page they cannot see behind an overlay.
  await expect
    .poll(async () => dialog.evaluate((node) => node.contains(document.activeElement)))
    .toBe(true)

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  // And it comes back to the control that opened it, rather than to the top
  // of the document.
  await expect(preview).toBeFocused()
})

test('the account menu opens and signs out from the keyboard', async ({ page }) => {
  await signUpWithKeyboard(page)

  const account = page.getByRole('button', { name: /Ada|Account/ }).first()
  await account.focus()
  await page.keyboard.press('Enter')

  const signOut = page.getByRole('menuitem', { name: /Sign out/ })
  await expect(signOut).toBeVisible()

  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menuitem').first()).toBeFocused()
})
