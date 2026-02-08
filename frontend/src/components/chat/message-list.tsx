"use client";

import { useEffect, useRef } from "react";
import { MessageItem } from "./message-item";
import { TypingIndicator } from "./typing-indicator";
import { Message } from "@/types/chat";

interface MessageListProps {
  messages: Message[];
  isLoading?: boolean;
}

export const MessageList = ({ messages, isLoading }: MessageListProps) => {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((message) => (
        <MessageItem key={message.id} message={message} />
      ))}

      {isLoading && <TypingIndicator />}
    </div>
  );
};
