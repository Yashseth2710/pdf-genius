"""Per-account lockout after repeated failed sign-ins."""

import pytest

from app.core.lockout import LoginLockout


class Clock:
    """A clock the test moves by hand.

    Sleeping for real would make these tests slow and, on Windows, wrong:
    ``time.monotonic`` there advances in steps of about 15ms, so a one
    millisecond sleep can leave it reading exactly the same value.
    """

    def __init__(self) -> None:
        self.seconds = 1000.0

    def __call__(self) -> float:
        return self.seconds

    def advance(self, seconds: float) -> None:
        self.seconds += seconds


@pytest.fixture
def lockout() -> LoginLockout:
    return LoginLockout(max_failures=3, lock_minutes=15)


def test_an_account_is_open_until_it_is_not(lockout: LoginLockout) -> None:
    assert lockout.seconds_remaining("ada@example.com") == 0

    lockout.record_failure("ada@example.com")
    lockout.record_failure("ada@example.com")

    assert lockout.seconds_remaining("ada@example.com") == 0


def test_the_limit_locks_the_account(lockout: LoginLockout) -> None:
    for _ in range(3):
        lockout.record_failure("ada@example.com")

    remaining = lockout.seconds_remaining("ada@example.com")
    assert 14 * 60 < remaining <= 15 * 60 + 1


def test_one_account_locking_does_not_lock_another(lockout: LoginLockout) -> None:
    for _ in range(3):
        lockout.record_failure("ada@example.com")

    assert lockout.seconds_remaining("ada@example.com") > 0
    assert lockout.seconds_remaining("grace@example.com") == 0


def test_signing_in_clears_the_record(lockout: LoginLockout) -> None:
    lockout.record_failure("ada@example.com")
    lockout.record_failure("ada@example.com")
    lockout.record_success("ada@example.com")

    # The two earlier failures are forgotten, so this one starts a fresh run
    # rather than being the third strike.
    lockout.record_failure("ada@example.com")

    assert lockout.seconds_remaining("ada@example.com") == 0


def test_the_address_is_not_kept_in_memory(lockout: LoginLockout) -> None:
    """This map would otherwise be a list of addresses people tried to sign in
    to, sitting in memory and turning up in any process dump."""
    lockout.record_failure("ada@example.com")

    stored = repr(lockout.__dict__)
    assert "ada@example.com" not in stored
    assert "ada" not in stored


def test_the_address_is_matched_however_it_was_typed(lockout: LoginLockout) -> None:
    for address in ("ada@example.com", "ADA@example.com", "  Ada@Example.COM  "):
        lockout.record_failure(address)

    assert lockout.seconds_remaining("ada@example.com") > 0


def test_a_slow_trickle_of_failures_never_locks() -> None:
    """Two wrong guesses a fortnight apart are somebody's own memory, not an
    attack, so failures older than the window start a fresh run."""
    clock = Clock()
    lockout = LoginLockout(max_failures=3, lock_minutes=15, window_minutes=15, now=clock)

    for _ in range(6):
        lockout.record_failure("ada@example.com")
        clock.advance(16 * 60)

    assert lockout.seconds_remaining("ada@example.com") == 0


def test_the_lock_expires_on_its_own() -> None:
    clock = Clock()
    lockout = LoginLockout(max_failures=3, lock_minutes=15, now=clock)

    for _ in range(3):
        lockout.record_failure("ada@example.com")
    assert lockout.seconds_remaining("ada@example.com") > 0

    clock.advance(15 * 60 + 1)

    assert lockout.seconds_remaining("ada@example.com") == 0


def test_serving_the_wait_does_not_relock_on_the_next_mistake() -> None:
    """A lock that re-arms on the first mistake afterwards is a permanent lock
    with extra steps, and a permanent lock is a way to lock someone out of
    their own account on purpose."""
    clock = Clock()
    lockout = LoginLockout(max_failures=3, lock_minutes=15, now=clock)

    for _ in range(3):
        lockout.record_failure("ada@example.com")
    clock.advance(15 * 60 + 1)

    lockout.record_failure("ada@example.com")

    assert lockout.seconds_remaining("ada@example.com") == 0


def test_expired_records_do_not_accumulate() -> None:
    """Every address ever mistyped would otherwise stay for the process's life."""
    clock = Clock()
    lockout = LoginLockout(max_failures=99, lock_minutes=15, window_minutes=15, now=clock)

    for index in range(50):
        lockout.record_failure(f"person{index}@example.com")
        clock.advance(16 * 60)

    # Each failure purges what can no longer matter, so the map holds only the
    # runs still inside the window rather than all fifty.
    assert len(lockout._attempts) == 1
