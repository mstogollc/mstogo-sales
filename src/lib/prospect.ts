import { useSyncExternalStore } from "react";

/**
 * The "active prospect" is the lead a rep has selected to work. It is shared
 * across the Lead Lists, Lead Intel, Proposal, and Outreach modules so that
 * selecting a business in one step carries every useful field into the next.
 *
 * State is mirrored to sessionStorage so it survives in-app navigation and a
 * full page reload during the same browser session.
 */
export interface ActiveProspect {
  businessName?: string;
  contactName?: string;
  contactEmail?: string;
  contactRole?: string;
  website?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  industry?: string;
  linkedinUrl?: string;
}

const STORAGE_KEY = "ms2go.activeProspect";

function read(): ActiveProspect | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ActiveProspect) : null;
  } catch {
    return null;
  }
}

let current: ActiveProspect | null = read();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function setActiveProspect(next: ActiveProspect | null) {
  current = next;
  if (typeof window !== "undefined") {
    try {
      if (next) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* sessionStorage may be unavailable (private mode); in-memory still works */
    }
  }
  emit();
}

/** Merge new fields into the active prospect without dropping existing ones. */
export function updateActiveProspect(patch: Partial<ActiveProspect>) {
  setActiveProspect({ ...(current ?? {}), ...patch });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ActiveProspect | null {
  return current;
}

export function useActiveProspect(): ActiveProspect | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
