"""Calendar webhook security: channel token validation."""

from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app


@patch("app.config.get_settings")
def test_google_calendar_webhook_rejects_wrong_channel_token(mock_get_settings) -> None:
    mock_get_settings.return_value = MagicMock(
        google_calendar_webhook_token="expected-token"
    )
    with TestClient(app) as client:
        r = client.post(
            "/api/v1/calendar/webhook/google",
            headers={"X-Goog-Channel-Token": "wrong-token"},
        )
    assert r.status_code == 403
    assert "Invalid" in r.json().get("message", "")
