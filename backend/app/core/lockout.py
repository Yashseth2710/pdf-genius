"""Temporary lockout after repeated failed sign-ins.

Rate limiting already caps sign-in attempts per IP address. This caps them per
*account*, which is a different attack: a password-spraying run spread across
many addresses stays under every per-IP limit while hammering one inbox, and
per-IP counting cannot see it because no single address is doing much.

In-memory and per-process, for the same reason the rate limiter is (see
``rate_limit``): a single backend process needs no shared store, and adding
Redis to hold a handful of counters would break the free-first constraint. If
the backend is ever scaled to several processes, an attacker gets one allowance
per process, and this needs revisiting alongside the rate limiter.

**Failures are keyed by a hash of the email, never the address itself.** This
dictionary would otherwise become a list of the addresses people have tried to
sign in to, sitting in memory and appearing in any process dump.
"""

import hashlib
import time
from collections.abc import Callable
from dataclasses import dataclass
from threading import Lock


@dataclass
class _Attempts:
    # When the run of failures started, so a slow trickle over hours does not
    # accumulate into a lockout.
    first_failure: float
    count: int = 0
    #  When the current lock expires. Zero means not locked.
    locked_until: float = 0.0


class LoginLockout:
    """Counts consecutive failures per account and refuses for a while.

    Deliberately forgiving by default: five failures buys a fifteen-minute
    wait, not a permanent lock. A permanent one turns into a way to lock a
    real user out of their own account by guessing wrong on purpose, which
    trades a hard attack for an easy one.
    """

    def __init__(
        self,
        max_failures: int,
        lock_minutes: int,
        window_minutes: int = 15,
        # Injected so the tests can drive it. They otherwise have to sleep, and
        # `time.monotonic` on Windows advances in ~15ms steps, so a test that
        # sleeps for one millisecond and expects the clock to have moved passes
        # on Linux and fails here.
        now: Callable[[], float] = time.monotonic,
    ) -> None:
        self.max_failures = max_failures
        self.lock_seconds = lock_minutes * 60
        self.window_seconds = window_minutes * 60
        self._now = now
        self._attempts: dict[str, _Attempts] = {}
        # The counters are read and written from request threads, and a
        # read-modify-write across two of them could lose a failure.
        self._guard = Lock()

    @staticmethod
    def _key(email: str) -> str:
        return hashlib.sha256(email.strip().lower().encode()).hexdigest()

    def seconds_remaining(self, email: str) -> int:
        """How long this account must wait, or 0 if it may try now."""
        with self._guard:
            record = self._attempts.get(self._key(email))
            if record is None:
                return 0
            remaining = record.locked_until - self._now()
            return int(remaining) + 1 if remaining > 0 else 0

    def record_failure(self, email: str) -> None:
        key = self._key(email)
        now = self._now()

        with self._guard:
            # Done here because this is the only path that adds entries, and
            # inside the lock we already hold: ``Lock`` is not reentrant, so a
            # public purge called from here would deadlock.
            self._purge(now)

            record = self._attempts.get(key)
            # A fresh run of failures, either because there were none before or
            # because the last one was long enough ago not to count.
            if record is None or now - record.first_failure > self.window_seconds:
                record = _Attempts(first_failure=now)
                self._attempts[key] = record

            record.count += 1
            if record.count >= self.max_failures:
                record.locked_until = now + self.lock_seconds
                # Reset the count, so serving the wait starts the next run from
                # scratch rather than locking again on the very next mistake.
                record.count = 0
                record.first_failure = now

    def record_success(self, email: str) -> None:
        """Signing in clears the slate."""
        with self._guard:
            self._attempts.pop(self._key(email), None)

    def clear(self) -> None:
        """For tests, and for a process that wants to start clean."""
        with self._guard:
            self._attempts.clear()

    def _purge(self, now: float) -> None:
        """Drop records that can no longer affect anyone. Caller holds the lock.

        Without this the dictionary only grows: every address ever mistyped
        stays in memory for the life of the process.
        """
        self._attempts = {
            key: record
            for key, record in self._attempts.items()
            if record.locked_until > now or now - record.first_failure <= self.window_seconds
        }
