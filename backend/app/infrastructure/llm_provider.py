"""LLM provider integrations using LangChain."""
import os
from typing import Any, Dict, List, Optional

import httpx
import requests
from langchain_core.embeddings import Embeddings
from langchain_openai import ChatOpenAI

from app.config import get_settings
from app.infrastructure.langfuse_handler import get_langfuse_callbacks
from app.utils.logging import get_logger

logger = get_logger("llm_provider")


class OpenRouterProvider:
    """OpenRouter LLM provider integration with model querying capabilities."""
    
    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize OpenRouter provider.
        
        Args:
            api_key: OpenRouter API key (defaults to OPENROUTER_API_KEY from settings)
        """
        settings = get_settings()
        self.api_key = api_key or settings.openrouter_api_key
        if not self.api_key:
            raise ValueError(
                "OPENROUTER_API_KEY not set. Please set the OPENROUTER_API_KEY environment variable."
            )
        self._base_url = "https://openrouter.ai/api/v1"
        self._models_cache: Optional[List[Dict[str, Any]]] = None
    
    def get_llm(
        self,
        model_name: str = "openai/gpt-4o-mini",
        temperature: float = 0,
        callbacks: Optional[List] = None,
        fallback_models: Optional[List[str]] = None,
        provider_config: Optional[Dict[str, Any]] = None,
        enable_langfuse: bool = True,
    ) -> ChatOpenAI:
        """
        Get configured OpenRouter LLM instance.
        
        Args:
            model_name: OpenRouter model name (e.g., "openai/gpt-4o-mini")
            temperature: Model temperature (0-2)
            callbacks: Optional list of callback handlers (Langfuse is added automatically if enabled)
            fallback_models: Optional list of fallback model names. If provided, OpenRouter
                will automatically try these models if the primary model fails.
            provider_config: Optional provider routing configuration dict with keys:
                - order: List of provider names to prioritize
                - allow_fallbacks: Whether to allow provider fallbacks (default: True)
                - require_parameters: Only use providers supporting all parameters (default: False)
                - sort: Sort providers by "price", "latency", or "throughput"
                - only: List of provider names to restrict to
                - ignore: List of provider names to exclude
            enable_langfuse: If True (default), automatically add Langfuse callback if enabled in settings
        
        Returns:
            Configured ChatOpenAI instance for OpenRouter
        
        Example:
            ```python
            # With fallback models (Langfuse automatically enabled if configured)
            llm = provider.get_llm(
                model_name="anthropic/claude-3.5-sonnet",
                fallback_models=["openai/gpt-4o-mini", "gryphe/mythomax-l2-13b"]
            )
            
            # With provider routing
            llm = provider.get_llm(
                model_name="mistralai/mixtral-8x7b-instruct",
                provider_config={
                    "order": ["openai", "together"],
                    "allow_fallbacks": True
                }
            )
            
            # Disable Langfuse for this specific call
            llm = provider.get_llm(
                model_name="openai/gpt-4o-mini",
                enable_langfuse=False
            )
            ```
        """
        extra_body = {}
        
        # Add fallback models if provided
        if fallback_models:
            extra_body["models"] = fallback_models
            logger.debug(f"Configured fallback models: {fallback_models}")
        
        # Add provider configuration if provided
        if provider_config:
            extra_body["provider"] = provider_config
            logger.debug(f"Configured provider routing: {provider_config}")
        
        # Automatically add Langfuse callbacks if enabled
        final_callbacks = callbacks
        if enable_langfuse:
            final_callbacks = get_langfuse_callbacks(callbacks)
        
        return ChatOpenAI(
            model=model_name,
            api_key=self.api_key,
            base_url=f"{self._base_url}",
            temperature=temperature,
            callbacks=final_callbacks,
            extra_body=extra_body if extra_body else None,
        )
    
    def get_llm_with_fallbacks(
        self,
        models: List[str],
        temperature: float = 0,
        callbacks: Optional[List] = None,
        provider_config: Optional[Dict[str, Any]] = None,
        enable_langfuse: bool = True,
    ) -> ChatOpenAI:
        """
        Get configured OpenRouter LLM instance with model fallbacks.
        
        The first model in the list is the primary model. If it fails, OpenRouter
        will automatically try the next model in the list.
        
        Args:
            models: List of model names in priority order (e.g., 
                ["anthropic/claude-3.5-sonnet", "openai/gpt-4o-mini"])
            temperature: Model temperature (0-2)
            callbacks: Optional list of callback handlers
            provider_config: Optional provider routing configuration (see get_llm for details)
        
        Returns:
            Configured ChatOpenAI instance for OpenRouter with fallbacks
        
        Raises:
            ValueError: If models list is empty
        
        Example:
            ```python
            llm = provider.get_llm_with_fallbacks([
                "anthropic/claude-3.5-sonnet",
                "openai/gpt-4o-mini",
                "gryphe/mythomax-l2-13b"
            ])
            ```
        """
        if not models:
            raise ValueError("At least one model must be provided")
        
        primary_model = models[0]
        fallback_models = models[1:] if len(models) > 1 else None
        
        return self.get_llm(
            model_name=primary_model,
            temperature=temperature,
            callbacks=callbacks,
            fallback_models=fallback_models,
            provider_config=provider_config,
            enable_langfuse=enable_langfuse,
        )
    
    def get_models(self, use_cache: bool = True) -> List[Dict[str, Any]]:
        """
        Get list of available models from OpenRouter.
        
        Args:
            use_cache: Whether to use cached models if available
        
        Returns:
            List of model dictionaries with id, context_length, pricing, etc.
        
        Raises:
            requests.RequestException: If the API request fails
        """
        if use_cache and self._models_cache is not None:
            return self._models_cache
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        
        try:
            response = requests.get(
                f"{self._base_url}/models",
                headers=headers,
                timeout=10
            )
            response.raise_for_status()
            models = response.json().get("data", [])
            logger.info(f"Fetched {len(models)} available models from OpenRouter")
            self._models_cache = models
            return models
        except requests.RequestException as e:
            logger.error(f"Failed to fetch OpenRouter models: {e}")
            raise
    
    def get_balance(self) -> Dict[str, Any]:
        """
        Get OpenRouter account balance/credits.
        
        Returns:
            Dictionary with balance information
        
        Raises:
            requests.RequestException: If the API request fails
        """
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        
        try:
            response = requests.get(
                f"{self._base_url}/auth/key",
                headers=headers,
                timeout=10
            )
            response.raise_for_status()
            balance = response.json()
            logger.info(f"OpenRouter balance: ${balance.get('balance', 0):.2f}")
            return balance
        except requests.RequestException as e:
            logger.error(f"Failed to fetch OpenRouter balance: {e}")
            raise
    
    @staticmethod
    def get_provider_from_id(model_id: str) -> Optional[str]:
        """Extract provider name from model ID (e.g., 'openai/gpt-4' -> 'openai')."""
        if "/" in model_id:
            return model_id.split("/")[0]
        return None
    
    def get_model_context_limit(
        self,
        model_name: str,
        use_cache: bool = True
    ) -> Optional[int]:
        """
        Get model context limit from OpenRouter models cache.
        
        Args:
            model_name: Model name (e.g., "openai/gpt-4o-mini")
            use_cache: Whether to use cached models
        
        Returns:
            Context limit if found, None otherwise
        """
        try:
            models = self.get_models(use_cache=use_cache)
            for model in models:
                if model.get('id') == model_name:
                    top_provider = model.get('top_provider', {})
                    if isinstance(top_provider, dict):
                        context_length = top_provider.get('context_length')
                        if context_length:
                            return int(context_length)
            logger.warning(f"Model {model_name} not found in OpenRouter models")
            return None
        except Exception as e:
            logger.error(f"Failed to get model context limit: {e}")
            return None
    
    def get_model_max_completion(
        self,
        model_name: str,
        use_cache: bool = True
    ) -> Optional[int]:
        """
        Get model max completion tokens from OpenRouter models cache.
        
        Args:
            model_name: Model name (e.g., "openai/gpt-4o-mini")
            use_cache: Whether to use cached models
        
        Returns:
            Max completion tokens if found, None otherwise
        """
        try:
            models = self.get_models(use_cache=use_cache)
            for model in models:
                if model.get('id') == model_name:
                    top_provider = model.get('top_provider', {})
                    if isinstance(top_provider, dict):
                        max_completion = top_provider.get('max_completion_tokens')
                        if max_completion:
                            return int(max_completion)
            logger.warning(f"Model {model_name} not found in OpenRouter models")
            return None
        except Exception as e:
            logger.error(f"Failed to get model max completion: {e}")
            return None


class OpenRouterEmbeddings(Embeddings):
    """OpenRouter embeddings implementation using direct HTTP requests."""

    def __init__(self, api_key: Optional[str] = None, model: str = "openai/text-embedding-3-small"):
        """
        Initialize OpenRouter embeddings.

        Args:
            api_key: OpenRouter API key (defaults to OPENROUTER_API_KEY from settings)
            model: Model name (e.g., "openai/text-embedding-3-small")
        """
        settings = get_settings()
        self.api_key = api_key or settings.openrouter_api_key
        if not self.api_key:
            raise ValueError(
                "OPENROUTER_API_KEY not set. Please set the OPENROUTER_API_KEY environment variable."
            )
        self.model = model
        self.base_url = "https://openrouter.ai/api/v1/embeddings"
        self.app_name = settings.app_name
        self.app_url = os.environ.get("APP_URL", "")

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embeddings for multiple documents.

        Args:
            texts: List of texts to embed

        Returns:
            List of embedding vectors

        Raises:
            Exception: If API request fails
        """
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        
        # Add optional headers if configured
        if self.app_url:
            headers["HTTP-Referer"] = self.app_url
        if self.app_name:
            headers["X-Title"] = self.app_name
        
        response = requests.post(
            self.base_url,
            headers=headers,
            json={"model": self.model, "input": texts},
            timeout=30,
        )

        if response.status_code != 200:
            raise Exception(f"API request failed: {response.status_code} - {response.text}")

        data = response.json()
        return [item["embedding"] for item in data["data"]]

    def embed_query(self, text: str) -> List[float]:
        """
        Generate embedding for a single query.

        Args:
            text: Text to embed

        Returns:
            Embedding vector
        """
        return self.embed_documents([text])[0]

    async def aembed_documents(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embeddings for multiple documents asynchronously.

        Args:
            texts: List of texts to embed

        Returns:
            List of embedding vectors

        Raises:
            Exception: If API request fails
        """
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        
        # Add optional headers if configured
        if self.app_url:
            headers["HTTP-Referer"] = self.app_url
        if self.app_name:
            headers["X-Title"] = self.app_name
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                self.base_url,
                headers=headers,
                json={"model": self.model, "input": texts},
            )

            if response.status_code != 200:
                raise Exception(f"API request failed: {response.status_code} - {response.text}")

            data = response.json()
            return [item["embedding"] for item in data["data"]]

    async def aembed_query(self, text: str) -> List[float]:
        """
        Generate embedding for a single query asynchronously.

        Args:
            text: Text to embed

        Returns:
            Embedding vector
        """
        return (await self.aembed_documents([text]))[0]
