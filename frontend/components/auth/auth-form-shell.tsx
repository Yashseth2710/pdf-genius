import Link from '@/components/shared/link'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface AuthFormShellProps {
  title: string
  description: string
  footerPrompt: string
  footerLinkLabel: string
  footerHref: string
  children: React.ReactNode
}

/** The card both auth pages sit in, so they cannot drift apart. */
export function AuthFormShell({
  title,
  description,
  footerPrompt,
  footerLinkLabel,
  footerHref,
  children,
}: AuthFormShellProps) {
  return (
    // No shadow under the ring. A hairline edge and a soft drop shadow doing
    // the same job at once is a generated-UI signature; the card is on a plain
    // page and the ring is enough to seat it.
    <Card className="w-full max-w-md [--card-spacing:--spacing(6)]">
      <CardHeader className="space-y-1.5">
        <CardTitle className="font-heading text-2xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {children}
        <p className="text-muted-foreground text-center text-sm">
          {footerPrompt}{' '}
          <Link
            href={footerHref}
            className="text-foreground rounded-sm font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {footerLinkLabel}
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
