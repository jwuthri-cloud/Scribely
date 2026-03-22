# Lessons Learned

<!--
Format for each entry:
## [Short title]
- **Mistake**: What went wrong
- **Root cause**: Why it happened
- **Rule**: Concrete rule to prevent recurrence
-->

## Next.js: marketing chrome vs app shell
- **Mistake**: Root `layout.tsx` rendered `Navbar` + `Footer` for every route; authenticated `(app)` layout also rendered its own top bar and `UserButton`, causing overlapping “Back to site” / “Dashboard” text and duplicate avatars on `/dashboard`.
- **Root cause**: Route-group layouts nest inside the root layout; global marketing chrome must be omitted for app (and often auth) routes.
- **Rule**: Use a client `MarketingShell` (or a `(marketing)` route group layout) that wraps `Navbar`/`Footer` only when `usePathname()` is not under app/auth prefixes; app routes get children only.

## Langfuse keys in .env but SDK says missing public_key
- **Mistake**: `LANGFUSE_PUBLIC_KEY` set in `backend/.env` but Langfuse logged “initialized without public_key”.
- **Root cause**: `pydantic-settings` loads `.env` into `Settings` only; the Langfuse SDK also reads `os.environ`. Code paths like `get_client()` → `Langfuse()` with no args only see env vars, not Pydantic’s in-memory values.
- **Rule**: After building `Settings`, sync `langfuse_*` into `LANGFUSE_*` in `os.environ` when Langfuse is enabled (see `app.config._sync_langfuse_sdk_environment`).

## Starlette `BaseHTTPMiddleware` → `RuntimeError: No response returned`
- **Mistake**: Uvicorn logged `RuntimeError: No response returned` from `starlette/middleware/base.py` (often after reload or with streaming).
- **Root cause**: `BaseHTTPMiddleware` wraps the app in a task group; if the inner ASGI app finishes without sending `http.response.start` (or in edge cases with streaming/disconnects), Starlette raises that error.
- **Rule**: Prefer pure ASGI middleware (`__call__(self, scope, receive, send)` + `MutableHeaders` on `http.response.start`) for logging and security headers, matching patterns like `CORSMiddleware`—avoid `BaseHTTPMiddleware` for custom middleware unless necessary.

## Langfuse + LangChain async: OpenTelemetry detach noise
- **Mistake**: Backend logs showed `ERROR:opentelemetry.context:Failed to detach context` and Langfuse warnings about non-string metadata when using `get_langfuse_config` with floats/bools.
- **Root cause**: Langfuse’s LangChain `CallbackHandler` enters `propagate_attributes` on chain start and exits on chain end; async LangChain can run those callbacks in different asyncio contexts, so OT `detach` raises `ValueError` (already swallowed by OT, but still logged at ERROR). Langfuse also warns when propagated metadata values are not strings.
- **Rule**: On Langfuse init, add a narrow logging filter for that detach message; stringify caller-supplied metadata values in `get_langfuse_config` (keep `langfuse_*` keys typed as today).
