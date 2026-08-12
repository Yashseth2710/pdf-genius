import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PreviewButton } from '@/components/tools/preview-button'
import { TooltipProvider } from '@/components/ui/tooltip'

const fetchDocumentBlob = vi.fn()
const loadDocument = vi.fn()

vi.mock('@/lib/documents', () => ({
  fetchDocumentBlob: (...args: unknown[]) => fetchDocumentBlob(...args),
}))

vi.mock('@/lib/pdf-render', () => ({
  loadDocument: (...args: unknown[]) => loadDocument(...args),
  // Resolves with a canvas: the viewer awaits this, and a bare vi.fn() returns
  // undefined, which fails inside an effect where nothing catches it.
  renderPage: vi.fn(() => Promise.resolve(window.document.createElement('canvas'))),
}))

function renderButton(mimeType: string) {
  render(
    <TooltipProvider delay={0}>
      <PreviewButton documentId="doc-1" filename="page-1.jpg" mimeType={mimeType} />
    </TooltipProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchDocumentBlob.mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }))
  loadDocument.mockResolvedValue({ document: { numPages: 1 }, close: vi.fn() })
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:preview')
  globalThis.URL.revokeObjectURL = vi.fn()
})

describe('PreviewButton', () => {
  it('fetches nothing until it is pressed', () => {
    // A list of twenty documents must not download twenty documents.
    renderButton('application/pdf')

    expect(loadDocument).not.toHaveBeenCalled()
    expect(fetchDocumentBlob).not.toHaveBeenCalled()
  })

  it('shows an image in an image viewer, not through PDF.js', async () => {
    // Exported pages are images, and a result that cannot be looked at is the
    // dead end that separate outputs exist to avoid.
    renderButton('image/jpeg')

    await userEvent.click(screen.getByRole('button', { name: 'Preview page-1.jpg' }))

    expect(await screen.findByRole('img', { name: 'page-1.jpg' })).toHaveAttribute(
      'src',
      'blob:preview',
    )
    expect(loadDocument).not.toHaveBeenCalled()
  })

  it('opens a PDF with PDF.js rather than as an image', async () => {
    renderButton('application/pdf')

    await userEvent.click(screen.getByRole('button', { name: 'Preview page-1.jpg' }))

    expect(loadDocument).toHaveBeenCalledWith('doc-1')
    expect(fetchDocumentBlob).not.toHaveBeenCalled()
  })

  it('says so when an image cannot be opened', async () => {
    fetchDocumentBlob.mockRejectedValue(new Error('gone'))
    renderButton('image/png')

    await userEvent.click(screen.getByRole('button', { name: 'Preview page-1.jpg' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('could not be opened')
  })
})
