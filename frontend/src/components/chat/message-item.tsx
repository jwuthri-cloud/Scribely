"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { User, Bot, Copy, ThumbsUp, ThumbsDown, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { ChatMessage } from "@/types/chat";

interface MessageItemProps {
  message: ChatMessage;
}

export function MessageItem({ message }: MessageItemProps) {
  const [showActions, setShowActions] = useState(false);
  const [copied, setCopied] = useState(false);

  const isUser = message.role === "user";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex space-x-4 ${isUser ? "justify-end" : "justify-start"}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div
        className={`flex space-x-4 max-w-4xl ${isUser ? "flex-row-reverse space-x-reverse" : ""}`}
      >
        {/* Avatar */}
        <div className={`flex-shrink-0 ${isUser ? "order-2" : "order-1"}`}>
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center ${
              isUser
                ? "bg-gradient-to-br from-blue-500 to-purple-500"
                : "bg-gradient-to-br from-purple-500 to-pink-500"
            }`}
          >
            {isUser ? (
              <User className="w-5 h-5 text-white" />
            ) : (
              <Sparkles className="w-5 h-5 text-white" />
            )}
          </div>
        </div>

        {/* Message Content */}
        <div className={`flex-1 ${isUser ? "order-1" : "order-2"}`}>
          <div
            className={`flex items-center space-x-2 mb-2 ${isUser ? "justify-end" : "justify-start"}`}
          >
            <span className="text-sm font-medium text-white">
              {isUser ? "You" : "AI Assistant"}
            </span>
            <span className="text-xs text-white/40">
              {formatTimestamp(message.timestamp)}
            </span>
          </div>

          <div className={`relative group ${isUser ? "flex justify-end" : ""}`}>
            <div
              className={`
              px-4 py-3 rounded-2xl max-w-3xl
              ${
                isUser
                  ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white"
                  : "bg-gray-800/50 border border-gray-700/50 text-white"
              }
            `}
            >
              {isUser ? (
                <p className="whitespace-pre-wrap">{message.content}</p>
              ) : (
                <div className="prose prose-invert max-w-none">
                  <ReactMarkdown
                    components={{
                      p: ({ children }: any) => (
                        <p className="mb-3 last:mb-0 leading-relaxed">
                          {children}
                        </p>
                      ),
                      h1: ({ children }: any) => (
                        <h1 className="text-xl font-bold mb-3 text-white">
                          {children}
                        </h1>
                      ),
                      h2: ({ children }: any) => (
                        <h2 className="text-lg font-bold mb-2 text-white">
                          {children}
                        </h2>
                      ),
                      h3: ({ children }: any) => (
                        <h3 className="text-md font-bold mb-2 text-white">
                          {children}
                        </h3>
                      ),
                      ul: ({ children }: any) => (
                        <ul className="list-disc list-inside mb-3 space-y-1">
                          {children}
                        </ul>
                      ),
                      ol: ({ children }: any) => (
                        <ol className="list-decimal list-inside mb-3 space-y-1">
                          {children}
                        </ol>
                      ),
                      li: ({ children }: any) => (
                        <li className="text-white/90">{children}</li>
                      ),
                      code: ({ children }: any) => (
                        <code className="bg-gray-900/50 px-2 py-1 rounded text-purple-300 font-mono text-sm">
                          {children}
                        </code>
                      ),
                      pre: ({ children }: any) => (
                        <pre className="bg-gray-900/50 p-4 rounded-lg overflow-x-auto mb-3 border border-gray-700/30">
                          {children}
                        </pre>
                      ),
                      blockquote: ({ children }: any) => (
                        <blockquote className="border-l-4 border-purple-500 pl-4 italic text-white/80 mb-3">
                          {children}
                        </blockquote>
                      ),
                      strong: ({ children }: any) => (
                        <strong className="font-bold text-white">
                          {children}
                        </strong>
                      ),
                      em: ({ children }: any) => (
                        <em className="italic text-white">{children}</em>
                      ),
                      a: ({ href, children }: any) => (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-purple-400 hover:text-purple-300 underline"
                        >
                          {children}
                        </a>
                      ),
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
              )}
            </div>

            {/* Message Actions */}
            {showActions && !isUser && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute -right-12 top-0 flex flex-col space-y-1"
              >
                <button
                  onClick={handleCopy}
                  className="p-2 text-white/40 hover:text-white transition-colors rounded-lg hover:bg-white/10"
                  title="Copy message"
                >
                  {copied ? (
                    <span className="text-xs text-green-400">✓</span>
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>

                <button
                  className="p-2 text-white/40 hover:text-white transition-colors rounded-lg hover:bg-white/10"
                  title="Good response"
                >
                  <ThumbsUp className="w-4 h-4" />
                </button>

                <button
                  className="p-2 text-white/40 hover:text-white transition-colors rounded-lg hover:bg-white/10"
                  title="Poor response"
                >
                  <ThumbsDown className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </div>

          {/* Typing indicator for assistant messages */}
          {!isUser && message.content === "..." && (
            <div className="flex items-center space-x-2 mt-2">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce"></div>
                <div
                  className="w-2 h-2 bg-pink-500 rounded-full animate-bounce"
                  style={{ animationDelay: "0.1s" }}
                ></div>
                <div
                  className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                  style={{ animationDelay: "0.2s" }}
                ></div>
              </div>
              <span className="text-xs text-white/60">AI is thinking...</span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
