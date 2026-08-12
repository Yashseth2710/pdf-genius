"""Identifying a file by its contents rather than by what it claims to be."""

import io

import pytest
from PIL import Image

from app.services.files.validation import (
    BMP,
    GIF,
    HEIC,
    IMAGE_TYPES,
    JPEG,
    PDF,
    PNG,
    SNIFF_BYTES,
    TIFF,
    WEBP,
    looks_like_pdf,
    sniff,
)


def test_a_pdf_is_recognised() -> None:
    result = sniff(b"%PDF-1.7\n%\xe2\xe3\xcf\xd3")

    assert result is not None
    assert result.mime == PDF
    assert result.extension == "pdf"


def test_a_jpeg_is_recognised() -> None:
    result = sniff(b"\xff\xd8\xff\xe0\x00\x10JFIF")

    assert result is not None
    assert result.mime == JPEG


def test_a_png_is_recognised() -> None:
    result = sniff(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR")

    assert result is not None
    assert result.mime == PNG


@pytest.mark.parametrize(
    ("pillow_format", "mime"),
    [("GIF", GIF), ("BMP", BMP), ("TIFF", TIFF), ("WEBP", WEBP)],
)
def test_every_accepted_image_type_is_recognised_from_real_bytes(
    pillow_format: str, mime: str
) -> None:
    """Written by Pillow rather than by hand, so these are the bytes a real
    file has - not a magic number copied out of a table and possibly wrong."""
    buffer = io.BytesIO()
    Image.new("RGB", (8, 8), "red").save(buffer, pillow_format)

    result = sniff(buffer.getvalue()[:SNIFF_BYTES])

    assert result is not None
    assert result.mime == mime


def test_a_heic_photo_is_recognised() -> None:
    # The format an iPhone writes by default, and the reason the sniff window
    # is 32 bytes: the brand that identifies it sits four bytes in.
    #
    # Imported here rather than at the top of the file for its side effect:
    # Pillow cannot write HEIF until something registers the codec, and the
    # only thing that does is the module that decodes them for real. Relying on
    # some other test having imported it first would work until the day this
    # file is run on its own.
    import app.services.pdf.images  # noqa: F401

    buffer = io.BytesIO()
    Image.new("RGB", (8, 8), "red").save(buffer, "HEIF")

    result = sniff(buffer.getvalue()[:SNIFF_BYTES])

    assert result is not None
    assert result.mime == HEIC


def test_a_big_endian_tiff_is_recognised_too() -> None:
    # Scanners produce both byte orders, and a file refused for being the wrong
    # endianness would be a baffling thing to be told.
    result = sniff(b"MM\x00\x2a\x00\x00\x00\x08")

    assert result is not None
    assert result.mime == TIFF


def test_every_image_type_can_be_sniffed_or_is_not_claimed() -> None:
    """Whatever the list says we take, the sniffer has to be able to find."""
    from app.services.files.validation import _SIGNATURES

    recognisable = {signature.file_type.mime for signature in _SIGNATURES}
    assert set(IMAGE_TYPES) <= recognisable


def test_an_executable_renamed_to_pdf_is_not_a_pdf() -> None:
    """The whole point: the extension is irrelevant, the bytes decide."""
    windows_exe = b"MZ\x90\x00\x03\x00\x00\x00"

    assert sniff(windows_exe) is None


def test_a_shell_script_is_not_accepted() -> None:
    assert sniff(b"#!/bin/sh\nrm -rf /") is None


def test_html_is_not_accepted() -> None:
    """An HTML file served back could carry script; it is not a document."""
    assert sniff(b"<!DOCTYPE html><script>alert(1)</script>") is None


def test_a_zip_is_not_accepted() -> None:
    """We produce archives, but never take one: an uploaded zip is a way in
    for whatever is inside it, and nothing here needs to open one."""
    assert sniff(b"PK\x03\x04\x14\x00\x00\x00") is None


def test_an_empty_file_is_not_recognised() -> None:
    assert sniff(b"") is None


def test_a_pdf_header_further_in_the_file_does_not_count() -> None:
    """A polyglot file that only mentions %PDF- later is not a PDF."""
    assert sniff(b"not a document at all ... %PDF-1.4") is None


def test_a_riff_container_that_is_not_a_webp_is_refused() -> None:
    # A WAV file is also RIFF. The form type four bytes on is what separates
    # them, which is exactly why that signature carries an offset.
    assert sniff(b"RIFF\x24\x08\x00\x00WAVEfmt ") is None


def test_looks_like_pdf_matches_only_the_header() -> None:
    assert looks_like_pdf(b"%PDF-1.4") is True
    assert looks_like_pdf(b" %PDF-1.4") is False
