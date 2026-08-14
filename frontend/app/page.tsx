import Link from 'next/link'

import { SiteHeader } from '@/components/shared/site-header'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * What the app does today, said plainly.
 *
 * Set as an index rather than a grid of cards: a name in one column and a
 * sentence in the other, ruled off from each other. It is the contents page of
 * a printed manual, which suits a product about documents, and it avoids the
 * icon-tile-above-a-heading card that every generated landing page reaches for.
 */
const tools = [
  {
    name: 'Merge',
    description: 'Join several PDFs into one file, in the order you put them in.',
  },
  {
    name: 'Split',
    description: 'Pull out a range of pages, a handful you pick, or every page separately.',
  },
  {
    name: 'Organise',
    description: 'See every page at once, then reorder, turn or drop the ones you want.',
  },
  {
    name: 'Compress',
    description: 'Make a file small enough to send, and see exactly how much came off.',
  },
  {
    name: 'Images to PDF',
    description: 'Turn photos or scans into one PDF, a page each. Eight image formats.',
  },
]

export default function HomePage() {
  return (
    <>
      <SiteHeader />

      <main id="main-content">
        {/* Ranged left, at reading width. A centred headline over a centred
            paragraph over two centred buttons is the shape every generated
            landing page arrives in, and it reads worse besides: the eye has to
            find the start of each line again. */}
        <section className="mx-auto max-w-5xl px-6 pt-16 pb-20 sm:px-8 sm:pt-24">
          <div className="max-w-2xl">
            <h1 className="text-3xl sm:text-5xl">
              Merge, split and shrink PDFs without hunting for a website.
            </h1>

            <p className="text-muted-foreground mt-6 max-w-xl text-lg">
              Upload a document once, then point any of the tools at it. Free to use, no adverts,
              and nothing you upload is readable by anyone but you.
            </p>

            {/* `items-start`, so both buttons hug their labels at every width.
                Stretched full-width on a phone, the ghost one loses its edges
                and reads as a line of centred text floating under the filled
                one, which also fights a page that is otherwise ranged left. */}
            <div className="mt-10 flex flex-col items-start gap-3 sm:flex-row">
              {/* Real links wearing the button styles. Rendering a Button
                  "as" a link makes Base UI announce it as role="button",
                  which is wrong for something that navigates. */}
              <Link
                href="/register"
                className={cn(buttonVariants({ size: 'lg' }), 'h-11 px-5 text-base')}
              >
                Create an account
              </Link>
              <Link
                href="#tools"
                className={cn(
                  buttonVariants({ size: 'lg', variant: 'ghost' }),
                  'h-11 px-5 text-base',
                )}
              >
                See the tools
              </Link>
            </div>
          </div>
        </section>

        <section id="tools" className="border-t">
          <div className="mx-auto max-w-5xl scroll-mt-16 px-6 py-20 sm:px-8">
            <h2 className="text-2xl">The tools</h2>

            <dl className="mt-10">
              {tools.map((tool) => (
                <div
                  key={tool.name}
                  className="grid gap-1 border-t py-5 first:border-t-0 first:pt-0 sm:grid-cols-[12rem_1fr] sm:gap-8"
                >
                  <dt className="font-heading text-lg font-semibold">{tool.name}</dt>
                  <dd className="text-muted-foreground max-w-lg">{tool.description}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="border-t">
          <div className="mx-auto max-w-5xl px-6 py-20 sm:px-8">
            <div className="max-w-xl">
              <h2 className="text-2xl">Your documents stay yours</h2>
              <p className="text-muted-foreground mt-5">
                Files are private to your account and never publicly readable. The temporary copies
                a tool makes while it works are deleted the moment it finishes, and you can delete
                anything you have uploaded whenever you like.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="text-muted-foreground mx-auto flex max-w-5xl flex-col gap-2 px-6 py-10 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>PDF Genius</p>
          <p>Built with Next.js and FastAPI.</p>
        </div>
      </footer>
    </>
  )
}
