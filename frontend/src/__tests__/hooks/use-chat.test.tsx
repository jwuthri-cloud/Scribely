/**
 * Unit tests for the useChat hook.
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { useChat, Message } from "@/hooks/use-chat";

// Mock Clerk's useAuth hook
const mockGetToken = jest.fn();
jest.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    getToken: mockGetToken,
  }),
}));

// Mock the API client
const mockChat = jest.fn();
jest.mock("@/lib/api", () => ({
  createApiClient: () => ({
    chat: mockChat,
  }),
}));

describe("useChat", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetToken.mockResolvedValue("mock-token");
  });

  describe("initialization", () => {
    it("should initialize with empty messages by default", () => {
      const { result } = renderHook(() => useChat());

      expect(result.current.messages).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it("should initialize with provided initial messages", () => {
      const initialMessages: Message[] = [
        {
          id: "1",
          role: "user",
          content: "Hello",
          createdAt: new Date(),
        },
      ];

      const { result } = renderHook(() =>
        useChat({ initialMessages })
      );

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].content).toBe("Hello");
    });
  });

  describe("sendMessage", () => {
    it("should add user message and get assistant response", async () => {
      mockChat.mockResolvedValue({
        response: "Hello! How can I help you?",
        model_used: "openai/gpt-4o-mini",
      });

      const { result } = renderHook(() => useChat());

      await act(async () => {
        await result.current.sendMessage("Hi there");
      });

      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[0].role).toBe("user");
      expect(result.current.messages[0].content).toBe("Hi there");
      expect(result.current.messages[1].role).toBe("assistant");
      expect(result.current.messages[1].content).toBe("Hello! How can I help you?");
    });

    it("should set isLoading to true while sending", async () => {
      let resolveChat: (value: unknown) => void;
      mockChat.mockReturnValue(
        new Promise((resolve) => {
          resolveChat = resolve;
        })
      );

      const { result } = renderHook(() => useChat());

      act(() => {
        result.current.sendMessage("Test message");
      });

      // Should be loading immediately after send
      expect(result.current.isLoading).toBe(true);

      // Resolve the promise
      await act(async () => {
        resolveChat!({
          response: "Response",
          model_used: "test-model",
        });
      });

      // Should not be loading after response
      expect(result.current.isLoading).toBe(false);
    });

    it("should not send empty messages", async () => {
      const { result } = renderHook(() => useChat());

      await act(async () => {
        await result.current.sendMessage("");
        await result.current.sendMessage("   ");
      });

      expect(result.current.messages).toHaveLength(0);
      expect(mockChat).not.toHaveBeenCalled();
    });

    it("should handle API errors gracefully", async () => {
      const testError = new Error("API Error");
      mockChat.mockRejectedValue(testError);

      const onError = jest.fn();
      const { result } = renderHook(() => useChat({ onError }));

      await act(async () => {
        await result.current.sendMessage("Test");
      });

      expect(result.current.error).toBe(testError);
      expect(onError).toHaveBeenCalledWith(testError);
      // Should have user message and error message
      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[1].error).toBe("API Error");
    });

    it("should call callbacks on send and response", async () => {
      mockChat.mockResolvedValue({
        response: "Response",
        model_used: "test-model",
      });

      const onSend = jest.fn();
      const onResponse = jest.fn();

      const { result } = renderHook(() =>
        useChat({ onSend, onResponse })
      );

      await act(async () => {
        await result.current.sendMessage("Hello");
      });

      expect(onSend).toHaveBeenCalledTimes(1);
      expect(onSend).toHaveBeenCalledWith(
        expect.objectContaining({
          role: "user",
          content: "Hello",
        })
      );

      expect(onResponse).toHaveBeenCalledTimes(1);
      expect(onResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          role: "assistant",
          content: "Response",
        })
      );
    });
  });

  describe("clearMessages", () => {
    it("should clear all messages", async () => {
      mockChat.mockResolvedValue({
        response: "Response",
        model_used: "test-model",
      });

      const { result } = renderHook(() => useChat());

      await act(async () => {
        await result.current.sendMessage("Hello");
      });

      expect(result.current.messages).toHaveLength(2);

      act(() => {
        result.current.clearMessages();
      });

      expect(result.current.messages).toHaveLength(0);
      expect(result.current.error).toBeNull();
    });
  });

  describe("retry", () => {
    it("should retry the last failed message", async () => {
      // First call fails, second succeeds
      mockChat
        .mockRejectedValueOnce(new Error("API Error"))
        .mockResolvedValueOnce({
          response: "Success!",
          model_used: "test-model",
        });

      const { result } = renderHook(() => useChat());

      // Send message that fails
      await act(async () => {
        await result.current.sendMessage("Hello");
      });

      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[1].error).toBeDefined();

      // Retry
      await act(async () => {
        await result.current.retry();
      });

      // Should have user message and successful assistant response
      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[1].error).toBeUndefined();
      expect(result.current.messages[1].content).toBe("Success!");
    });
  });

  describe("setMessages", () => {
    it("should allow manually setting messages", () => {
      const { result } = renderHook(() => useChat());

      const newMessages: Message[] = [
        {
          id: "custom-1",
          role: "system",
          content: "You are a helpful assistant",
          createdAt: new Date(),
        },
      ];

      act(() => {
        result.current.setMessages(newMessages);
      });

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].role).toBe("system");
    });
  });

  describe("configuration", () => {
    it("should use provided model and temperature", async () => {
      mockChat.mockResolvedValue({
        response: "Response",
        model_used: "anthropic/claude-3",
      });

      const { result } = renderHook(() =>
        useChat({
          model: "anthropic/claude-3",
          temperature: 0.5,
        })
      );

      await act(async () => {
        await result.current.sendMessage("Test");
      });

      expect(mockChat).toHaveBeenCalledWith(
        "Test",
        "anthropic/claude-3",
        0.5
      );
    });
  });
});
