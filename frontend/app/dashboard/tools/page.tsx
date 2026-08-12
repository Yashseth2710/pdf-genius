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
        <h1 className="text-2xl font-semibold tracking-tight">Tools</h1>
        <p className="text-muted-foreground mt-1">
          Everything here works on the PDFs already in your documents.
        </p>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2">
        {TOOLS.map((tool) => (
          <li key={tool.href}>
            <Link
              href={tool.href}
              className="hover:border-primary/50 hover:bg-muted/40 focus-visible:ring-ring block h-full rounded-xl border p-5 transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <span className="bg-primary/10 text-primary mb-4 flex size-10 items-center justify-center rounded-lg">
                <tool.icon className="size-5" aria-hidden />
              </span>
              <span className="block font-medium">{tool.title}</span>
              <span className="text-muted-foreground mt-1 block text-sm">{tool.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
