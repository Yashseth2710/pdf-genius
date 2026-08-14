# Security

What is protected, how, and — where a decision was a trade-off — what the
trade-off was.

## Passwords

Hashed with **Argon2id** using the `argon2-cffi` defaults, which follow current
OWASP guidance. Plaintext passwords are never stored, logged, or returned by any
endpoint.

The cost parameters live inside each hash, so they can be raised later without
invalidating existing accounts: on a successful sign-in the stored hash is
checked with `check_needs_rehash` and quietly upgraded.

Minimum length is 8 characters, maximum 128. There is no upper-case/digit/symbol
requirement — length beats composition, and fussy rules mostly produce
`Password1!`. The maximum exists so an enormous password cannot be used to make
the server do expensive hashing work.

## Sign-in does not reveal who has an account

A wrong password and an unknown email address return the **same status, the same
body, and take about the same time**. When no user matches, the service still
verifies the supplied password against a dummy hash, because skipping that work
would make "no such account" measurably faster than "wrong password" — turning
login into a way to test which addresses are registered.

Registration is the deliberate exception: it has to say when an address is
already taken, or the person cannot act on it. Rate limiting is what stops that
being used to enumerate addresses in bulk.

## Tokens

Signed JWTs, HS256, expiring after `ACCESS_TOKEN_EXPIRE_MINUTES` (60 by
default). Each carries a unique `jti`, so individual tokens can be revoked later
without changing how they are issued.

Decoding is deliberately strict:

- **The algorithm is pinned.** Without this, a token can name its own algorithm
  and talk the server into verifying it differently than it was signed —
  including `alg=none`, which asks for no verification at all.
- `exp` and `sub` are required.
- A token of the wrong `type` is refused, so a future refresh token can never be
  used as an access token.
- Every failure — expired, tampered, forged, malformed — returns the **same
  message**, so nobody learns why theirs was rejected.
- A token whose user has since been deleted is treated as invalid, not as a 404.

## Where the token is stored, and why it is staying there

The token is kept in `localStorage` and sent as an `Authorization: Bearer`
header. The API is on a different origin, which rules out the simplest cookie
setup.

**The trade-off:** a script running on the page could read `localStorage` —
exactly as it could read a non-httpOnly cookie. The stronger option is an
**httpOnly cookie**, which JavaScript cannot read at all.

Scope 11 was where that move was going to happen. **It was examined and
rejected**, for reasons that only became clear once the deployment target was
settled:

- A cross-site cookie needs `SameSite=None; Secure`. Safari's tracking
  prevention and Chrome's third-party cookie work both restrict exactly that
  pattern, so the cookie would be unreliable in the browsers people use.
- The way round it is to proxy every API call through Next route handlers, so
  the cookie is same-origin. But the frontend deploys to Vercel, whose
  serverless functions cap a request body at a few megabytes, and uploads are
  capped at 25MB. Uploads could not go through the proxy.
- Which means uploads would still need the token in JavaScript — and a token
  JavaScript can read is a token `localStorage` might as well hold. The
  migration would cost every request path and buy nothing.

So the honest position is: this is a real weakness, it is understood, and the
available fix is worse than the problem at this size. What limits the damage:
React escapes rendered content by default, there is no
`dangerouslySetInnerHTML` anywhere in the codebase, the API sends
`default-src 'none'`, and tokens expire in an hour.

Revisit if the backend ever moves behind the same origin as the frontend, which
removes the whole difficulty.

## Authorisation

Every protected endpoint resolves the user from the token itself — never from a
request body or query parameter.

Records are fetched with `BaseRepository.get_for_user`, which returns `None` for
another user's record rather than the row or a 403. A user therefore cannot
confirm that an id exists at all. This is tested against a real database.

Route protection in the frontend is a **convenience, not a control**: it avoids
showing a shell that cannot load. The API is the actual gate, and it re-checks
every request. Next's own documentation describes proxy-level checks as
optimistic only, which is why none of the security depends on them.

## Uploaded files

Uploaded files are untrusted input, and are treated as such.

**What a file is gets decided by reading it.** The filename and the browser's
`Content-Type` header are both supplied by whoever is uploading, so neither is
consulted. The leading bytes are matched against known signatures, and anything
outside `ALLOWED_UPLOAD_TYPES` — a PDF, or a JPEG, PNG, GIF, BMP, TIFF, WEBP or
HEIC image — is refused, so a `.exe` renamed to `invoice.pdf` gets nowhere.
Signatures are matched at their real offset rather than at byte zero, because
WEBP announces itself eight bytes into a RIFF container and HEIC four bytes into
an `ftyp` box. Passing that check only proves the header is right, so PDFs are
then opened with PyMuPDF: a truncated or corrupt file is rejected and deleted
rather than left on disk pretending to be a document.

**Filenames never become paths.** Storage keys are generated
(`documents/<user id>/<uuid>.pdf`), because the moment an attacker-controlled
string becomes a path it can contain `..`. Three layers back that up: keys are
validated against a strict pattern, the resolved path is checked to be inside
the storage root (a well-formed key can still point elsewhere through a
symlink), and the API never accepts a key from a client at all — downloads take
a document id.

The original filename is kept for display and cleaned before it goes into a
`Content-Disposition` header, so `../../etc/passwd.pdf` is offered as
`passwd.pdf`.

**Size is capped while writing, not after.** Uploads stream to disk in 64KB
chunks and abort the moment they pass the limit, so a 25MB cap does not mean
25MB of memory per upload, and a dishonest `Content-Length` buys nothing.
Partial files are removed on every failure path.

`storage_path` is absent from every API response: where a file physically lives
is internal.

## Processing

The PDF tools take **document ids, never files or paths**. Each id is resolved
with the same ownership check as everything else, so listing someone else's
document alongside your own in a merge returns 404 rather than reaching it.
Output is written under a generated `outputs/<user id>/<uuid>` key.

PyMuPDF works in memory, which is the real constraint on a free host: a merge
of twenty 25MB files would be 500MB. Three limits stand in the way, all
settings rather than constants — `MAX_MERGE_FILES` (20), `MAX_MERGE_TOTAL_MB`
(100) and `MAX_SPLIT_OUTPUTS` (100). Beyond them the request is refused with an
explanation instead of the process being killed.

Filenames inside an archive descend from the user's own filename, so they are
cleaned exactly as a `Content-Disposition` header is: an upload called
`../../etc/passwd.pdf` becomes `passwd-1-3.pdf`, never a path. Repeated names
get a numbered suffix, because a zip with duplicate entries silently loses
files in some extractors.

`POST /documents/archive` resolves every id with the usual ownership check
before reading anything, so it cannot be used to pull a file belonging to
someone else into a bundle, and it is capped at 200 documents because the whole
archive is built in memory.

Because jobs run inside the request, a slow one occupies a worker for its
duration. That is acceptable at this size and is the reason processing has its
own, tighter rate limit.

**The organiser rebuilds rather than edits.** A page plan produces a new
document; the original is never rewritten, so a mistake costs a click rather
than a file. Plans are checked against the real page count of the opened
document — not the `page_count` column, which is a hint recorded at upload
time — before any job starts, and `MAX_ORGANISE_PAGES` (500) caps the result,
since a plan may repeat a page and so could ask for a document far larger than
the one it came from.

**Previews render in the browser, not on the server.** PDF.js draws pages from
bytes already downloaded through the authenticated endpoint, so viewing a
document costs the server nothing beyond the download it would have served
anyway, and no page images are generated or stored anywhere.

Preview buttons appear beside every document in every tool, but each one
fetches only when it is pressed. Loading eagerly would mean a picker showing
twenty PDFs quietly downloading all twenty — the user's bandwidth and the
server's, spent on files nobody asked to see.

## Rate limiting

In-memory counters (slowapi): 5/minute on registration, 10/minute on sign-in,
30/minute on upload, 20/minute on processing — processing is CPU work rather
than a database read. These are settings (`RATE_LIMIT_*`), not hard-coded
values — an automated test run legitimately registers many accounts from one
address, and so does an office behind a single NAT address.

No Redis. A single backend process needs no shared store, and adding one purely
to count requests would break the free-first constraint. **If the backend is
ever scaled to several processes the limits become per-process**, and this needs
revisiting.

## Account lockout

Rate limiting counts attempts per address. Lockout counts them per **account**,
which is a different attack: a password-spraying run spread across many
addresses stays under every per-IP limit while hammering one inbox, and per-IP
counting cannot see it because no single address is doing much.

Five consecutive failures within fifteen minutes buys a fifteen-minute wait
(`LOGIN_MAX_FAILURES`, `LOGIN_LOCKOUT_MINUTES`). Deliberately temporary: a
permanent lock is itself a way to lock a real user out of their own account by
guessing wrong on purpose, which trades a hard attack for an easy one. Serving
the wait resets the count, so the next mistake does not re-arm it immediately.

Two details that matter more than the numbers:

- **Failures are counted for any address, whether or not it has an account.**
  If lockout applied only to real accounts, an address that never locks would
  be an address with no account — which is exactly what the shared "Incorrect
  email or password" message exists to keep secret.
- **Addresses are stored as a SHA-256 hash, never in plain text.** This map
  would otherwise become a list of the addresses people have tried to sign in
  to, sitting in memory and appearing in any process dump.

Same in-memory caveat as the rate limiter: across several processes an attacker
gets one allowance per process.

## Storage quota

500MB per account by default (`STORAGE_QUOTA_MB`), counting uploads and results
together. Nothing capped total usage before, so one account could fill the disk
25MB at a time — and on a free host that takes the service down for everyone.

Results count too. Without that the cap is trivial to walk past: split a 20MB
PDF into a hundred pages and the account is holding twice what it uploaded.

On upload the remaining room becomes a second ceiling on the write, so a file
that would overrun the quota aborts mid-stream exactly as an oversized one
does — rather than being written to disk in full only to be deleted. Which
limit was hit is decided by which was lower, because telling somebody with 3MB
of room that their file is "larger than 25MB" sends them after the wrong
problem.

## Response headers

Every response carries them, including the ones no route produced — a 404 for
an unknown path, a 429 from the rate limiter, a 500 from the catch-all handler.
Those are the responses somebody probing the API is most likely to be reading.

This origin serves JSON and file downloads, never HTML a browser renders as a
page, so the policy is unusually strict: `default-src 'none'` with nothing added
back, plus `frame-ancestors`, `form-action` and `base-uri` all set to `'none'`.
If a response somehow does render, it can load nothing and talk to nobody.

Alongside it: `X-Content-Type-Options: nosniff` so an uploaded file is never
re-interpreted as HTML, `X-Frame-Options: DENY` for browsers that honour only
the older header, `Referrer-Policy: strict-origin-when-cross-origin`, a
`Permissions-Policy` denying camera, microphone and geolocation, and
`Cross-Origin-Opener-Policy` / `Cross-Origin-Resource-Policy`.

**HSTS is production-only.** Sending it in development would pin `localhost` to
HTTPS for a year in the developer's own browser, with no way to take it back.

## Dependency audit

A CI job fails the build on a known vulnerability: `pip-audit` against
`requirements.lock.txt` — the lock file, because that is what actually gets
installed — and `npm audit --omit=dev --audit-level=high`.

Production dependencies only on the npm side. A vulnerability in a build tool
or a test runner never reaches a user, and failing the build on one trains
people to ignore the job, which is the single outcome that would make it
useless.

## Errors and logs

Failures return `{"success": false, "error": {"code", "message"}}` with a
message written for a person. The catch-all handler logs the real exception and
returns a generic message, so stack traces, database errors, connection strings
and file paths never reach a client.

Logs record request id, method, path, status and duration — never bodies,
passwords, tokens or document contents.

## Secrets

Real values live in `.env` files, which are git-ignored; `.env.example` holds
placeholders only. `alembic.ini` deliberately contains no connection string.
Nothing prefixed `NEXT_PUBLIC_` may ever hold a secret — it is shipped to the
browser.

## CORS

An explicit origin list from `CORS_ORIGINS`, never `*`, because requests carry
credentials.

## Still to do

**Antivirus scanning of uploads.** Not done, and not planned at this size. The
realistic option is ClamAV, which wants a resident daemon and roughly a
gigabyte of memory for its signature database — more than the whole free tier
this project is built to run on. What stands in its place: uploads are
identified by their bytes rather than their name, PDFs must open in PyMuPDF
before they are recorded, files are never executed, and they are served back
with `nosniff` and a cleaned filename. That does not detect a malicious PDF
aimed at someone else's reader, and it is worth being plain about that rather
than implying otherwise.

**Per-process counters.** Both the rate limits and the lockout are in memory. A
multi-process deployment gives an attacker one allowance per process. Fixing it
properly means a shared store; see the notes above.

Settled during scope 11, so no longer open: the httpOnly cookie move (examined
and rejected, with reasons, above), security headers, the dependency audit,
account lockout, and the storage quota.
