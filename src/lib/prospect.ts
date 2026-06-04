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
  /** Prospect has no website yet — MS2GO would build their first one. */
  noWebsite?: boolean;
}

/**
 * The verified company facts an outreach draft is allowed to state. This is the
 * normalized, canonical shape that EmailComposer (and any future draft path)
 * reads from, so there is one source of truth regardless of which upstream
 * module — Lead Lists, Lead Intel, or Analysis — supplied a given field.
 */
export interface ProspectFacts {
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
}

/** A loosely-typed lead analysis result; only the fields we read are required. */
interface AnalysisLike {
  lead?: { businessName?: string; website?: string; address?: string; city?: string; state?: string };
  placeProfile?: {
    website?: string;
    internationalPhone?: string;
    formattedAddress?: string;
    primaryCategory?: string;
  };
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const v of values) {
    const t = v?.trim();
    if (t) return t;
  }
  return undefined;
}

/**
 * Merge the active prospect (source of truth) with an optional analysis result
 * into a single canonical fact set. The selected prospect always wins; analysis
 * only fills in fields the prospect is missing. Nothing is invented — a field
 * absent from both stays undefined so the draft layer can omit it.
 */
export function resolveProspectFacts(
  prospect: ActiveProspect | null | undefined,
  analysis?: AnalysisLike | null,
): ProspectFacts {
  const lead = analysis?.lead;
  const place = analysis?.placeProfile;
  return {
    businessName: firstNonEmpty(prospect?.businessName, lead?.businessName),
    contactName: firstNonEmpty(prospect?.contactName),
    contactEmail: firstNonEmpty(prospect?.contactEmail),
    contactRole: firstNonEmpty(prospect?.contactRole),
    website: firstNonEmpty(prospect?.website, place?.website, lead?.website),
    phone: firstNonEmpty(prospect?.phone, place?.internationalPhone),
    address: firstNonEmpty(prospect?.address, place?.formattedAddress, lead?.address),
    city: firstNonEmpty(prospect?.city, lead?.city),
    state: firstNonEmpty(prospect?.state, lead?.state),
    industry: firstNonEmpty(prospect?.industry, place?.primaryCategory),
  };
}

/**
 * Key facts whose absence should trigger a visible review cue before sending.
 * City is the one Justin reported getting invented, so it's the priority.
 */
export function missingKeyFacts(facts: ProspectFacts): string[] {
  const missing: string[] = [];
  if (!facts.city) missing.push("city");
  if (!facts.state) missing.push("state");
  return missing;
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
