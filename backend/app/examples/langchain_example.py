"""
Example use case: Simple LangChain pipeline with OpenRouter.

This example demonstrates:
1. Setting up OpenRouter provider
2. Creating a LangChain chain
3. Token counting
4. Model information retrieval
"""

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

from app.infrastructure.llm_provider import OpenRouterProvider
from app.utils.logging import get_logger
from app.utils.token_counter import (
    count_tokens_llm,
    get_model_limits,
    calculate_safe_context_limit,
)

logger = get_logger("langchain_example")


def simple_chat_example():
    """Simple chat example using LangChain with OpenRouter."""
    # Initialize provider
    provider = OpenRouterProvider()
    
    # Get LLM instance
    llm = provider.get_llm(
        model_name="openai/gpt-4o-mini",
        temperature=0.7
    )
    
    # Create a simple prompt
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are a helpful assistant."),
        ("user", "{input}")
    ])
    
    # Create chain
    chain = prompt | llm | StrOutputParser()
    
    # Invoke chain
    response = chain.invoke({"input": "What is 2+2?"})
    
    logger.info(f"Response: {response}")
    return response


def token_counting_example():
    """Example of token counting."""
    provider = OpenRouterProvider()
    llm = provider.get_llm(model_name="openai/gpt-4o-mini")
    
    text = "Hello, how are you today?"
    token_count = count_tokens_llm(llm, text)
    
    logger.info(f"Text: {text}")
    logger.info(f"Token count: {token_count}")
    return token_count


def model_info_example():
    """Example of getting model information."""
    provider = OpenRouterProvider()
    
    model_name = "openai/gpt-4o-mini"
    
    # Get model limits
    limits = get_model_limits(provider, model_name)
    logger.info(f"Model: {model_name}")
    logger.info(f"Context length: {limits['context_length']}")
    logger.info(f"Max completion: {limits['max_completion_tokens']}")
    
    # Calculate safe context limit
    if limits['context_length']:
        safe_limit = calculate_safe_context_limit(limits['context_length'], buffer_percent=0.1)
        logger.info(f"Safe context limit (10% buffer): {safe_limit}")
    
    return limits


def conversation_example():
    """Example of a multi-turn conversation."""
    provider = OpenRouterProvider()
    llm = provider.get_llm(model_name="openai/gpt-4o-mini", temperature=0.7)
    
    # Create prompt template
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are a helpful assistant. Keep responses concise."),
        ("user", "{input}")
    ])
    
    chain = prompt | llm | StrOutputParser()
    
    # Simulate conversation
    conversation = [
        "What is Python?",
        "Can you give me a simple example?",
        "What are the benefits?"
    ]
    
    responses = []
    for turn in conversation:
        response = chain.invoke({"input": turn})
        responses.append(response)
        logger.info(f"User: {turn}")
        logger.info(f"Assistant: {response}\n")
    
    return responses


def streaming_example():
    """Example of streaming responses."""
    provider = OpenRouterProvider()
    llm = provider.get_llm(model_name="openai/gpt-4o-mini", temperature=0.7)
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are a helpful assistant."),
        ("user", "Write a short story about a robot.")
    ])
    
    chain = prompt | llm | StrOutputParser()
    
    # Stream response
    logger.info("Streaming response:")
    for chunk in chain.stream({}):
        print(chunk, end="", flush=True)
    print("\n")


if __name__ == "__main__":
    logger.info("=== Simple Chat Example ===")
    simple_chat_example()
    
    logger.info("\n=== Token Counting Example ===")
    token_counting_example()
    
    logger.info("\n=== Model Info Example ===")
    model_info_example()
    
    logger.info("\n=== Conversation Example ===")
    conversation_example()
    
    logger.info("\n=== Streaming Example ===")
    streaming_example()
