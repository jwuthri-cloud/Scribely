"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/loading";

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onKeyPress: (e: React.KeyboardEvent) => void;
  isLoading?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

export const MessageInput = ({
  value,
  onChange,
  onSend,
  onKeyPress,
  isLoading = false,
  placeholder = "Type a message...",
  disabled = false,
}: MessageInputProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [rows, setRows] = useState(1);

  useEffect(() => {
    if (textareaRef.current) {
      const textarea = textareaRef.current;
      const lineHeight = 24; // Approximate line height
      const padding = 16; // Top and bottom padding
      const maxRows = 6;

      // Reset height to measure scrollHeight
      textarea.style.height = "auto";
      const newRows = Math.min(
        Math.max(1, Math.ceil((textarea.scrollHeight - padding) / lineHeight)),
        maxRows,
      );
      setRows(newRows);
    }
  }, [value]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || isLoading || disabled) return;
    onSend();
  };

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <form onSubmit={handleSubmit} className="flex items-end gap-2 p-4">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyPress={onKeyPress}
            rows={rows}
            disabled={disabled || isLoading}
            placeholder={placeholder}
            className="w-full resize-none border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ maxHeight: "144px" }} // 6 lines max
          />

          {/* Character count for long messages */}
          {value.length > 500 && (
            <div className="absolute bottom-1 right-1 text-xs text-gray-400">
              {value.length}/2000
            </div>
          )}
        </div>

        <Button
          type="submit"
          disabled={!value.trim() || isLoading || disabled}
          className="shrink-0"
          size="md"
        >
          {isLoading ? (
            <Spinner size="sm" />
          ) : (
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          )}
        </Button>
      </form>

      {/* Input hints */}
      <div className="px-4 pb-2">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Press Enter to send, Shift + Enter for new line
        </p>
      </div>
    </div>
  );
};
