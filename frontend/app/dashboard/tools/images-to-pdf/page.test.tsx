import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ImagesToPdfPage from '@/app/dashboard/tools/images-to-pdf/page'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { DocumentListPage, DocumentSummary } from '@/types/api'

const listDocuments = vi.fn()
const imagesToPdf = vi.fn()

vi.mock('@/lib/documents', () => ({
  listDocuments: (...args: unknown[]) => listDocuments(...args),
  downloadDocument: vi.fn(),
  downloadArchive: vi.fn(),
  fetchDocumentBlob: vi.fn(),
}))

vi.mock('@/lib/tools', () => ({
  imagesToPdf: (...args: unknown[]) => imagesToPdf(...args),
}))

function doc(id: string, name: string, mime: string): DocumentSummary {
  return {
    id,
    original_filename: name,
    mime_type: mime,
    file_size: 2048,
    page_count: mime === 'application/pdf' ? 3 : null,
    status: 'READY',
    created_at: '2026-08-13T10:00:00Z',
  }
}

const page: DocumentListPage = {
  items: [
    doc('a', 'beach.jpg', 'image/jpeg'),
    doc('b', 'logo.png', 'image/png'),
    doc('c', 'report.pdf', 'application/pdf'),
    doc('d', 'IMG_0421.heic', 'image/heic'),
    doc('e', 'scan.tiff', 'image/tiff'),
    doc('f', 'shot.webp', 'image/webp'),
  ],
  total: 6,
  limit: 100,
  offset: 0,
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider delay={0}>
        <ImagesToPdfPage />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

async function choose(name: string) {
  await userEvent.click(await screen.findByRole('checkbox', { name: new RegExp(name) }))
}

beforeEach(() => {
  vi.clearAllMocks()
  listDocuments.mockResolvedValue(page)
})

describe('ImagesToPdfPage', () => {
  it('offers images and leaves PDFs out of the list', async () => {
    // Every other picker in the app filters to PDFs; this is the one tool that
    // wants the opposite, and offering a PDF here would only fail server-side.
    renderPage()

    expect(await screen.findByRole('checkbox', { name: /beach\.jpg/ })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /logo\.png/ })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /report\.pdf/ })).not.toBeInTheDocument()
  })

  it('offers every image type that can be converted, not just JPG and PNG', async () => {
    // A phone photo is a HEIC and a scan is often a TIFF. Turning either away
    // over its container format is the commonest way this tool disappoints.
    renderPage()

    expect(await screen.findByRole('checkbox', { name: /IMG_0421\.heic/ })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /scan\.tiff/ })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /shot\.webp/ })).toBeInTheDocument()
  })

  it('offers no preview for the images a browser cannot draw', async () => {
    // TIFF and HEIC convert perfectly well; no browser outside Safari will
    // display one, so a preview button would open an empty box.
    renderPage()

    await screen.findByRole('checkbox', { name: /beach\.jpg/ })
    expect(screen.getByRole('button', { name: 'Preview beach.jpg' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Preview shot.webp' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Preview scan.tiff' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Preview IMG_0421.heic' })).not.toBeInTheDocument()
  })

  it('says there are no images when the account has only PDFs', async () => {
    listDocuments.mockResolvedValue({
      items: [doc('c', 'report.pdf', 'application/pdf')],
      total: 1,
      limit: 100,
      offset: 0,
    })
    renderPage()

    expect(await screen.findByText('No images yet')).toBeInTheDocument()
  })

  it('builds the page order from the order they were ticked', async () => {
    renderPage()

    await choose('logo\\.png')
    await choose('beach\\.jpg')

    const order = screen.getByRole('list', { name: 'Page order' })
    const rows = within(order).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('logo.png')
    expect(rows[1]).toHaveTextContent('beach.jpg')
  })

  it('can reorder the pages from the keyboard', async () => {
    renderPage()
    await choose('beach\\.jpg')
    await choose('logo\\.png')

    await userEvent.click(screen.getByRole('button', { name: 'Move logo.png up' }))

    const order = screen.getByRole('list', { name: 'Page order' })
    expect(within(order).getAllByRole('listitem')[0]).toHaveTextContent('logo.png')
  })

  it('sends the images in their chosen order, with the page settings', async () => {
    imagesToPdf.mockResolvedValue({ job: {}, outputs: [] })
    renderPage()

    await choose('logo\\.png')
    await choose('beach\\.jpg')
    await userEvent.click(screen.getByRole('radio', { name: /Letter/ }))
    await userEvent.click(screen.getByRole('radio', { name: 'Landscape' }))
    await userEvent.click(screen.getByRole('button', { name: 'Create PDF' }))

    await waitFor(() =>
      expect(imagesToPdf).toHaveBeenCalledWith(
        {
          document_ids: ['b', 'a'],
          page_size: 'letter',
          orientation: 'landscape',
          output_name: 'images.pdf',
        },
        expect.anything(),
      ),
    )
  })

  it('hides orientation when every page is the shape of its own image', async () => {
    renderPage()
    await choose('beach\\.jpg')

    expect(screen.getByRole('radiogroup', { name: 'Orientation' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('radio', { name: /Match the image/ }))

    expect(screen.queryByRole('radiogroup', { name: 'Orientation' })).not.toBeInTheDocument()
  })

  it('cannot be run with nothing chosen', async () => {
    renderPage()

    await screen.findByRole('checkbox', { name: /beach\.jpg/ })
    expect(screen.getByRole('button', { name: 'Create PDF' })).toBeDisabled()
    expect(screen.getByText('Choose at least one image.')).toBeInTheDocument()
  })

  it('can be run with a single image, unlike merging', async () => {
    // One photo into one PDF is a perfectly ordinary thing to want.
    renderPage()

    await choose('beach\\.jpg')

    expect(screen.getByRole('button', { name: 'Create PDF' })).toBeEnabled()
  })
})
