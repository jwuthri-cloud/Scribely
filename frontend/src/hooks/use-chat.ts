"use client";

import { useState, useCallback, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { createApiClient, ChatResponse } from "@/lib/api";

/**
 * Message role in the conversation
 */
export type MessageRole = "user" | "assistant" | "system";

/**
 * Message structure for chat
 */
export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: Date;
  model?: string;
  isStreaming?: boolean;
  error?: string;
}

/**
 * Options for the useChat hook
 */
export interface UseChatOptions {
  /** Initial messages to populate the chat */
  initialMessages?: Message[];
  /** Model to use for chat */
  model?: string;
  /** Temperature for generation */
  temperature?: number;
  /** Callback when a message is sent */
  onSend?: (message: Message) => void;
  /** Callback when a response is received */
  onResponse?: (message: Message) => void;
  /** Callback when an error occurs */
  onError?: (error: Error) => void;
  /** Session ID for conversation tracking */
  sessionId?: string;
}

/**
 * Return type for the useChat hook
 */
export interface UseChatReturn {
  /** Array of messages in the conversation */
  messages: Message[];
  /** Send a message and get a response */
  sendMessage: (content: string) => Promise<void>;
  /** Whether a message is currently being sent/received */
  isLoading: boolean;
  /** Current error, if any */
  error: Error | null;
  /** Clear all messages */
  clearMessages: () => void;
  /** Set messages manually */
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  /** Abort the current request */
  abort: () => void;
  /** Retry the last failed message */
  retry: () => Promise<void>;
}

/**
 * Generate a unique ID for messages
 */
function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Custom hook for managing chat state and API interactions.
 *
 * Features:
 * - Automatic authentication with Clerk
 * - Message history management
 * - Loading and error states
 * - Retry functionality
 * - Abort in-flight requests
 *
 * @param options - Configuration options for the chat
 * @returns Chat state and methods
 *
 * @example
 * ```tsx
 * const { messages, sendMessage, isLoading, error } = useChat({
 *   model: 'openai/gpt-4o-mini',
 *   onError: (err) => console.error(err)
 * });
 *
 * await sendMessage("Hello, how are you?");
 * ```
 */
export function useChat(options: UseChatOptions = {}): UseChatReturn {
  const {
    initialMessages = [],
    model = "openai/gpt-4o-mini",
    temperature = 0.7,
    onSend,
    onResponse,
    onError,
  } = options;

  const { getToken } = useAuth();

  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Keep track of the last user message for retry functionality
  const lastUserMessageRef = useRef<string | null>(null);

  // AbortController for cancelling requests
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Send a message and get an AI response
   */
  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) return;

      // Clear any previous errors
      setError(null);

      // Store for retry functionality
      lastUserMessageRef.current = content;

      // Create user message
      const userMessage: Message = {
        id: generateId(),
        role: "user",
        content: content.trim(),
        createdAt: new Date(),
      };

      // Add user message to state
      setMessages((prev) => [...prev, userMessage]);
      onSend?.(userMessage);

      // Create abort controller for this request
      abortControllerRef.current = new AbortController();

      setIsLoading(true);

      try {
        // Get auth token
        const token = await getToken();

        // Create authenticated API client
        const apiClient = createApiClient(token);

        // Make API call
        const response: ChatResponse = await apiClient.chat(
          content,
          model,
          temperature
        );

        // Create assistant message
        const assistantMessage: Message = {
          id: generateId(),
          role: "assistant",
          content: response.response,
          createdAt: new Date(),
          model: response.model_used,
        };

        // Add assistant message to state
        setMessages((prev) => [...prev, assistantMessage]);
        onResponse?.(assistantMessage);
      } catch (err) {
        // Handle abort
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }

        const error = err instanceof Error ? err : new Error("Unknown error occurred");
        setError(error);
        onError?.(error);

        // Add error message to conversation
        const errorMessage: Message = {
          id: generateId(),
          role: "assistant",
          content: "Sorry, I encountered an error processing your request. Please try again.",
          createdAt: new Date(),
          error: error.message,
        };

        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [getToken, model, temperature, onSend, onResponse, onError]
  );

  /**
   * Clear all messages
   */
  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
    lastUserMessageRef.current = null;
  }, []);

  /**
   * Abort the current request
   */
  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }, []);

  /**
   * Retry the last failed message
   */
  const retry = useCallback(async () => {
    if (lastUserMessageRef.current) {
      // Remove the last two messages (user message and error response)
      setMessages((prev) => prev.slice(0, -2));

      // Resend the message
      await sendMessage(lastUserMessageRef.current);
    }
  }, [sendMessage]);

  return {
    messages,
    sendMessage,
    isLoading,
    error,
    clearMessages,
    setMessages,
    abort,
    retry,
  };
}

export default useChat;
