"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChatBubble, TypingIndicator } from "@/components/ui/ChatBubble";

type Message = {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
};

type SSEEvent =
  | { type: "session_id"; sessionId: string }
  | { type: "text_delta"; delta: string }
  | { type: "tool_call"; name: string }
  | { type: "done" }
  | { type: "error"; message: string };

const EXAMPLE_PROMPTS = [
  "examplePrompt1",
  "examplePrompt2",
  "examplePrompt3",
] as const;

type Props = { scopedListingId?: string };

export function ConciergeChat({ scopedListingId }: Props) {
  const t = useTranslations("Concierge");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Initial greeting
  useEffect(() => {
    setMessages([{ role: "assistant", content: t("greeting") }]);
  }, [t]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    setInput("");
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setIsLoading(true);

    // Add streaming placeholder
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "", isStreaming: true },
    ]);

    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/concierge/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, sessionId, scopedListingId }),
        signal: abortRef.current.signal,
      });

      if (!res.body) throw new Error("NO_BODY");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let event: SSEEvent;
          try {
            event = JSON.parse(raw) as SSEEvent;
          } catch {
            continue;
          }

          if (event.type === "session_id") {
            setSessionId(event.sessionId);
          } else if (event.type === "text_delta") {
            streamText += event.delta;
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === "assistant") {
                next[next.length - 1] = {
                  ...last,
                  content: streamText,
                  isStreaming: true,
                };
              }
              return next;
            });
          } else if (event.type === "done") {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === "assistant") {
                next[next.length - 1] = { ...last, isStreaming: false };
              }
              return next;
            });
          } else if (event.type === "error") {
            const key = event.message;
            const errorText =
              key === "DAILY_LIMIT"
                ? t("errorDailyLimit", { limit: 30 })
                : key === "TOKEN_CEILING"
                  ? t("errorTokenCeiling")
                  : t("errorGeneric");
            setError(errorText);
            // Remove streaming placeholder
            setMessages((prev) =>
              prev.filter((m) => !(m.role === "assistant" && m.isStreaming)),
            );
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(t("errorGeneric"));
      setMessages((prev) =>
        prev.filter((m) => !(m.role === "assistant" && m.isStreaming)),
      );
    } finally {
      setIsLoading(false);
      abortRef.current = null;
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  }

  const showExamples = messages.length <= 1 && !isLoading;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          {messages.map((msg, i) => (
            <ChatBubble
              key={i}
              role={msg.role}
              content={msg.content}
              isStreaming={msg.isStreaming}
            />
          ))}

          {isLoading && !messages.some((m) => m.isStreaming) && (
            <TypingIndicator />
          )}

          {/* Example prompts (first-open state) */}
          {showExamples && (
            <div className="mt-2 flex flex-col gap-2">
              {EXAMPLE_PROMPTS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => void sendMessage(t(key))}
                  className="rounded-xl border border-line bg-white px-4 py-2.5 text-left text-sm text-ink-900 transition hover:bg-sand-100"
                >
                  {t(key)}
                </button>
              ))}
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div role="alert" className="rounded-xl bg-coral-500/10 px-4 py-3 text-sm text-coral-500">
              {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input bar */}
      <div className="border-t border-line bg-white px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("inputPlaceholder")}
            disabled={isLoading}
            className="flex-1 resize-none rounded-2xl border border-line bg-sand-100 px-4 py-3 text-sm text-ink-900 outline-none focus:ring-2 focus:ring-aqua-500 disabled:opacity-50"
            style={{ maxHeight: "120px" }}
          />
          <button
            type="button"
            onClick={() => void sendMessage(input)}
            disabled={!input.trim() || isLoading}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-aqua-500 text-ink-900 transition hover:brightness-95 disabled:pointer-events-none disabled:opacity-40"
            aria-label={t("sendButton")}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden
            >
              <path
                d="M14 8L2 2l2.5 6L2 14l12-6z"
                fill="currentColor"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
