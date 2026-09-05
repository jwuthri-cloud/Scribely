"""
S3-compatible object storage (AWS S3, MinIO, Cloudflare R2, etc.).

Used to persist meeting artifacts when local disk is ephemeral (e.g. Railway).
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

import boto3
from botocore.config import Config

from app.config import get_settings
from app.utils.logging import get_logger

logger = get_logger("object_storage")

TRANSCRIPT_JSON = "transcript.json"
RECORDING_WEBM = "recording.webm"
TRANSCRIPT_ENRICHED_JSON = "transcript_enriched.json"
PROCESSING_STATUS_JSON = "processing_status.json"


def object_key(storage_path: str, filename: str) -> str:
    """S3 object key for a file under a meeting prefix (no leading slash)."""
    prefix = storage_path.strip("/").replace("\\", "/")
    return f"{prefix}/{filename}"


def is_object_storage_configured() -> bool:
    s = get_settings()
    if not s.object_storage_enabled:
        return False
    return bool(
        s.s3_endpoint_url
        and s.s3_bucket
        and s.s3_access_key_id
        and s.s3_secret_access_key
    )


def _s3_client() -> Any:
    s = get_settings()
    cfg = Config(
        signature_version="s3v4",
        s3={"addressing_style": "path" if s.s3_use_path_style else "virtual"},
    )
    return boto3.client(
        "s3",
        endpoint_url=s.s3_endpoint_url or None,
        aws_access_key_id=s.s3_access_key_id,
        aws_secret_access_key=s.s3_secret_access_key,
        region_name=s.s3_region,
        config=cfg,
    )


def derive_storage_path(meeting_dir: Path) -> str:
    """Path segment under upload_dir: ``{user_id}/{meeting_folder_id}``."""
    settings = get_settings()
    base = Path(settings.upload_dir).resolve()
    md = meeting_dir.resolve()
    try:
        return str(md.relative_to(base)).replace("\\", "/")
    except ValueError:
        return f"{meeting_dir.parent.name}/{meeting_dir.name}"


def upload_file_sync(local_path: Path, storage_path: str, filename: str) -> None:
    if not is_object_storage_configured():
        return
    if not local_path.is_file():
        logger.warning("Skip S3 upload, missing file: %s", local_path)
        return
    s = get_settings()
    key = object_key(storage_path, filename)
    client = _s3_client()
    client.upload_file(str(local_path), s.s3_bucket, key)
    logger.info("Uploaded s3://%s/%s", s.s3_bucket, key)


def mirror_meeting_from_object_storage(meeting_dir: Path, storage_path: str) -> None:
    """Download meeting artifacts from S3 when missing locally (same paths as disk layout)."""
    if not is_object_storage_configured():
        return

    meeting_dir.mkdir(parents=True, exist_ok=True)
    s = get_settings()
    client = _s3_client()
    prefix = object_key(storage_path, "").rstrip("/") + "/"

    paginator = client.get_paginator("list_objects_v2")
    found = False
    for page in paginator.paginate(Bucket=s.s3_bucket, Prefix=prefix):
        for obj in page.get("Contents", []):
            found = True
            key = obj["Key"]
            suffix = key[len(prefix) :].lstrip("/")
            if not suffix or suffix.endswith("/"):
                continue
            dest = meeting_dir / suffix
            if dest.exists() and dest.stat().st_size > 0:
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            client.download_file(s.s3_bucket, key, str(dest))
            logger.info("Downloaded s3://%s/%s → %s", s.s3_bucket, key, dest)

    if not found:
        logger.warning("No objects found for prefix s3://%s/%s", s.s3_bucket, prefix)


async def upload_file_async(local_path: Path, storage_path: str, filename: str) -> None:
    await asyncio.to_thread(upload_file_sync, local_path, storage_path, filename)


async def mirror_meeting_from_object_storage_async(
    meeting_dir: Path, storage_path: str
) -> None:
    await asyncio.to_thread(
        mirror_meeting_from_object_storage, meeting_dir, storage_path
    )


def mirror_processing_status_json(meeting_dir: Path, storage_path: str) -> None:
    """Upload processing_status.json after sync writes (small file)."""
    path = meeting_dir / PROCESSING_STATUS_JSON
    if path.is_file():
        upload_file_sync(path, storage_path, PROCESSING_STATUS_JSON)
