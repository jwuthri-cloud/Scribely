"""LangChain tools for external integrations via Composio MCP."""
from app.config import get_settings
from app.utils.logging import get_logger

logger = get_logger("tool.composio")


def _fix_schema(schema: dict) -> dict:
    """Recursively ensure every object's properties are listed in required."""
    if not isinstance(schema, dict):
        return schema
    if schema.get("type") == "object" and "properties" in schema:
        schema["required"] = list(schema["properties"].keys())
        schema["properties"] = {k: _fix_schema(v) for k, v in schema["properties"].items()}
    if "items" in schema:
        schema["items"] = _fix_schema(schema["items"])
    return schema


def _fix_tool_schema(tool):
    """Patch Composio MCP tool schemas to satisfy strict OpenAI function calling.

    Composio occasionally emits object nodes where not all properties are listed
    in `required`. OpenAI rejects these with a 400. We fix them in-place by
    monkey-patching the schema method on the tool's args_schema.
    """
    try:
        schema_cls = getattr(tool, "args_schema", None)
        if schema_cls is None:
            return tool
        original = schema_cls.model_json_schema.__func__

        def patched(cls, **kwargs):
            return _fix_schema(original(cls, **kwargs))

        schema_cls.model_json_schema = classmethod(patched)
    except Exception:
        pass
    return tool


async def build_composio_tools(user_id: str) -> tuple[list, object | None]:
    """
    Build Composio integration tools scoped to a specific user via MCP.

    Returns (tools, mcp_client) — the caller MUST keep mcp_client alive for the
    entire agent lifecycle and call `await mcp_client.__aexit__(None, None, None)`
    when done. The MCP HTTP session must stay open for tool calls to work.

    Args:
        user_id: The authenticated user's ID (used as Composio external_user_id)

    Returns:
        (tools, mcp_client) — empty list + None if Composio is not configured.
    """
    settings = get_settings()
    if not settings.composio_api_key:
        logger.info("Composio not configured — external integration tools disabled")
        return [], None

    try:
        from composio import Composio
        from langchain_mcp_adapters.client import MultiServerMCPClient

        composio = Composio(api_key=settings.composio_api_key)
        session = composio.create(user_id=user_id)

        mcp_client = MultiServerMCPClient(
            {
                "composio": {
                    "transport": "streamable_http",
                    "url": session.mcp.url,
                    "headers": session.mcp.headers,
                }
            }
        )
        tools = await mcp_client.get_tools()
        tools = [_fix_tool_schema(t) for t in tools]

        logger.info(f"Loaded {len(tools)} Composio tools for user {user_id}")
        return tools, mcp_client

    except ImportError:
        logger.warning("composio or langchain-mcp-adapters not installed — run: pip install composio langchain-mcp-adapters")
        return [], None
    except Exception as e:
        logger.warning(f"Failed to load Composio tools for user {user_id}: {e}")
        return [], None


def get_composio_connect_url(user_id: str, app_name: str) -> str:
    """
    Generate a Composio OAuth connect URL for a specific app.

    Args:
        user_id: The authenticated user's ID
        app_name: App name (e.g. 'GMAIL', 'SLACK')

    Returns:
        OAuth redirect URL string

    Raises:
        RuntimeError: If Composio is not configured or URL generation fails
    """
    settings = get_settings()
    if not settings.composio_api_key:
        raise RuntimeError("Composio is not configured (COMPOSIO_API_KEY missing)")

    try:
        from composio import Composio

        composio = Composio(api_key=settings.composio_api_key)
        entity = composio.get_entity(id=user_id)
        connection_request = entity.initiate_connection(app_name.upper())
        return connection_request.redirectUrl
    except KeyError:
        raise ValueError(f"Unknown app: '{app_name}'")
    except Exception as e:
        raise RuntimeError(f"Failed to generate connect URL: {e}") from e


def get_connected_apps(user_id: str) -> list[dict]:
    """
    List apps the user has connected via Composio.

    Args:
        user_id: The authenticated user's ID

    Returns:
        List of dicts with 'app' and 'status' keys
    """
    settings = get_settings()
    if not settings.composio_api_key:
        return []

    try:
        from composio import Composio

        composio = Composio(api_key=settings.composio_api_key)
        entity = composio.get_entity(id=user_id)
        connections = entity.get_connections()
        return [
            {"app": c.appUniqueId, "status": c.status}
            for c in connections
        ]
    except Exception as e:
        logger.warning(f"Failed to get connected apps for user {user_id}: {e}")
        return []


def disconnect_app(user_id: str, app_name: str) -> bool:
    """
    Disconnect a Composio app for a user.

    Args:
        user_id: The authenticated user's ID
        app_name: App name to disconnect

    Returns:
        True if disconnected successfully
    """
    settings = get_settings()
    if not settings.composio_api_key:
        return False

    try:
        from composio import Composio

        composio = Composio(api_key=settings.composio_api_key)
        entity = composio.get_entity(id=user_id)
        connections = entity.get_connections()
        for conn in connections:
            if conn.appUniqueId.upper() == app_name.upper():
                conn.delete()
                return True
        return False
    except Exception as e:
        logger.warning(f"Failed to disconnect {app_name} for user {user_id}: {e}")
        return False
