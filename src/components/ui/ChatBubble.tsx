// Chat bubble (v3): user = rose-tint right; AI = white left with a rose brand avatar.
// Presentational — no hooks, usable in both server and client trees.

type ChatBubbleProps = {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
};

function RippleAvatar() {
  return (
    <div
      aria-hidden
      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white"
    >
      {/* น้องเรสต์ brand mark — simplified squiggle */}
      <svg width="16" height="10" viewBox="0 0 16 10" fill="none" aria-hidden>
        <path
          d="M1 5 C3 1, 5 9, 8 5 S13 1, 15 5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

export function ChatBubble({ role, content, isStreaming }: ChatBubbleProps) {
  const isUser = role === "user";

  return (
    <div className={`flex gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {!isUser && <RippleAvatar />}

      <div
        className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed [animation:fade-up_180ms_ease-out] ${
          isUser
            ? "rounded-tr-sm bg-brand-50 text-ink-900"
            : "rounded-tl-sm border border-border-subtle bg-white text-ink-900 shadow-card"
        }`}
      >
        <p className="whitespace-pre-wrap break-words">
          {content}
          {isStreaming && (
            <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-ink-900/40" />
          )}
        </p>
      </div>
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="flex gap-2">
      <RippleAvatar />
      <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm border border-border-subtle bg-white px-4 py-3 shadow-card">
        {[0, 0.15, 0.3].map((delay, i) => (
          <span
            key={i}
            className="h-2 w-2 rounded-full bg-brand-500"
            style={{ animation: `typing-bounce 1s ${delay}s infinite` }}
          />
        ))}
      </div>
    </div>
  );
}
