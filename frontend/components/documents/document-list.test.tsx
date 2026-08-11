import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DocumentList } from '@/components/documents/document-list'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { DocumentListPage } from '@/types/api'

const listDocuments = vi.fn()
const deleteDocument = vi.fn()
const downloadDocument = vi.fn()

vi.mock('@/lib/documents', () => ({
  listDocuments: (...args: unknown[]) => listDocuments(...args),
  deleteDocument: (...args: unknown[]) => deleteDocument(...args),
  downloadDocument: (...args: unknown[]) => downloadDocument(...args),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const page: DocumentListPage = {
  items: [
    {
      id: 'doc-1',
      original_filename: 'quarterly-report.pdf',
      mime_type: 'application/pdf',
      file_size: 184_320,
      page_count: 12,
      status: 'READY',
      created_at: '2026-08-11T10:00:00Z',
    },
  ],
  total: 1,
  limit: 20,
  offset: 0,
}

function renderList() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      {/* No delay, so a test does not have to wait one out. */}
      <TooltipProvider delay={0}>
        <DocumentList />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  listDocuments.mockResolvedValue(page)
})

describe('DocumentList', () => {
  it('shows a document with its size and page count', async () => {
    renderList()

    expect(await screen.findByText('quarterly-report.pdf')).toBeInTheDocument()
    expect(screen.getByText('180 KB · 12 pages')).toBeInTheDocument()
  })

  it('explains the download button on hover', async () => {
    renderList()
    const button = await screen.findByRole('button', {
      name: 'Download quarterly-report.pdf',
    })

    await userEvent.hover(button)

    expect(await screen.findByText('Download')).toBeInTheDocument()
  })

  it('explains the delete button on hover', async () => {
    renderList()
    const button = await screen.findByRole('button', {
      name: 'Delete quarterly-report.pdf',
    })

    await userEvent.hover(button)

    expect(await screen.findByText('Delete')).toBeInTheDocument()
  })

  it('downloads under the name the user gave the file', async () => {
    renderList()

    await userEvent.click(
      await screen.findByRole('button', { name: 'Download quarterly-report.pdf' }),
    )

    expect(downloadDocument).toHaveBeenCalledWith('doc-1', 'quarterly-report.pdf')
  })

  it('deletes the document it belongs to', async () => {
    renderList()

    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete quarterly-report.pdf' }),
    )

    // Only the first argument is ours: TanStack Query passes its own context
    // as a second argument to mutationFn.
    expect(deleteDocument.mock.calls[0][0]).toBe('doc-1')
  })

  it('says so when there is nothing to show', async () => {
    listDocuments.mockResolvedValue({ ...page, items: [], total: 0 })

    renderList()

    expect(await screen.findByRole('heading', { name: 'No documents yet' })).toBeInTheDocument()
  })

  it('offers a retry when the list cannot be loaded', async () => {
    listDocuments.mockRejectedValue(new Error('offline'))

    renderList()

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your documents')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
