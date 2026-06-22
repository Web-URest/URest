"use client";

import { useEffect, useRef, useState } from "react";
import { Menu } from "lucide-react";
import { signOut } from "next-auth/react";

import { Link } from "@/i18n/navigation";
import { Avatar } from "./Avatar";

/**
 * UserMenu — AirBnB account menu (v3): a pill (menu lines + avatar) → dropdown. This is
 * the wired replacement for the old always-visible icon cluster AND the dead hamburger:
 * one menu on all breakpoints. Signed-in shows Trips/Saved/Messages/Profile/Host/Sign-out;
 * signed-out shows Sign-in/Sign-up/Host. Consumers pass translated labels (serializable).
 */
export interface UserMenuLabels {
  menu: string;
  signIn: string;
  signUp: string;
  signOut: string;
  trips: string;
  saved: string;
  messages: string;
  profile: string;
  becomeHost: string;
}

export function UserMenu({
  user,
  labels,
}: {
  user: { name?: string | null; image?: string | null } | null;
  labels: UserMenuLabels;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const itemCls =
    "block rounded-input px-3 py-2 text-sm text-ink-900 transition hover:bg-surface-50";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={labels.menu}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-pill border border-border py-1 pl-3 pr-1 transition duration-150 ease-out hover:shadow-card"
      >
        <Menu size={16} className="text-ink-700" />
        <Avatar name={user?.name} src={user?.image} size="sm" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-modal border border-border-subtle bg-white p-1.5 shadow-overlay"
        >
          {user ? (
            <>
              <Link href="/trips" className={itemCls} onClick={() => setOpen(false)}>
                {labels.trips}
              </Link>
              <Link href="/saved" className={itemCls} onClick={() => setOpen(false)}>
                {labels.saved}
              </Link>
              <Link href="/messages" className={itemCls} onClick={() => setOpen(false)}>
                {labels.messages}
              </Link>
              <Link href="/profile" className={itemCls} onClick={() => setOpen(false)}>
                {labels.profile}
              </Link>
              <div className="my-1 border-t border-border-subtle" />
              <Link href="/listings/new" className={itemCls} onClick={() => setOpen(false)}>
                {labels.becomeHost}
              </Link>
              <button
                type="button"
                onClick={() => signOut({ redirectTo: "/" })}
                className={`${itemCls} w-full text-left`}
              >
                {labels.signOut}
              </button>
            </>
          ) : (
            <>
              <Link
                href="/sign-in"
                className={`${itemCls} font-semibold`}
                onClick={() => setOpen(false)}
              >
                {labels.signIn}
              </Link>
              <Link href="/sign-in" className={itemCls} onClick={() => setOpen(false)}>
                {labels.signUp}
              </Link>
              <div className="my-1 border-t border-border-subtle" />
              <Link href="/listings/new" className={itemCls} onClick={() => setOpen(false)}>
                {labels.becomeHost}
              </Link>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
