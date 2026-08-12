import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import CompressPage from '@/app/dashboard/tools/compress/page'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { DocumentSummary, ToolRun } from '@/types/api'

const listDocuments = vi.fn()
const compressDocument = vi.fn()

vi.mock('@/lib/documents', () => ({
  listDocuments: (...args: unknown[]) => listDocuments(...args),
  downloadDocument: vi.fn(),
  downloadArchive: vi.fn(),
  fetchDocumentBlob: vi.fn(),
}))

vi.mock('@/lib/tools', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tools')>('@/lib/tools')
  return { ...actual, compressDocument: (...args: unknown[]) => compressDocument(...args) }
})

function doc(id: string, name: string, size: number): DocumentSummary {
  return {
    id,
    original_filename: name,
    mime_type: 'application/pdf',
    file_size: size,
    page_count: 4,
    status: 'READY',
    created_at: '2026-08-13T10:00:00Z',
  }
}

const SCAN = doc('scan-1', 'scan.pdf', 4_000_000)

/** A run as the API describes it, with the sizes it measured. */
function run(outputs: DocumentSummary[], result: Record<string, unknown>): ToolRun {
  return {
    job: {
      id: 'job-1',
      operation: 'COMPRESS',
      status: 'COMPLETED',
      document_id: SCAN.id,
      output_document_ids: outputs.map((output) => output.id),
      options: { level: 'balanced' },
      result,
      error_message: null,
      created_at: '2026-08-13T10:00:00Z',
      completed_at: '2026-08-13T10:00:01Z',
    },
    outputs,
  }
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider delay={0}>
        <CompressPage />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

async function chooseAndRun() {
  await userEvent.click(await screen.findByRole('radio', { name: /scan\.pdf/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Compress PDF' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  listDocuments.mockResolvedValue({ items: [SCAN], total: 1, limit: 100, offset: 0 })
})

describe('CompressPage', () => {
  it('offers the three levels and starts on balanced', async () => {
    renderPage()

    await screen.findByRole('radio', { name: /scan\.pdf/ })
    const levels = screen.getByRole('radiogroup', { name: 'How much to compress' })
    expect(levels).toHaveTextContent('Basic')
    expect(levels).toHaveTextContent('Balanced')
    expect(levels).toHaveTextContent('Strong')
    expect(screen.getByRole('radio', { name: /Balanced/ })).toBeChecked()
  })

  it('promises nothing about the size before running', async () => {
    // The one thing this tool must never do is predict a number it cannot know.
    renderPage()

    await screen.findByRole('radio', { name: /scan\.pdf/ })
    expect(screen.getByText(/Nothing here can tell you the size beforehand/i)).toBeInTheDocument()
  })

  it('reports the measured sizes after a run', async () => {
    compressDocument.mockResolvedValue(
      run([doc('out-1', 'scan-compressed.pdf', 1_000_000)], {
        original_size: 4_000_000,
        final_size: 1_000_000,
        saved_bytes: 3_000_000,
        saved_percent: 75,
        shrank: true,
      }),
    )
    renderPage()

    await chooseAndRun()

    expect(await screen.findByText(/75% smaller/)).toBeInTheDocument()
    expect(screen.getByText(/3\.8 MB → 977 KB/)).toBeInTheDocument()
  })

  it('says plainly when a PDF cannot be made smaller', async () => {
    compressDocument.mockResolvedValue(
      run([], {
        original_size: 4_000_000,
        final_size: 4_000_000,
        saved_bytes: 0,
        saved_percent: 0,
        shrank: false,
      }),
    )
    renderPage()

    await chooseAndRun()

    expect(await screen.findByText(/already as small as it goes/i)).toBeInTheDocument()
    // And it is explicit that nothing was added, rather than leaving the user
    // to wonder where the result went.
    expect(screen.getByText(/Nothing was saved to your documents/)).toBeInTheDocument()
  })

  it('shows no result panel when there was nothing to save', async () => {
    compressDocument.mockResolvedValue(
      run([], { original_size: 100, final_size: 100, saved_bytes: 0, saved_percent: 0 }),
    )
    renderPage()

    await chooseAndRun()

    await screen.findByText(/already as small as it goes/i)
    expect(screen.queryByText('Done')).not.toBeInTheDocument()
  })

  it('sends the level the user chose', async () => {
    compressDocument.mockResolvedValue(
      run([doc('out-1', 'scan-compressed.pdf', 10)], { original_size: 20, final_size: 10 }),
    )
    renderPage()

    await userEvent.click(await screen.findByRole('radio', { name: /scan\.pdf/ }))
    await userEvent.click(screen.getByRole('radio', { name: /Strong/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Compress PDF' }))

    await waitFor(() =>
      expect(compressDocument).toHaveBeenCalledWith(
        expect.objectContaining({ document_id: 'scan-1', level: 'strong' }),
        expect.anything(),
      ),
    )
  })

  it('cannot be run before a PDF is chosen', async () => {
    renderPage()

    await screen.findByRole('radio', { name: /scan\.pdf/ })
    expect(screen.getByRole('button', { name: 'Compress PDF' })).toBeDisabled()
    expect(screen.getByText('Choose a PDF to compress.')).toBeInTheDocument()
  })
})
