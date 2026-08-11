import { ArrowRight, Combine, FileImage, Minimize2, Scissors, Sparkles, Stamp } from 'lucide-react'
import Link from 'next/link'

import { SiteHeader } from '@/components/shared/site-header'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const tools = [
  {
    icon: Combine,
    name: 'Merge PDFs',
    description: 'Combine several documents into one, in the order you choose.',
  },
  {
    icon: Scissors,
    name: 'Split PDFs',
    description: 'Pull out the pages you need, by range or one at a time.',
  },
  {
    icon: Minimize2,
    name: 'Compress',
    description: 'Shrink a file that is too large to send, without wrecking it.',
  },
  {
    icon: FileImage,
    name: 'Convert',
    description: 'Images into a PDF, or pages back out as images.',
  },
  {
    icon: Stamp,
    name: 'Watermark',
    description: 'Stamp a document before you share it with anyone.',
  },
  {
    icon: Sparkles,
    name: 'Ask your PDF',
    description: 'Summarise a document, or ask it a question and get page references.',
  },
]

export default function HomePage() {
  return (
    <>
      <SiteHeader />

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          {/* A soft wash behind the hero rather than a heavy gradient block */}
          <div
            aria-hidden
            className="from-primary/8 pointer-events-none absolute inset-0 bg-gradient-to-b via-transparent to-transparent"
          />
          <div className="relative mx-auto max-w-3xl px-4 py-24 text-center sm:px-6 sm:py-32">
            <p className="text-muted-foreground mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium">
              <span className="bg-primary size-1.5 rounded-full" aria-hidden />
              Free to use. No adverts.
            </p>

            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
              Your PDFs. One powerful workspace.
            </h1>

            <p className="text-muted-foreground mx-auto mt-6 max-w-xl text-lg text-pretty">
              Merge, split, compress, convert, analyse and understand your documents from one simple
              platform — instead of five different websites.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              {/* Real links wearing the button styles. Rendering a Button
                  "as" a link makes Base UI announce it as role="button",
                  which is wrong for something that navigates. */}
              <Link
                href="/register"
                className={cn(buttonVariants({ size: 'lg' }), 'w-full sm:w-auto')}
              >
                Get started
                <ArrowRight aria-hidden />
              </Link>
              <Link
                href="#tools"
                className={cn(
                  buttonVariants({ size: 'lg', variant: 'outline' }),
                  'w-full sm:w-auto',
                )}
              >
                Explore tools
              </Link>
            </div>
          </div>
        </section>

        {/* Tools */}
        <section id="tools" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-24 sm:px-6">
          <div className="mb-12 text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Everything you actually need
            </h2>
            <p className="text-muted-foreground mt-3">
              The tools people reach for most, in one place.
            </p>
          </div>

          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tools.map((tool) => (
              <li
                key={tool.name}
                className="group hover:border-primary/30 rounded-xl border p-6 transition-colors hover:shadow-sm"
              >
                <span className="bg-primary/10 text-primary mb-4 flex size-10 items-center justify-center rounded-lg">
                  <tool.icon className="size-5" aria-hidden />
                </span>
                <h3 className="font-medium">{tool.name}</h3>
                <p className="text-muted-foreground mt-1.5 text-sm">{tool.description}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Privacy */}
        <section className="border-t">
          <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight">Your documents stay yours</h2>
            <p className="text-muted-foreground mt-4 text-pretty">
              Files are private to your account and never publicly readable. Temporary files are
              deleted as soon as an operation finishes, and you can delete anything you have
              uploaded at any time.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="text-muted-foreground mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-8 text-sm sm:flex-row sm:px-6">
          <p>PDF Genius — Everything PDF. One simple workspace.</p>
          <p>Built with Next.js and FastAPI.</p>
        </div>
      </footer>
    </>
  )
}
