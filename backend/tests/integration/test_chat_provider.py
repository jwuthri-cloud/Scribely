"""Real LangChain/OpenAI client integration over mocked HTTP; no paid API calls."""

import json

import httpx
import pytest
from langchain_core.messages import HumanMessage

from app.config import Settings
from app.infrastructure import llm_provider
from app.model_name import (
    DEFAULT_TRAINING,
    OPENROUTER_CHAT_MODEL_CATALOG,
    get_chat_model_catalog,
)


@pytest.fixture
def modelgo_settings(monkeypatch):
    settings = Settings(
        _env_file=None,
        chat_llm_provider="modelgo",
        modelgo_api_key="test-modelgo-key",
        modelgo_model="exact-model:free",
        modelgo_models=["other-model", "exact-model:free"],
    )
    monkeypatch.setattr("app.config.settings", settings)
    return settings


def test_openrouter_remains_default(monkeypatch):
    settings = Settings(_env_file=None, openrouter_api_key="test-openrouter-key")
    monkeypatch.setattr("app.config.settings", settings)
    assert isinstance(llm_provider.get_chat_provider(), llm_provider.OpenRouterProvider)
    assert get_chat_model_catalog() == (OPENROUTER_CHAT_MODEL_CATALOG, DEFAULT_TRAINING)
    llm = llm_provider.get_chat_provider().get_llm(
        fallback_models=["backup"],
        provider_config={"sort": "price"},
        enable_langfuse=False,
    )
    assert llm.openai_api_base == "https://openrouter.ai/api/v1"
    assert llm.extra_body == {"models": ["backup"], "provider": {"sort": "price"}}


def test_modelgo_catalog_preserves_exact_ids(modelgo_settings):
    catalog, default = get_chat_model_catalog()
    assert default == "exact-model:free"
    assert [row["id"] for row in catalog] == ["exact-model:free", "other-model"]
    assert all(row["provider"] == "modelgo" for row in catalog)


@pytest.mark.parametrize("model_id", ["", " model", "model "])
def test_modelgo_rejects_invalid_configuration(modelgo_settings, model_id):
    modelgo_settings.modelgo_model = model_id
    with pytest.raises(ValueError, match="exact ModelGo model IDs"):
        get_chat_model_catalog()


def test_modelgo_requires_its_own_key(modelgo_settings):
    modelgo_settings.modelgo_api_key = ""
    modelgo_settings.openrouter_api_key = "must-not-be-used"
    with pytest.raises(ValueError, match="MODELGO_API_KEY"):
        llm_provider.get_chat_provider()


def test_modelgo_does_not_accept_openrouter_extensions(modelgo_settings):
    provider = llm_provider.get_chat_provider()
    with pytest.raises(TypeError):
        provider.get_llm("exact-model:free", provider_config={"sort": "price"})
    with pytest.raises(TypeError):
        provider.get_llm("exact-model:free", fallback_models=["backup"])
    assert not hasattr(provider, "get_balance")


def make_llm(monkeypatch, handler):
    """Supply MockTransport to the real SDK clients constructed by ChatOpenAI."""
    original = llm_provider.ChatOpenAI
    sync_client = httpx.Client(transport=httpx.MockTransport(handler))
    async_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))

    def create(**kwargs):
        return original(
            **kwargs, http_client=sync_client, http_async_client=async_client
        )

    monkeypatch.setattr(llm_provider, "ChatOpenAI", create)
    llm = llm_provider.get_chat_provider().get_llm(
        "exact-model:free",
        enable_langfuse=False,
    )
    return llm, sync_client, async_client


def assert_request(request, expected_temperature=None):
    assert str(request.url) == "https://api.modelgo.ai/v1/chat/completions"
    assert request.headers["Authorization"] == "Bearer test-modelgo-key"
    body = json.loads(request.content)
    assert body["model"] == "exact-model:free"
    assert body["messages"] == [{"role": "user", "content": "Hello"}]
    if expected_temperature is None:
        assert "temperature" not in body
    else:
        assert body["temperature"] == expected_temperature
    assert "provider" not in body
    assert "models" not in body
    return body


@pytest.mark.asyncio
@pytest.mark.parametrize("send_temperature", [False, True])
async def test_modelgo_completion_on_wire(
    modelgo_settings, monkeypatch, send_temperature
):
    modelgo_settings.modelgo_send_temperature = send_temperature

    def handler(request):
        body = assert_request(request, 0 if send_temperature else None)
        assert not body.get("stream", False)
        return httpx.Response(
            200,
            json={
                "id": "chat-test",
                "object": "chat.completion",
                "created": 1,
                "model": body["model"],
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", "content": "Hi"},
                        "finish_reason": "stop",
                    }
                ],
            },
        )

    llm, sync_client, async_client = make_llm(monkeypatch, handler)
    try:
        result = await llm.ainvoke([HumanMessage(content="Hello")])
        assert result.content == "Hi"
    finally:
        sync_client.close()
        await async_client.aclose()


@pytest.mark.asyncio
async def test_modelgo_sse_stream_on_wire(modelgo_settings, monkeypatch):
    def handler(request):
        body = assert_request(request)
        assert body["stream"] is True
        chunks = [
            {
                "id": "test",
                "object": "chat.completion.chunk",
                "created": 1,
                "model": body["model"],
                "choices": [
                    {
                        "index": 0,
                        "delta": {"role": "assistant", "content": "Hi"},
                        "finish_reason": None,
                    }
                ],
            },
            {
                "id": "test",
                "object": "chat.completion.chunk",
                "created": 1,
                "model": body["model"],
                "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
            },
        ]
        content = "".join(f"data: {json.dumps(chunk)}\n\n" for chunk in chunks)
        return httpx.Response(
            200,
            headers={"Content-Type": "text/event-stream"},
            text=content + "data: [DONE]\n\n",
        )

    llm, sync_client, async_client = make_llm(monkeypatch, handler)
    try:
        chunks = [chunk async for chunk in llm.astream("Hello")]
        assert "".join(chunk.content for chunk in chunks) == "Hi"
    finally:
        sync_client.close()
        await async_client.aclose()


@pytest.mark.asyncio
async def test_modelgo_auth_error_propagates(modelgo_settings, monkeypatch):
    from openai import AuthenticationError

    def handler(request):
        assert_request(request)
        return httpx.Response(401, json={"error": {"message": "Invalid API key"}})

    llm, sync_client, async_client = make_llm(monkeypatch, handler)
    try:
        with pytest.raises(AuthenticationError):
            await llm.ainvoke("Hello")
    finally:
        sync_client.close()
        await async_client.aclose()


def test_modelgo_temperature_is_explicitly_opt_in(modelgo_settings):
    provider = llm_provider.get_chat_provider()
    assert provider.get_llm("exact-model:free", temperature=0.7).temperature is None
    modelgo_settings.modelgo_send_temperature = True
    assert provider.get_llm("exact-model:free", temperature=0.7).temperature == 0.7
