from __future__ import annotations

import os
import re
import shutil
import tempfile
import zipfile
from pathlib import Path
from typing import Protocol
from uuid import uuid4
from app.core.logger import get_logger
from xml.etree import ElementTree


class UploadValidationError(ValueError):
    pass


class UploadTooLargeError(UploadValidationError):
    pass


logger = get_logger(__name__)


class AsyncUploadReader(Protocol):
    async def read(self, size: int = -1) -> bytes: ...


def validate_upload_filename(filename: str | None, allowed_extensions: list[str]) -> tuple[str, str]:
    if not filename or filename in {".", ".."} or any(char in filename for char in ("/", "\\", "\0")):
        raise UploadValidationError("Invalid filename")

    extension = Path(filename).suffix.lower().lstrip(".")
    if extension not in allowed_extensions:
        raise UploadValidationError("Unsupported file type")

    display_name = re.sub(r"[\x00-\x1f\x7f]", "", filename).strip()
    if not display_name:
        raise UploadValidationError("Invalid filename")
    return display_name, extension


def create_storage_path(upload_dir: str, extension: str) -> str:
    return os.path.join(upload_dir, f"{uuid4().hex}.{extension}")


def cleanup_upload_file(file_path: str) -> None:
    try:
        os.remove(file_path)
    except FileNotFoundError:
        return
    except OSError as exc:
        logger.error(
            "upload_file_cleanup_failed",
            error_type=type(exc).__name__,
        )


def finalize_upload(temp_path: str, upload_dir: str, extension: str) -> str:
    for _ in range(3):
        destination = create_storage_path(upload_dir, extension)
        try:
            fd = os.open(
                destination,
                os.O_CREAT | os.O_EXCL | os.O_WRONLY,
                0o600,
            )
        except FileExistsError:
            continue

        try:
            with os.fdopen(fd, "wb") as target, open(temp_path, "rb") as source:
                shutil.copyfileobj(source, target, length=64 * 1024)
            cleanup_upload_file(temp_path)
            return destination
        except BaseException:
            cleanup_upload_file(destination)
            raise

    raise FileExistsError("Unable to allocate a unique upload filename")


async def save_and_validate_upload(
    upload: AsyncUploadReader,
    upload_dir: str,
    extension: str,
    max_bytes: int,
) -> tuple[str, int]:
    os.makedirs(upload_dir, exist_ok=True)
    fd, temp_path = tempfile.mkstemp(prefix=".upload-", suffix=".part", dir=upload_dir)
    size = 0
    try:
        with os.fdopen(fd, "wb") as target:
            while True:
                data = await upload.read(64 * 1024)
                if not data:
                    break
                size += len(data)
                if size > max_bytes:
                    raise UploadTooLargeError("File exceeds the maximum allowed size")
                target.write(data)

        validate_document_content(temp_path, extension)
        return temp_path, size
    except BaseException:
        cleanup_upload_file(temp_path)
        raise


def validate_document_content(file_path: str, extension: str) -> None:
    if os.path.getsize(file_path) == 0:
        raise UploadValidationError("Empty files are not allowed")

    try:
        if extension in {"txt", "md"}:
            with open(file_path, "r", encoding="utf-8-sig") as source:
                if not source.read().strip():
                    raise UploadValidationError("Empty documents are not allowed")
        elif extension == "pdf":
            import fitz

            with open(file_path, "rb") as source:
                pdf_bytes = source.read()
            with fitz.open(stream=pdf_bytes, filetype="pdf") as document:
                if document.is_encrypted or document.page_count < 1:
                    raise UploadValidationError("PDF must be readable and contain at least one page")
        elif extension == "docx":
            with zipfile.ZipFile(file_path) as archive:
                if sum(member.file_size for member in archive.infolist()) > 100 * 1024 * 1024:
                    raise UploadValidationError("Expanded document is too large")
                if (
                    "[Content_Types].xml" not in archive.namelist()
                    or "word/document.xml" not in archive.namelist()
                ):
                    raise UploadValidationError("Invalid DOCX document")
                if archive.testzip() is not None:
                    raise UploadValidationError("Invalid DOCX archive")
                document_xml = archive.read("word/document.xml")
                if len(document_xml) > 20 * 1024 * 1024:
                    raise UploadValidationError("DOCX document content is too large")
                root = ElementTree.fromstring(document_xml)
                text = "".join(
                    node.text or ""
                    for node in root.iter(
                        "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t"
                    )
                )
                if not text.strip():
                    raise UploadValidationError("Empty documents are not allowed")
        elif extension in {"png", "jpg", "jpeg", "tiff"}:
            from PIL import Image

            with Image.open(file_path) as image:
                expected_formats = {
                    "png": "PNG",
                    "jpg": "JPEG",
                    "jpeg": "JPEG",
                    "tiff": "TIFF",
                }
                if image.format != expected_formats[extension]:
                    raise UploadValidationError("File content does not match its extension")
                if image.width * image.height > 100_000_000:
                    raise UploadValidationError("Image dimensions exceed the allowed limit")
                image.verify()
        else:
            raise UploadValidationError("Unsupported file type")
    except UploadValidationError:
        raise
    except Exception as exc:
        raise UploadValidationError(f"Invalid or corrupted {extension.upper()} document") from exc
