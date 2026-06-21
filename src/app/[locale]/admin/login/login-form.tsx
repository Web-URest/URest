"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";

import { loginAction } from "../actions";

export function AdminLoginForm() {
  const t = useTranslations("Admin");
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(false);
    startTransition(async () => {
      // On success the action redirects server-side (throws NEXT_REDIRECT,
      // handled by Next) — only the failure path returns here.
      const result = await loginAction(locale, email, password, token);
      if (!result.ok) setError(true); // generic — never reveal which factor failed
    });
  }

  const field =
    "rounded-xl border border-border bg-surface-100 px-4 py-3 text-ink-900 placeholder:text-ink-700/50 outline-none focus:ring-2 focus:ring-aqua-500";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-4"
    >
      <label className="flex flex-col gap-1">
        <span className="text-sm text-ink-700">{t("email")}</span>
        <input
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-ink-700">{t("password")}</span>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-ink-700">{t("totp")}</span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={token}
          onChange={(e) => setToken(e.target.value.replace(/\D/g, ""))}
          className={`${field} tracking-[0.3em]`}
        />
      </label>

      {error && <p className="text-sm font-semibold text-ink-900">{t("loginError")}</p>}

      <button
        type="submit"
        disabled={pending || !email || !password || token.length !== 6}
        className="mt-2 rounded-full bg-aqua-500 px-6 py-3 font-semibold text-ink-900 transition hover:brightness-95 disabled:pointer-events-none disabled:opacity-50"
      >
        {t("submit")}
      </button>
    </form>
  );
}
