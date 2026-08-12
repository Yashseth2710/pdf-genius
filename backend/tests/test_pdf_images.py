"""Images bound into a PDF.

Every assertion reopens what came out and measures it, in points. A test that
only counted pages would pass on a converter that produced blank ones of the
wrong shape - which is exactly the bug that was found here.
"""

import io
import re

import pymupdf
import pytest
from PIL import Image

from app.core.errors import InvalidFileError, ProcessingError
from app.services.pdf.images import Orientation, PageSize, SourceImage, images_to_pdf

A4_PORTRAIT = (595, 842)
A4_LANDSCAPE = (842, 595)
LETTER_LANDSCAPE = (792, 612)


def image_bytes(width: int, height: int, fmt: str = "JPEG", colour: str = "red") -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), colour).save(buffer, fmt)
    return buffer.getvalue()


def jpg(name: str, width: int, height: int) -> SourceImage:
    return SourceImage(name=name, data=image_bytes(width, height), extension="jpg")


def png(name: str, width: int, height: int) -> SourceImage:
    return SourceImage(name=name, data=image_bytes(width, height, fmt="PNG"), extension="png")


def page_sizes(data: bytes) -> list[tuple[int, int]]:
    with pymupdf.open(stream=data, filetype="pdf") as document:
        return [(round(page.rect.width), round(page.rect.height)) for page in document]


def test_each_image_becomes_a_page() -> None:
    result = images_to_pdf([jpg("a.jpg", 800, 600), jpg("b.jpg", 800, 600)])

    assert result.page_count == 2
    assert result.data.startswith(b"%PDF")


def test_pages_follow_the_order_the_images_were_given() -> None:
    # The order is what the user dragged the thumbnails into. Sorting by name
    # here would quietly throw that away, which is the one thing this must not
    # do.
    wide = jpg("z-wide.jpg", 1200, 400)
    tall = jpg("a-tall.jpg", 400, 1200)

    result = images_to_pdf([wide, tall], page_size=PageSize.MATCH)

    first, second = page_sizes(result.data)
    assert first[0] > first[1]  # the wide one came first, as listed
    assert second[1] > second[0]


def test_auto_orientation_follows_each_image() -> None:
    """A mixed batch should not put the landscape photos in a letterbox."""
    result = images_to_pdf(
        [jpg("wide.jpg", 1200, 600), jpg("tall.jpg", 600, 1200)],
        page_size=PageSize.A4,
        orientation=Orientation.AUTO,
    )

    assert page_sizes(result.data) == [A4_LANDSCAPE, A4_PORTRAIT]


def test_a_chosen_orientation_is_used_for_every_page() -> None:
    result = images_to_pdf(
        [jpg("wide.jpg", 1200, 600), jpg("tall.jpg", 600, 1200)],
        page_size=PageSize.LETTER,
        orientation=Orientation.LANDSCAPE,
    )

    assert page_sizes(result.data) == [LETTER_LANDSCAPE, LETTER_LANDSCAPE]


def test_matching_the_image_gives_a_page_the_shape_of_the_image() -> None:
    """No borders and no cropping: the page is the picture.

    The page is measured in points, not pixels - a 900x450 image tagged at
    96 DPI is 9.4 inches wide, so 675x338 points - which is why this checks the
    shape rather than the numbers.
    """
    result = images_to_pdf([jpg("scan.jpg", 900, 450)], page_size=PageSize.MATCH)

    (width, height) = page_sizes(result.data)[0]
    assert width / height == pytest.approx(900 / 450, rel=0.01)


def test_a_fitted_image_is_not_stretched_out_of_shape() -> None:
    """A square photo on a portrait page stays square, in white margins.

    Checked by rendering the page and looking at it, rather than by reading the
    placement rectangle back: PyMuPDF reports the rectangle it was handed
    either way, so a stretched image and a fitted one describe themselves
    identically and only the pixels tell them apart.
    """
    result = images_to_pdf(
        [jpg("square.jpg", 800, 800)], page_size=PageSize.A4, orientation=Orientation.PORTRAIT
    )

    with pymupdf.open(stream=result.data, filetype="pdf") as document:
        pixels = document[0].get_pixmap(dpi=36, alpha=False)
    with Image.open(io.BytesIO(pixels.tobytes("png"))) as rendered:
        width, height = rendered.size
        # Red across the middle, white above and below: the image is as wide as
        # the page and no taller than it is wide. The red is checked as "not
        # white" because a JPEG round trip does not return exactly 255,0,0.
        assert rendered.getpixel((width // 2, height // 2)) != (255, 255, 255)
        assert rendered.getpixel((width // 2, 2)) == (255, 255, 255)
        assert rendered.getpixel((width // 2, height - 3)) == (255, 255, 255)


@pytest.mark.parametrize(
    ("pillow_format", "extension"),
    [
        ("JPEG", "jpg"),
        ("PNG", "png"),
        ("GIF", "gif"),
        ("BMP", "bmp"),
        ("TIFF", "tiff"),
        ("WEBP", "webp"),
        ("HEIF", "heic"),
    ],
)
def test_every_accepted_image_type_becomes_a_page(pillow_format: str, extension: str) -> None:
    """The set the established converters take, so a phone photo or a scan is
    not turned away over its container format.

    WEBP and HEIC are the two PyMuPDF cannot read for itself: they go through
    Pillow first, and this is what proves the decode actually happens rather
    than the file being handed on unread.
    """
    buffer = io.BytesIO()
    Image.new("RGB", (600, 300), "red").save(buffer, pillow_format)
    source = SourceImage(name=f"photo.{extension}", data=buffer.getvalue(), extension=extension)

    result = images_to_pdf([source], page_size=PageSize.MATCH)

    assert result.page_count == 1
    (width, height) = page_sizes(result.data)[0]
    assert width / height == pytest.approx(2.0, rel=0.02)


def test_a_transparent_image_does_not_come_out_with_a_black_background() -> None:
    """WEBP with an alpha channel is re-encoded, and JPEG has no transparency.

    Getting this wrong fills every see-through pixel with black, which is
    exactly the sort of failure that looks fine in a page count.
    """
    buffer = io.BytesIO()
    Image.new("RGBA", (200, 200), (255, 0, 0, 0)).save(buffer, "WEBP", lossless=True)
    source = SourceImage(name="cutout.webp", data=buffer.getvalue(), extension="webp")

    result = images_to_pdf([source], page_size=PageSize.A4, orientation=Orientation.PORTRAIT)

    with pymupdf.open(stream=result.data, filetype="pdf") as document:
        pixels = document[0].get_pixmap(dpi=36, alpha=False)
    with Image.open(io.BytesIO(pixels.tobytes("png"))) as rendered:
        centre = rendered.getpixel((rendered.width // 2, rendered.height // 2))
        assert centre != (0, 0, 0)


@pytest.mark.parametrize("page_size", [PageSize.MATCH, PageSize.A4])
def test_a_multi_page_tiff_keeps_all_of_its_pages(page_size: PageSize) -> None:
    """A scanner writes a three-page fax as one TIFF file.

    Checked in both page modes because they were not the same: fitting to A4
    drew "the image" and silently kept page one only, while matching kept all
    three. Losing two pages of a scan is not a thing a page count would show.
    """
    buffer = io.BytesIO()
    pages = [Image.new("RGB", (600, 800), colour) for colour in ("red", "green", "blue")]
    pages[0].save(buffer, "TIFF", save_all=True, append_images=pages[1:])
    fax = SourceImage(name="fax.tiff", data=buffer.getvalue(), extension="tiff")

    result = images_to_pdf([fax], page_size=page_size)

    assert result.page_count == 3


def test_the_output_carries_the_name_it_was_asked_for() -> None:
    result = images_to_pdf([jpg("a.jpg", 100, 100)], output_name="holiday.pdf")

    assert result.filename == "holiday.pdf"


def test_no_images_is_refused_rather_than_producing_an_empty_pdf() -> None:
    with pytest.raises(ProcessingError, match="at least one image"):
        images_to_pdf([])


def test_something_that_is_not_an_image_names_the_file() -> None:
    broken = SourceImage(name="not-really.jpg", data=b"nothing like a jpeg", extension="jpg")

    with pytest.raises(InvalidFileError, match=re.escape("not-really.jpg")):
        images_to_pdf([broken])
