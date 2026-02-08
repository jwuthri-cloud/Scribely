"use client";

import { Avatar } from "@/components/ui/avatar";

export const TypingIndicator = () => {
  return (
    <div className="flex gap-3">
      <Avatar size="sm" fallback="AI" src="/icons/bot-avatar.png" />

      <div className="flex flex-col">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Assistant
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            typing...
          </span>
        </div>

        <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 py-3">
          <div className="flex space-x-1">
            <div
              className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
              style={{ animationDelay: "0ms" }}
            />
            <div
              className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
              style={{ animationDelay: "150ms" }}
            />
            <div
              className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
              style={{ animationDelay: "300ms" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
