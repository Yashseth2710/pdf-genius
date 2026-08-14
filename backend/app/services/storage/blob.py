"""Vercel Blob storage.

The same contract as LocalStorage, over HTTP instead of a filesystem. It exists
because a serverless function has no disk worth the name: ``/tmp`` is wiped
between invocations, so a document uploaded by one request is simply not there
when the next one asks for it.

Keys are unchanged. ``documents/<user id>/<uuid>.pdf`` is a perfectly good
object pathname, so nothing above this layer learns that storage moved.

Talks to Blob's HTTP endpoints directly, because the JavaScript SDK is the only
client Vercel publishes and this is a Python service.

**Those endpoints are not documented for third-party use.** They are what the
official SDK itself calls, and `x-api-version` is pinned below so a change is
something we opt into rather than something that happens to us - but this is a
private interface and it can move. Reading is the exception and is safe: a
public blob is an ordinary HTTPS GET with no authentication and no API surface
at all, which is what `open`, `stream` and `exists` use.

If the write endpoints ever break, the supported fix is to mint a client token
in the Next.js app - where the official SDK runs - and let it do the writing.
"""

import io
import logging
from collections.abc import Iterator
from typing import BinaryIO

import httpx

from app.services.storage.base import Storage, StoredFile
from app.services.storage.keys import UnsafeStorageKeyError, validate_key
from app.services.storage.local import FileTooLargeInStorage

logger = logging.getLogger(__name__)

API = "https://blob.vercel-storage.com"
# The API is versioned by header rather than by URL, and omitting it gets you
# whatever Vercel considers current - which is a silent breaking change waiting
# to happen. Pinning it means an upgrade is something we choose.
API_VERSION = "7"


class BlobStorageError(RuntimeError):
    """The Blob API refused a request. Never carries the token."""


def _store_id(token: str) -> str:
    """The store this token belongs to, taken from the token itself.

    Tokens are shaped ``vercel_blob_rw_<store id>_<secret>``, and the public
    hostname is built from the store id. Deriving it here means deployment
    needs one environment variable rather than two that must agree.
    """
    parts = token.split("_")
    if len(parts) < 5 or not parts[3]:
        raise BlobStorageError("BLOB_READ_WRITE_TOKEN is not a Vercel Blob token.")
    return parts[3]


class VercelBlobStorage(Storage):
    def __init__(self, token: str, *, timeout: float = 30.0) -> None:
        if not token:
            raise BlobStorageError("BLOB_READ_WRITE_TOKEN is required for blob storage.")
        self._token = token
        self.base_url = f"https://{_store_id(token)}.public.blob.vercel-storage.com"
        # One client, reused. Each request otherwise pays a fresh TLS handshake,
        # and a cold function is already slow enough.
        self._client = httpx.Client(timeout=timeout)

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "authorization": f"Bearer {self._token}",
            "x-api-version": API_VERSION,
        }

    def url_for(self, key: str) -> str:
        """The public URL of a stored object.

        Public in the sense that it needs no signature, and unguessable in the
        sense that the last path segment is a random UUID. Downloads redirect
        here because a Vercel function may not return a body above 4.5MB, so
        proxying the bytes would cap every download well below the 25MB a user
        is allowed to upload. See DEPLOYMENT.md - this is a real trade against
        the authorised streaming the local provider does.
        """
        return f"{self.base_url}/{validate_key(key)}"

    def save(self, data: BinaryIO, *, key: str, max_bytes: int) -> StoredFile:
        """Upload a stream, refusing anything past the limit before it is sent.

        The limit is enforced while reading rather than after: the point is to
        never hold more than the cap in memory, and a lying Content-Length
        should not be able to change that.
        """
        validate_key(key)

        buffer = bytearray()
        while chunk := data.read(64 * 1024):
            buffer.extend(chunk)
            if len(buffer) > max_bytes:
                raise FileTooLargeInStorage

        response = self._client.put(
            f"{API}/{key}",
            headers={
                **self._headers,
                # Without this Vercel appends a random suffix to the pathname,
                # and the key we stored in the database would no longer be the
                # key the object has.
                "x-add-random-suffix": "0",
                "x-content-type": "application/octet-stream",
            },
            content=bytes(buffer),
        )
        if response.status_code >= 400:
            raise BlobStorageError(f"Upload failed with {response.status_code}.")

        return StoredFile(key=key, size=len(buffer))

    def open(self, key: str) -> BinaryIO:
        response = self._client.get(self.url_for(key))
        if response.status_code >= 400:
            raise BlobStorageError(f"Could not read {key!r}: {response.status_code}.")
        return io.BytesIO(response.content)

    def stream(self, key: str, chunk_size: int = 64 * 1024) -> Iterator[bytes]:
        with self._client.stream("GET", self.url_for(key)) as response:
            if response.status_code >= 400:
                raise BlobStorageError(f"Could not read {key!r}: {response.status_code}.")
            yield from response.iter_bytes(chunk_size)

    def delete(self, key: str) -> None:
        """Remove an object. A missing one is not an error, as with the disk."""
        try:
            url = self.url_for(key)
        except UnsafeStorageKeyError:
            logger.warning("Refused to delete an unsafe storage key")
            return

        response = self._client.post(f"{API}/delete", headers=self._headers, json={"urls": [url]})
        if response.status_code >= 400:
            raise BlobStorageError(f"Delete failed with {response.status_code}.")

    def exists(self, key: str) -> bool:
        try:
            url = self.url_for(key)
        except UnsafeStorageKeyError:
            return False
        return self._client.head(url).status_code < 400

    def delete_prefix(self, prefix: str) -> None:
        """Remove everything under a prefix, used when an account is deleted.

        Listed and deleted in pages rather than in one call, because an account
        that hit its 500MB quota with small files has more objects than the API
        will return - and a partial delete that reports success would leave a
        deleted user's documents in the store.
        """
        cursor: str | None = None
        while True:
            params = {"prefix": prefix, "limit": "1000"}
            if cursor:
                params["cursor"] = cursor

            listing = self._client.get(API, headers=self._headers, params=params)
            if listing.status_code >= 400:
                raise BlobStorageError(f"List failed with {listing.status_code}.")

            body = listing.json()
            urls = [blob["url"] for blob in body.get("blobs", [])]
            if urls:
                self._client.post(f"{API}/delete", headers=self._headers, json={"urls": urls})

            if not body.get("hasMore"):
                return
            cursor = body.get("cursor")
