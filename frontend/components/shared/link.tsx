import NextLink from 'next/link'
import type { ComponentProps } from 'react'

/**
 * `next/link` with prefetching off.
 *
 * Next 16 prefetches route *segments*, sending each request with a
 * `next-router-segment-prefetch: /_tree` header. Deployed as a Vercel service
 * nothing serves those — the build emits no segment routes and the request
 * resolves to `/404`. Every link in the viewport fires one, so a page with a
 * dozen links makes a dozen requests that all fail.
 *
 * Turning prefetching off costs nothing, which is the whole reason this is
 * acceptable: not one of those prefetches succeeds today, so there is no
 * warmed cache to lose. It only stops asking.
 *
 * There is no configuration switch for this. `experimental.partialPrefetching`
 * is the nearest thing and it requires `cacheComponents`, which is a far larger
 * change than the problem warrants.
 *
 * It lives in one file so that when the platform serves segment requests
 * properly, this becomes a one-line revert rather than a hunt through twenty
 * call sites.
 */
export default function Link(props: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={false} {...props} />
}
