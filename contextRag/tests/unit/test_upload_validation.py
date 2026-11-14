from __future__ import annotations

import io
import zipfile
from pathlib import Path

import fitz
import pytest

from app.services.upload_validation import (
    UploadTooLargeError,
    UploadValidationError,
    create_storage_path,
    save_and_validate_upload,
    validate_upload_filename,
)
from app.services import upload_validation


class AsyncBytesReader:
    def __init__(self, content: bytes):
        self.content = io.BytesIO(content)

    async def read(self, size: int = -1) -> bytes:
        return self.content.read(size)


def make_pdf() -> bytes:
    document = fitz.open()
    page = document.new_page()
    page.insert_text((72, 72), "A valid test PDF")
    content = document.tobytes()
    document.close()
    return content


def make_docx() -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr(
            "[Content_Types].xml",
            "<Types xmlns='http://schemas.openxmlformats.org/package/2006/content-types'/>",
        )
        archive.writestr(
            "word/document.xml",
            "<w:document xmlns:w='http://schemas.openxmlformats.org/wordprocessingml/2006/main'>"
            "<w:body><w:p><w:r><w:t>Valid document text</w:t></w:r></w:p></w:body></w:document>",
        )
    return buffer.getvalue()


@pytest.mark.parametrize(
    ("extension", "content"),
    [
        ("pdf", make_pdf()),
        ("docx", make_docx()),
        ("txt", b"Valid UTF-8 test document"),
    ],
)
@pytest.mark.asyncio
async def test_accepts_valid_document_types(tmp_path, extension: str, content: bytes):
    path, size = await save_and_validate_upload(
        AsyncBytesReader(content),
        str(tmp_path),
        extension,
        max_bytes=1024 * 1024,
    )

    assert size == len(content)
    assert Path(path).read_bytes() == content


@pytest.mark.asyncio
async def test_rejects_empty_file_and_removes_partial_upload(tmp_path):
    with pytest.raises(UploadValidationError, match="Empty files"):
        await save_and_validate_upload(
            AsyncBytesReader(b""),
            str(tmp_path),
            "txt",
            max_bytes=100,
        )

    assert list(tmp_path.iterdir()) == []


@pytest.mark.asyncio
async def test_rejects_oversized_file_before_leaving_partial_upload(tmp_path):
    with pytest.raises(UploadTooLargeError):
        await save_and_validate_upload(
            AsyncBytesReader(b"more than ten bytes"),
            str(tmp_path),
            "txt",
            max_bytes=10,
        )

    assert list(tmp_path.iterdir()) == []


@pytest.mark.parametrize(
    "filename",
    ["../secret.pdf", r"..\secret.pdf", r"C:\private\secret.pdf"],
)
def test_rejects_path_traversal_filenames(filename: str):
    with pytest.raises(UploadValidationError, match="Invalid filename"):
        validate_upload_filename(filename, ["pdf"])


def test_rejects_unsupported_extension():
    with pytest.raises(UploadValidationError, match="Unsupported file type"):
        validate_upload_filename("payload.exe", ["pdf", "txt"])


@pytest.mark.asyncio
async def test_rejects_corrupted_pdf_and_cleans_temporary_file(tmp_path):
    with pytest.raises(UploadValidationError, match="Invalid or corrupted PDF"):
        await save_and_validate_upload(
            AsyncBytesReader(b"not a PDF"),
            str(tmp_path),
            "pdf",
            max_bytes=100,
        )

    assert list(tmp_path.iterdir()) == []


def test_storage_filename_is_unique_and_not_client_controlled(tmp_path):
    first = create_storage_path(str(tmp_path), "txt")
    second = create_storage_path(str(tmp_path), "txt")

    assert first != second
    assert Path(first).name != "same-name.txt"
    assert Path(second).name != "same-name.txt"


def test_finalize_upload_does_not_overwrite_a_filename_collision(
    tmp_path, monkeypatch: pytest.MonkeyPatch
):
    existing = tmp_path / "occupied.txt"
    existing.write_text("existing data", encoding="utf-8")
    temporary = tmp_path / ".upload.part"
    temporary.write_text("new upload", encoding="utf-8")
    candidates = iter([str(existing), str(tmp_path / "unique.txt")])
    monkeypatch.setattr(
        upload_validation,
        "create_storage_path",
        lambda directory, extension: next(candidates),
    )

    destination = upload_validation.finalize_upload(
        str(temporary),
        str(tmp_path),
        "txt",
    )

    assert destination == str(tmp_path / "unique.txt")
    assert existing.read_text(encoding="utf-8") == "existing data"
    assert Path(destination).read_text(encoding="utf-8") == "new upload"
    assert not temporary.exists()
