# API

Base path: `/api/v1`. Interactive docs at `/docs` in development (switched off
in production).

## Envelope

Every response uses one of two shapes.

```jsonc
// success
{ "success": true, "data": { } }

// failure
{ "success": false, "error": { "code": "INVALID_FILE", "message": "The uploaded file is not a valid PDF." } }
```

`code` is for the frontend to branch on; `message` is already safe to show a
user. Internal detail — stack traces, database errors, file paths — never
appears in either.

### Error codes

| Code                       | Status | Meaning                                  |
| -------------------------- | ------ | ---------------------------------------- |
| `VALIDATION_ERROR`         | 422    | Request body failed validation           |
| `UNAUTHENTICATED`          | 401    | Missing, expired or invalid token        |
| `INVALID_CREDENTIALS`      | 401    | Wrong email or password                  |
| `FORBIDDEN`                | 403    | Not yours                                |
| `NOT_FOUND`                | 404    | No such record                           |
| `EMAIL_ALREADY_REGISTERED` | 409    | Address already has an account           |
| `RATE_LIMITED`             | 429    | Too many attempts                        |
| `INTERNAL_ERROR`           | 500    | Something broke; details are in the logs |

Every response carries an `X-Request-ID` header, which also appears in the
server logs — quote it when reporting a problem.

## Authentication

Send the token as a bearer header:

```
Authorization: Bearer <access_token>
```

Tokens are signed with HS256 and expire after `ACCESS_TOKEN_EXPIRE_MINUTES`
(60 by default). `expires_in` is returned in seconds so the client can warn or
refresh before a session dies.

### `POST /auth/register`

Create an account and sign in. Rate limited to 5 requests a minute.

```jsonc
// request
{
  "email": "ada@example.com",
  "password": "a-good-long-password",   // 8-128 characters
  "first_name": "Ada",
  "last_name": "Lovelace"
}

// 201
{
  "success": true,
  "data": {
    "access_token": "eyJ...",
    "token_type": "bearer",
    "expires_in": 3600,
    "user": {
      "id": "0f5c...",
      "email": "ada@example.com",
      "first_name": "Ada",
      "last_name": "Lovelace",
      "created_at": "2026-08-11T14:22:31Z"
    }
  }
}
```

Emails are lower-cased and trimmed, so `Ada@Example.com ` and
`ada@example.com` are one account. A duplicate returns 409
`EMAIL_ALREADY_REGISTERED`.

There is no upper-case/digit/symbol rule. Length is what matters, and fussy
composition rules mostly produce `Password1!`.

### `POST /auth/login`

Rate limited to 10 requests a minute.

```jsonc
// request
{ "email": "ada@example.com", "password": "a-good-long-password" }
```

Returns the same payload as register, with status 200.

A wrong password and an unknown address return **byte-for-byte the same
response**, and both take about the same time — otherwise the endpoint becomes
a way to discover which addresses have accounts.

### `GET /auth/me`

Requires a token. Returns the signed-in user.

```jsonc
{ "success": true, "data": { "id": "0f5c...", "email": "ada@example.com", "first_name": "Ada", "last_name": "Lovelace", "created_at": "..." } }
```

### `POST /auth/logout`

Requires a token. Returns `{ "message": "Signed out." }`.

Tokens are stateless and short-lived, so there is nothing to delete
server-side — the client discards the token. The endpoint exists so the
frontend has one call to make, and so revocation can be added here later
without changing the client.

## Health

### `GET /health`

Liveness. Touches nothing external, so it never flaps.

```jsonc
{ "success": true, "data": { "status": "ok", "version": "0.1.0", "environment": "development", "ai_enabled": false } }
```

`ai_enabled` lets the frontend hide AI features rather than letting a user
click something that cannot work.

### `GET /health/ready`

Readiness. Runs `SELECT 1`; returns 503 with `"database": "unavailable"` when
the database cannot be reached.

## Coming in later scopes

`/documents`, `/pdf/*`, `/ai/*` and `/history` — see [ROADMAP.md](ROADMAP.md).
