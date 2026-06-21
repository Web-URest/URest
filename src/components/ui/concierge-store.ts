"use client";

import { useSyncExternalStore } from "react";

/**
 * concierge-store — tiny external store to open/close the floating concierge from
 * anywhere (Topbar nav, listing "ask about this villa", home/search CTAs) without
 * prop-drilling or URL coupling. Deliberately lives under components/ui/ (NOT
 * lib/concierge/) so the eval-gated AI layer stays diff-free.
 *
 * `openSeq` bumps on every open() so re-opening with a new listingId re-scopes even
 * when the panel is already open (the widget keys ConciergeChat off scope changes).
 */
export interface ConciergeUiState {
  open: boolean;
  scopedListingId?: string;
  openSeq: number;
}

let state: ConciergeUiState = { open: false, openSeq: 0 };
const listeners = new Set<() => void>();

function set(next: Partial<ConciergeUiState>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

export const conciergeUi = {
  open(opts?: { listingId?: string }) {
    set({ open: true, scopedListingId: opts?.listingId, openSeq: state.openSeq + 1 });
  },
  close() {
    set({ open: false });
  },
  toggle() {
    if (state.open) set({ open: false });
    else conciergeUi.open();
  },
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  },
  getSnapshot(): ConciergeUiState {
    return state;
  },
};

export function useConcierge(): ConciergeUiState {
  return useSyncExternalStore(
    conciergeUi.subscribe,
    conciergeUi.getSnapshot,
    conciergeUi.getSnapshot,
  );
}
