import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import SplitPage from '@/app/dashboard/tools/split/page'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { DocumentListPage, DocumentSummary } from '@/types/api'

const listDocuments = vi.fn()
const splitDocument = vi.fn()

vi.mock('@/lib/documents', () => ({
  listDocuments: (...args: unknown[]) => listDocuments(...args),
  downloadDocument: vi.fn(),
}))

vi.mock('@/lib/tools', () => ({
  splitDocument: (...args: unknown[]) => splitDocument(...args),
}))

function doc(id: string, name: string, pageCount: number | null = 10): DocumentSummary {
  return {
    id,
    original_filename: name,
    mime_type: 'application/pdf',
    file_size: 4096,
    page_count: pageCount,
    status: 'READY',
    created_at: '2026-08-11T10:00:00Z',
  }
}

const page: DocumentListPage = {
  items: [doc('a', 'report.pdf')],
  total: 1,
  limit: 100,
  offset: 0,
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delay={0}>
        <SplitPage />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

async function chooseReport() {
  await userEvent.click(await screen.findByRole('radio', { name: /report\.pdf/ }))
}

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  listDocuments.mockResolvedValue(page)
  splitDocument.mockResolvedValue({
    job: { id: 'job-1', operation: 'SPLIT', status: 'COMPLETED' },
    outputs: [doc('out', 'report-2-4.pdf', 3)],
  })
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleError.mockRestore()
})

describe('Split page', () => {
  it('will not split until a PDF is chosen', async () => {
    renderPage()

    expect(await screen.findByRole('radio', { name: /report\.pdf/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Split PDF' })).toBeDisabled()
    expect(screen.getByText('Choose a PDF to split.')).toBeInTheDocument()
  })

  it('does not warn about switching between controlled and uncontrolled', async () => {
    // Choosing a document used to flip the radio group from uncontrolled to
    // controlled, because a null value was being collapsed to undefined.
    renderPage()
    await chooseReport()

    expect(consoleError).not.toHaveBeenCalled()
  })

  it('sends the ranges the user typed', async () => {
    renderPage()
    await chooseReport()

    await userEvent.type(screen.getByLabelText('Pages to split out'), '2-4')
    await userEvent.click(screen.getByRole('button', { name: 'Split PDF' }))

    expect(splitDocument.mock.calls[0][0]).toEqual({
      document_id: 'a',
      mode: 'ranges',
      ranges: '2-4',
    })
  })

  it('needs a range before it will run', async () => {
    renderPage()
    await chooseReport()

    expect(screen.getByRole('button', { name: 'Split PDF' })).toBeDisabled()
  })

  it('tells the user how long the document is, so a range can be judged', async () => {
    renderPage()
    await chooseReport()

    expect(screen.getByText(/This PDF has 10 pages\./)).toBeInTheDocument()
  })

  it('needs no range for every-page mode', async () => {
    renderPage()
    await chooseReport()

    await userEvent.click(screen.getByRole('radio', { name: /Every page separately/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Split PDF' }))

    expect(splitDocument.mock.calls[0][0]).toEqual({ document_id: 'a', mode: 'every_page' })
  })

  it('reads a page selection out of the text typed', async () => {
    renderPage()
    await chooseReport()

    await userEvent.click(screen.getByRole('radio', { name: /Selected pages into one file/ }))
    await userEvent.type(screen.getByLabelText('Pages to keep'), '2, 5, 9')
    await userEvent.click(screen.getByRole('button', { name: 'Split PDF' }))

    expect(splitDocument.mock.calls[0][0]).toEqual({
      document_id: 'a',
      mode: 'pages',
      pages: [2, 5, 9],
    })
  })

  it('shows the result with a download once the split finishes', async () => {
    renderPage()
    await chooseReport()

    await userEvent.type(screen.getByLabelText('Pages to split out'), '2-4')
    await userEvent.click(screen.getByRole('button', { name: 'Split PDF' }))

    const result = await screen.findByRole('status', { name: 'Result' })
    expect(within(result).getByText('report-2-4.pdf')).toBeInTheDocument()
    expect(
      within(result).getByRole('button', { name: 'Download report-2-4.pdf' }),
    ).toBeInTheDocument()
  })

  it('shows the reason a range was rejected', async () => {
    const { ApiError } = await import('@/lib/api')
    splitDocument.mockRejectedValue(
      new ApiError(
        'INVALID_PAGE_RANGE',
        "'1-99' goes past the end of the document, which has 10 pages.",
        422,
      ),
    )
    renderPage()
    await chooseReport()

    await userEvent.type(screen.getByLabelText('Pages to split out'), '1-99')
    await userEvent.click(screen.getByRole('button', { name: 'Split PDF' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('which has 10 pages')
  })
})
