"""Identifying a file by its contents rather than by what it claims to be."""

from app.services.files.validation import JPEG, PDF, PNG, looks_like_pdf, sniff


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


def test_an_executable_renamed_to_pdf_is_not_a_pdf() -> None:
    """The whole point: the extension is irrelevant, the bytes decide."""
    windows_exe = b"MZ\x90\x00\x03\x00\x00\x00"

    assert sniff(windows_exe) is None


def test_a_shell_script_is_not_accepted() -> None:
    assert sniff(b"#!/bin/sh\nrm -rf /") is None


def test_html_is_not_accepted() -> None:
    """An HTML file served back could carry script; it is not a document."""
    assert sniff(b"<!DOCTYPE html><script>alert(1)</script>") is None


def test_an_empty_file_is_not_recognised() -> None:
    assert sniff(b"") is None


def test_a_pdf_header_further_in_the_file_does_not_count() -> None:
    """A polyglot file that only mentions %PDF- later is not a PDF."""
    assert sniff(b"GIF89a ... %PDF-1.4") is None


def test_looks_like_pdf_matches_only_the_header() -> None:
    assert looks_like_pdf(b"%PDF-1.4") is True
    assert looks_like_pdf(b" %PDF-1.4") is False
