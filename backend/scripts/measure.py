"""Measure what the PDF tools actually cost in memory and time.

The processing limits in settings were chosen by reasoning about them: PyMuPDF
works in memory, so a merge of twenty 25MB files "would be 500MB". This script
exists to check that reasoning against a running process, because the number
that matters is resident memory on a 512MB free host, and the difference
between an estimate and a measurement is whether the service stays up.

Run it directly:

    python scripts/measure.py

It writes nothing and touches no database. Every document is built in memory.
"""

from __future__ import annotations

import ctypes
import gc
import platform
import sys
import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pymupdf

from app.services.pdf import operations
from app.services.pdf.compress import CompressionLevel, compress

MB = 1024 * 1024


def resident_bytes() -> int:
    """The **high-water mark** of memory this process has held.

    Peak rather than current, and that distinction is the whole measurement.
    Reading current usage after an operation finishes reports almost nothing,
    because the result has already been freed by then — the first version of
    this script said a 941MB operation grew memory by 0.5MB. The peak only ever
    rises, so taking it before and after gives the true cost of what happened
    in between.

    Deliberately not ``tracemalloc``: PyMuPDF does its allocating in C, which
    Python's allocator never sees, so tracemalloc would report a few megabytes
    for work that actually costs hundreds. psutil would answer this in one line
    and is not installed - it is one dependency to add for one number, and both
    platforms expose it already.
    """
    if platform.system() == "Windows":

        class Counters(ctypes.Structure):
            _fields_ = [
                ("cb", ctypes.c_uint32),
                ("PageFaultCount", ctypes.c_uint32),
                ("PeakWorkingSetSize", ctypes.c_size_t),
                ("WorkingSetSize", ctypes.c_size_t),
                ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
                ("QuotaPagedPoolUsage", ctypes.c_size_t),
                ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
                ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                ("PagefileUsage", ctypes.c_size_t),
                ("PeakPagefileUsage", ctypes.c_size_t),
            ]

        kernel32 = ctypes.WinDLL("kernel32")  # type: ignore[attr-defined]
        # Windows 7 and later expose this from kernel32 as K32...; psapi.dll
        # still forwards it, but only the kernel32 name is reliable across the
        # Store and desktop runtimes.
        get_info = getattr(kernel32, "K32GetProcessMemoryInfo", None)
        if get_info is None:  # pragma: no cover - very old Windows
            get_info = ctypes.WinDLL("psapi").GetProcessMemoryInfo  # type: ignore[attr-defined]

        get_info.argtypes = [ctypes.c_void_p, ctypes.POINTER(Counters), ctypes.c_uint32]
        get_info.restype = ctypes.c_int

        counters = Counters()
        counters.cb = ctypes.sizeof(Counters)
        if not get_info(kernel32.GetCurrentProcess(), ctypes.byref(counters), counters.cb):
            raise OSError("GetProcessMemoryInfo failed")
        return int(counters.PeakWorkingSetSize)

    # Linux, which is what CI and any host runs. VmHWM is the peak; VmRSS is
    # the current value and would under-report for the reason above.
    for line in Path("/proc/self/status").read_text().splitlines():
        if line.startswith("VmHWM:"):
            return int(line.split()[1]) * 1024
    return 0


@dataclass
class Measurement:
    name: str
    seconds: float
    grew_by: int
    output_bytes: int

    def __str__(self) -> str:
        return (
            f"{self.name:<44} {self.seconds:>6.2f}s "
            f"{self.grew_by / MB:>8.1f}MB peak growth "
            f"{self.output_bytes / MB:>8.1f}MB out"
        )


@contextmanager
def measured(name: str) -> Iterator[list[int]]:
    """Time a block and record how far the memory high-water mark moved."""
    gc.collect()
    before = resident_bytes()
    started = time.perf_counter()
    sink: list[int] = []
    try:
        yield sink
    finally:
        seconds = time.perf_counter() - started
        peak = resident_bytes()
        gc.collect()
        RESULTS.append(
            Measurement(
                name=name,
                seconds=seconds,
                grew_by=max(0, peak - before),
                output_bytes=sink[0] if sink else 0,
            )
        )


RESULTS: list[Measurement] = []


def build_pdf(pages: int, *, image_side: int = 0) -> bytes:
    """A PDF of `pages` pages, optionally with a photo-sized image on each.

    Empty pages are almost free and would flatter every measurement. The image
    variant is what a scanned document actually looks like, and it is the case
    the limits exist for.
    """
    photo = _noise_jpeg(image_side) if image_side else None

    with pymupdf.open() as document:
        for _ in range(pages):
            page = document.new_page()
            if photo is not None:
                page.insert_image(page.rect, stream=photo)
        return bytes(document.tobytes(deflate=True))


def _noise_jpeg(side: int) -> bytes:
    """A JPEG of pure noise, which is the point.

    A first attempt drew coloured stripes, and deflate took a 20-page document
    down to a few kilobytes — so every measurement read 0.0MB and looked like
    good news. Noise does not compress, so the fixture is genuinely the size it
    claims and the numbers below mean something.
    """
    from io import BytesIO

    from PIL import Image

    noise = Image.merge(
        "RGB",
        [Image.effect_noise((side, side), 96).convert("L") for _ in range(3)],
    )
    buffer = BytesIO()
    noise.save(buffer, format="JPEG", quality=92)
    return buffer.getvalue()


def report(title: str, run: Callable[[], None]) -> None:
    print(f"\n{title}")
    print("-" * len(title))
    start = len(RESULTS)
    run()
    for measurement in RESULTS[start:]:
        print(f"  {measurement}")


def main() -> None:
    baseline = resident_bytes()
    print(f"Resident at start: {baseline / MB:.1f}MB")

    print("\nBuilding fixtures...")
    small = build_pdf(10)
    scanned = build_pdf(20, image_side=1400)
    print(f"  10 empty pages:            {len(small) / MB:.1f}MB")
    print(f"  20 pages of scanned images: {len(scanned) / MB:.1f}MB")

    def source(data: bytes, name: str = "scanned.pdf") -> operations.SourcePdf:
        return operations.SourcePdf(name=name, data=data)

    def merges() -> None:
        for count in (5, 10, 20):
            with measured(f"merge {count} scanned documents") as sink:
                inputs = [source(scanned, f"part-{index}.pdf") for index in range(count)]
                sink.append(len(operations.merge(inputs).data))

    def splits() -> None:
        with measured("split 20 scanned pages into 20 files") as sink:
            outputs = operations.split_every_page(source(scanned))
            sink.append(sum(len(output.data) for output in outputs))

    def organises() -> None:
        # A plan may repeat a page, so the result can be far larger than the
        # source. This is the case MAX_ORGANISE_PAGES exists for.
        plan = [operations.PlannedPage(number=index % 20 + 1) for index in range(500)]
        with measured("organise into a 500-page plan") as sink:
            sink.append(len(operations.apply_page_plan(source(scanned), plan).data))

    def compressions() -> None:
        for level in CompressionLevel:
            with measured(f"compress 20 scanned pages, {level.value}") as sink:
                outcome = compress(source(scanned), level)
                sink.append(len(outcome.output.data) if outcome.output else 0)

    report("Merge", merges)
    report("Split", splits)
    report("Organise", organises)
    report("Compress", compressions)

    print(f"\nResident at end: {resident_bytes() / MB:.1f}MB")
    worst = max(RESULTS, key=lambda m: m.grew_by)
    print(f"Worst growth:    {worst.name} at {worst.grew_by / MB:.1f}MB")


if __name__ == "__main__":
    main()
