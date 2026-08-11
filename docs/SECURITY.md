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

## Where the token is stored, and why that is not ideal

The token is kept in `localStorage` and sent as an `Authorization: Bearer`
header. The API is on a different origin, which rules out the simplest cookie
setup.

**The trade-off:** a script running on the page could read `localStorage` —
exactly as it could read a non-httpOnly cookie. The stronger option is an
**httpOnly cookie**, which JavaScript cannot read at all, set by a small Next.js
route handler that proxies the login call. That is planned for scope 11 rather
than now, because it changes how every request is authenticated and is better
done once, after the request patterns settle.

What limits the damage in the meantime: React escapes rendered content by
default, there is no `dangerouslySetInnerHTML` anywhere in the codebase, and
tokens expire in an hour.

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
that is not a PDF, JPEG or PNG is refused — a `.exe` renamed to `invoice.pdf`
gets nowhere. Passing that check only proves the header is right, so PDFs are
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

Filenames inside a ZIP descend from the user's own filename, so they are
cleaned exactly as a `Content-Disposition` header is: an upload called
`../../etc/passwd.pdf` becomes `passwd-1-3.pdf`, never a path.

Because jobs run inside the request, a slow one occupies a worker for its
duration. That is acceptable at this size and is the reason processing has its
own, tighter rate limit.

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

Tracked for scope 11 (hardening):

- Move the token to an httpOnly cookie
- Security headers (CSP, HSTS) — `X-Content-Type-Options` is already set on
  downloads
- Dependency audit in CI
- Account lockout after repeated failures, beyond rate limiting
- A storage quota per account; nothing currently caps total usage
- Antivirus scanning of uploads, if it can be done within the free-first
  constraint
