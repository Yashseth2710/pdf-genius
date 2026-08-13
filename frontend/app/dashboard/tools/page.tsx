import { Combine, FileOutput, LayoutGrid, Minimize2, Scissors } from 'lucide-react'
import Link from 'next/link'
import type { Metadata } from 'next'

import { BackLink } from '@/components/shared/back-link'

export const metadata: Metadata = {
  title: 'Tools',
}

/**
 * Every tool that works today.
 *
 * Tools still to be built are deliberately absent rather than listed as
 * "coming soon": a grid of dead links is a worse first impression than a
 * short one that does what it says.
 */
const TOOLS = [
  {
    href: '/dashboard/tools/merge',
    icon: Combine,
    title: 'Merge PDFs',
    description: 'Join several PDFs into one file, in the order you choose.',
  },
  {
    href: '/dashboard/tools/split',
    icon: Scissors,
    title: 'Split a PDF',
    description: 'Pull pages out by range, one at a time, or as a selection.',
  },
  {
    href: '/dashboard/tools/organise',
    icon: LayoutGrid,
    title: 'Organise pages',
    description: 'See every page, then turn, reorder or remove the ones you want.',
  },
  {
    href: '/dashboard/tools/compress',
    icon: Minimize2,
    title: 'Compress a PDF',
    description: 'Make a PDF smaller, and see exactly how much smaller it got.',
  },
  {
    href: '/dashboard/tools/images-to-pdf',
    icon: FileOutput,
    title: 'Images to PDF',
    description: 'Turn photos and scans into one PDF, a page each, in your order.',
  },
]

export default function ToolsPage() {
  return (
    <div className="space-y-8">
      <div>
        <BackLink href="/dashboard">Your documents</BackLink>
        <h1 className="text-3xl">Tools</h1>
        <p className="text-muted-foreground mt-2">
          Everything here works on the PDFs already in your documents.
        </p>
      </div>

      {/* A ruled list, not a grid of boxes. Five identically-sized cards each
          carrying an icon tile, a heading and a line of text is the default
          shape of a generated page; a list separated by rules says the same
          thing with less furniture, and the icon sits in the line of the title
          where it helps you find a row rather than decorating one. */}
      <ul className="border-t">
        {TOOLS.map((tool) => (
          <li key={tool.href} className="border-b">
            <Link
              href={tool.href}
              className="hover:bg-muted/50 focus-visible:ring-ring group flex items-baseline gap-4 px-3 py-4 transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <tool.icon
                className="text-muted-foreground group-hover:text-brand size-4 shrink-0 translate-y-0.5 transition-colors"
                aria-hidden
              />
              <span className="min-w-0">
                <span className="font-heading block text-lg font-semibold">{tool.title}</span>
                <span className="text-muted-foreground mt-0.5 block text-sm">
                  {tool.description}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
