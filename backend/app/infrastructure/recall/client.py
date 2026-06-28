"""Recall.ai Desktop SDK backend client.

The raw RECALL_API_KEY lives here on the server and is never shipped in the desktop
app. The desktop only ever receives a per-recording ``upload_token`` minted via
``create_sdk_upload``.

Docs: https://docs.recall.ai/reference/sdk_upload_create
"""

from pathlib import Path
from typing import Any, Optional

import httpx

from app.config import get_settings
from app.utils.logging import get_logger

logger = get_logger("recall_client")

# Region -> API base URL. apiUrl passed to the desktop SDK's init() must match.
_REGION_BASES = {
    "us-west-2": "https://us-west-2.recall.ai",
    "us-east-1": "https://us-east-1.recall.ai",
    "eu-central-1": "https://eu-central-1.recall.ai",
    "ap-northeast-1": "https://ap-northeast-1.recall.ai",
}


def base_url(region: str) -> str:
    return _REGION_BASES.get(region, f"https://{region}.recall.ai")


# Realtime events we subscribe to. We deliberately do NOT subscribe to
# video_separate_png.data (it floods the event stream).
_REALTIME_EVENTS = [
    "transcript.data",
    "transcript.partial_data",
    "participant_events.join",
]


def build_recording_config(language: Optional[str] = None) -> dict:
    """Build the recording config for a given transcription language.

    en (default): recallai_streaming — Recall's built-in engine ($0.15/recording-hr,
    English-only, no extra account).
    multi: assembly_ai_v3_streaming — multi-language; billed by AssemblyAI directly
    (configure the AssemblyAI key on the Recall dashboard for the workspace region).
    """
    provider = "assembly_ai_v3_streaming" if language == "multi" else "recallai_streaming"
    return {
        "transcript": {"provider": {provider: {}}},
        "realtime_endpoints": [
            {"type": "desktop_sdk_callback", "events": _REALTIME_EVENTS}
        ],
    }


DEFAULT_RECORDING_CONFIG = build_recording_config(None)


async def create_sdk_upload(
    recording_config: Optional[dict] = None,
    metadata: Optional[dict] = None,
) -> dict[str, Any]:
    """Mint a Desktop SDK upload token.

    Returns the Recall response, including ``id`` (upload id, used later for
    retrieval) and ``upload_token`` (handed to the desktop client).
    ``recording_config`` (transcript provider + realtime_endpoints) is set HERE at
    mint time, not in the desktop's startRecording call.
    """
    settings = get_settings()
    if not settings.recall_api_key:
        raise RuntimeError("RECALL_API_KEY not configured")

    url = f"{base_url(settings.recall_api_region)}/api/v1/sdk_upload/"
    body: dict[str, Any] = {
        "recording_config": recording_config or DEFAULT_RECORDING_CONFIG,
    }
    if metadata is not None:
        body["metadata"] = metadata

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            url,
            headers={
                "Authorization": f"Token {settings.recall_api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            json=body,
        )
    resp.raise_for_status()
    return resp.json()


async def get_recording_for_upload(desktop_sdk_upload_id: str) -> Optional[dict]:
    """Fetch the recording object for a Desktop SDK upload (async retrieval path).

    NOTE: the response shape is per Recall docs/dsdk-tutorial and not verified against a
    live payload — callers should navigate it defensively and log the raw result.
    Returns the recording dict, or None if not found / not yet available.
    """
    settings = get_settings()
    if not settings.recall_api_key:
        raise RuntimeError("RECALL_API_KEY not configured")
    url = f"{base_url(settings.recall_api_region)}/api/v1/recording/"
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            url,
            headers={"Authorization": f"Token {settings.recall_api_key}", "Accept": "application/json"},
            params={"desktop_sdk_upload_id": desktop_sdk_upload_id},
        )
    resp.raise_for_status()
    data = resp.json()
    if isinstance(data, dict) and isinstance(data.get("results"), list) and data["results"]:
        return data["results"][0]
    if isinstance(data, dict) and data.get("id"):
        return data
    return None


def extract_media_urls(recording: dict) -> dict[str, Optional[str]]:
    """Best-effort extraction of mixed-video + transcript download URLs from a recording.
    Field paths per Recall docs; adjust if a live payload differs."""
    shortcuts = (recording or {}).get("media_shortcuts") or {}

    def _url(node: Any) -> Optional[str]:
        if not isinstance(node, dict):
            return None
        data = node.get("data")
        return data.get("download_url") if isinstance(data, dict) else None

    return {
        "video": _url(shortcuts.get("video_mixed")),
        "transcript": _url(shortcuts.get("transcript")),
    }


async def download_to_file(url: str, dest: Path) -> int:
    """Stream a presigned download URL to a local file. Returns bytes written."""
    total = 0
    async with httpx.AsyncClient(timeout=300.0, follow_redirects=True) as client:
        async with client.stream("GET", url) as resp:
            resp.raise_for_status()
            with open(dest, "wb") as f:
                async for chunk in resp.aiter_bytes(256 * 1024):
                    f.write(chunk)
                    total += len(chunk)
    return total
