"""LangChain tool for web search via Tavily, with Google Serper as fallback."""
import httpx
from langchain_core.tools import StructuredTool

from app.config import get_settings
from app.utils.logging import get_logger

logger = get_logger("tool.web_search")

# Tavily error messages that indicate a credit/quota issue
_TAVILY_CREDIT_ERRORS = (
    "credit",
    "quota",
    "limit",
    "billing",
    "insufficient",
    "plan",
    "upgrade",
)


async def _serper_search(query: str, max_results: int, api_key: str) -> str:
    """Fallback: search via Google Serper API."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                "https://google.serper.dev/search",
                headers={"X-API-KEY": api_key, "Content-Type": "application/json"},
                json={"q": query, "num": max_results},
            )
            resp.raise_for_status()
            data = resp.json()

        lines = []
        answer_box = data.get("answerBox", {})
        if answer_box.get("answer"):
            lines.append(f"**Answer:** {answer_box['answer']}\n")
        elif answer_box.get("snippet"):
            lines.append(f"**Answer:** {answer_box['snippet']}\n")

        organic = data.get("organic", [])
        if organic:
            lines.append("**Sources:**")
            for r in organic[:max_results]:
                title = r.get("title", "")
                link = r.get("link", "")
                snippet = r.get("snippet", "")[:300]
                lines.append(f"- {title}\n  {link}\n  {snippet}")

        return "\n".join(lines) if lines else f"No results found for '{query}'."
    except Exception as e:
        logger.error(f"Serper search error: {e}")
        return f"Web search failed: {e}"


def build_web_search_tools() -> list:
    """
    Build web search tools.

    Primary: Tavily (requires TAVILY_API_KEY)
    Fallback: Google Serper (requires SERPER_API_KEY) — used if Tavily hits a quota/credit error

    Returns empty list if neither key is configured.
    """
    settings = get_settings()
    tavily_key = settings.tavily_api_key
    serper_key = settings.serper_api_key

    if not tavily_key and not serper_key:
        logger.info("No web search provider configured (TAVILY_API_KEY or SERPER_API_KEY)")
        return []

    tavily_client = None
    if tavily_key:
        try:
            from tavily import AsyncTavilyClient
            tavily_client = AsyncTavilyClient(api_key=tavily_key)
        except Exception as e:
            logger.warning(f"Failed to initialize Tavily: {e}")

    async def web_search(query: str, max_results: int = 5) -> str:
        """
        Search the web for up-to-date information on any topic.
        Uses Tavily as primary search engine with Google Serper as fallback.

        Args:
            query: The search query
            max_results: Number of results to return (default 5, max 10)
        """
        max_results = min(max_results, 10)

        # Try Tavily first
        if tavily_client:
            try:
                response = await tavily_client.search(
                    query=query,
                    max_results=max_results,
                    include_answer=True,
                )
                lines = []
                answer = response.get("answer")
                if answer:
                    lines.append(f"**Summary:** {answer}\n")
                results = response.get("results", [])
                if results:
                    lines.append("**Sources:**")
                    for r in results:
                        title = r.get("title", "")
                        url = r.get("url", "")
                        content = r.get("content", "")[:300]
                        lines.append(f"- {title}\n  {url}\n  {content}")
                return "\n".join(lines) if lines else f"No results found for '{query}'."

            except Exception as e:
                err_str = str(e).lower()
                is_credit_error = any(keyword in err_str for keyword in _TAVILY_CREDIT_ERRORS)

                if is_credit_error and serper_key:
                    logger.warning(f"Tavily quota/credit error, falling back to Serper: {e}")
                    return await _serper_search(query, max_results, serper_key)

                logger.error(f"Tavily search error: {e}")
                # If we have Serper, try it regardless
                if serper_key:
                    logger.info("Falling back to Serper after Tavily error")
                    return await _serper_search(query, max_results, serper_key)
                return f"Web search failed: {e}"

        # Tavily not available, use Serper directly
        if serper_key:
            return await _serper_search(query, max_results, serper_key)

        return "Web search is not configured."

    return [
        StructuredTool.from_function(
            coroutine=web_search,
            name="web_search",
            description=(
                "Search the web for current information, news, documentation, or any topic "
                "not covered by the user's meeting history."
            ),
        )
    ]
