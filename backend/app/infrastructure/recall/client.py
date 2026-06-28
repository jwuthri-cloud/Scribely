"""Recall.ai Desktop SDK backend client.

The raw RECALL_API_KEY lives here on the server and is never shipped in the desktop
app. The desktop only ever receives a per-recording ``upload_token`` minted via
``create_sdk_upload``.

Docs: https://docs.recall.ai/reference/sdk_upload_create
"""

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
    body: dict[str, Any] = {}
    if recording_config is not None:
        body["recording_config"] = recording_config
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
