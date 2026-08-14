import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'

/**
 * Mints the short-lived token that lets a browser write one file to Blob.
 *
 * This route exists only because the browser cannot be given the read/write
 * token itself — that would let anyone with the page write anything to the
 * store. The token this returns is scoped to a single pathname and expires.
 *
 * It lives in the Next.js app rather than the API because Vercel only issues
 * these tokens to a project the Blob store is linked to, and because the store
 * credential should stay on the server that already holds it.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1'

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // The browser sends its access token as the client payload. This route
        // does not decide who anyone is — it asks the API, which is the only
        // thing holding the signing key.
        const response = await fetch(`${API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${clientPayload ?? ''}` },
        })
        if (!response.ok) {
          throw new Error('Not signed in.')
        }

        const { data } = (await response.json()) as { data: { id: string } }

        // The API issued this pathname and it starts with the owner's id.
        // Checking it here stops a signed-in user minting a token for a
        // pathname belonging to somebody else.
        if (!pathname.startsWith(`documents/${data.id}/`)) {
          throw new Error('That upload location is not yours.')
        }

        return {
          // Deliberately not restricted by content type: the browser's claim
          // about a file's type is not evidence, and the API reads the real
          // bytes before it records anything.
          allowedContentTypes: undefined,
          // Keeps the pathname exactly as issued, so the key the API reserved
          // is the key the object ends up at.
          addRandomSuffix: false,
        }
      },
      // Nothing to do: the browser tells the API itself once the upload
      // finishes, which also works in local development where Vercel cannot
      // call back into a machine it has no address for.
      onUploadCompleted: async () => {},
    })

    return Response.json(result)
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Upload could not be authorised.' },
      { status: 400 },
    )
  }
}
