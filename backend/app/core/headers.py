"""Security response headers.

Every header here narrows what a browser will do with our responses. They cost
nothing to send and each one closes a category of attack that no amount of
careful application code can close on its own.

This is an API, not a site: it returns JSON and file downloads, never HTML that
a browser renders as a page. That makes the policy unusually strict — a
document served from here should be able to do *nothing at all*. The frontend
is a separate origin with its own headers, set by Next.
"""

from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, Response

from app.core.config import Settings

# One year, the minimum the browser preload lists accept. HSTS tells a browser
# never to speak to this host over plain HTTP again, so it is only sent in
# production: setting it in development would poison localhost in the
# developer's browser for a year, and there is no way to take it back.
HSTS_MAX_AGE = 31_536_000

# A content-security policy for an origin that serves no HTML. `default-src
# 'none'` denies everything, and nothing is added back. If a response somehow
# does render — an error page, a stray upload served inline — it can load no
# scripts, no styles, no images, and can talk to nobody.
#
# `frame-ancestors 'none'` is the modern X-Frame-Options and stops the API
# being framed at all; `form-action 'none'` stops a form inside such a
# response posting anywhere.
CONTENT_SECURITY_POLICY = (
    "default-src 'none'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'"
)

STATIC_HEADERS = {
    "Content-Security-Policy": CONTENT_SECURITY_POLICY,
    # Never guess a response's type from its bytes. Without this a browser can
    # decide an uploaded file "looks like" HTML and run it as a page.
    "X-Content-Type-Options": "nosniff",
    # Belt and braces with frame-ancestors above, for browsers that honour only
    # the older header.
    "X-Frame-Options": "DENY",
    # Send the origin to other sites, the full path only to ourselves. A
    # document id in a URL is not a secret, but it is nobody else's business.
    "Referrer-Policy": "strict-origin-when-cross-origin",
    # This API has no use for any of them, so no response from it may ask.
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
    # Keep this origin out of any cross-origin page's browsing-context group,
    # which is what makes Spectre-style cross-origin reads hard.
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-site",
}


def register_security_headers(app: FastAPI, settings: Settings) -> None:
    """Attach the headers to every response, including error responses.

    Middleware rather than a dependency, so it covers responses the routes
    never see: a 404 for an unknown path, a 429 from the rate limiter, a 500
    from the catch-all handler. Those are exactly the responses an attacker is
    most likely to be looking at.
    """

    @app.middleware("http")
    async def add_security_headers(
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        response = await call_next(request)

        for header, value in STATIC_HEADERS.items():
            response.headers[header] = value

        if settings.is_production:
            response.headers["Strict-Transport-Security"] = (
                f"max-age={HSTS_MAX_AGE}; includeSubDomains"
            )

        return response
