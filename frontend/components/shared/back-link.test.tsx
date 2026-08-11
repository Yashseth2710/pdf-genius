import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { BackLink } from '@/components/shared/back-link'

describe('BackLink', () => {
  it('is a link, so it can be opened in a new tab or middle-clicked', () => {
    render(<BackLink href="/dashboard">Your documents</BackLink>)

    const link = screen.getByRole('link', { name: 'Your documents' })
    expect(link).toHaveAttribute('href', '/dashboard')
  })

  it('names where it goes rather than saying "back"', () => {
    // "Back" tells you nothing about where you will end up, and is wrong the
    // moment someone arrives from somewhere unexpected.
    render(<BackLink href="/dashboard/tools">All tools</BackLink>)

    expect(screen.getByRole('link', { name: 'All tools' })).toBeInTheDocument()
  })

  it('hides its arrow from screen readers, which have the link text', () => {
    const { container } = render(<BackLink href="/dashboard">Your documents</BackLink>)

    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})
