import { authHeader } from "./lib/supabase";

export interface PlaceSignal {
  label: string;
  level: "green" | "yellow" | "red";
  detail: string;
}

export interface PlaceProfile {
  matched: boolean;
  placeId?: string;
  name?: string;
  rating?: number;
  userRatingCount?: number;
  formattedAddress?: string;
  internationalPhone?: string;
  website?: string;
  businessStatus?: string;
  categories?: string[];
  primaryCategory?: string;
  googleMapsUri?: string;
  signals: PlaceSignal[];
  overall: "green" | "yellow" | "red";
  summary: string;
}

export interface DataForSeoSnapshot {
  configured: boolean;
  domain?: string;
  organicKeywordCount?: number;
  organicTrafficEstimate?: number;
  paidKeywordCount?: number;
  topKeywords?: Array<{ keyword: string; position: number; searchVolume?: number }>;
  rankSignals?: PlaceSignal[];
}

export interface Recommendation {
  tier: "Basic" | "Growth" | "Premium";
  price: number;
  cadence: string;
  summary: string;
}

export interface AnalyzeResponse {
  lead: {
    businessName?: string;
    website?: string;
    address?: string;
    city?: string;
    state?: string;
  };
  placeProfile: PlaceProfile;
  seoSnapshot: DataForSeoSnapshot;
  recommendation: Recommendation;
  packages: ReadonlyArray<{ tier: string; price: number; cadence: string; summary: string }>;
  narrative: string;
  narrativeSource: "openai" | "fallback";
}

export type HeatLevel = "green" | "yellow" | "red";

export interface HeatCell {
  row: number;
  col: number;
  lat: number;
  lng: number;
  rank: number | null;
  level: HeatLevel;
}

export interface HeatMapResponse {
  configured: boolean;
  status: "ok" | "setup_required" | "needs_location" | "unavailable";
  message: string;
  businessName?: string;
  keyword?: string;
  center?: { lat: number; lng: number };
  gridSize: number;
  stepMiles: number;
  cells: HeatCell[];
  averageRank: number | null;
  topThreeShare: number;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeader()) },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `request_failed_${res.status}`);
  }
  return data;
}

export const api = {
  analyzeLead: (body: {
    businessName?: string;
    website?: string;
    address?: string;
    city?: string;
    state?: string;
    notes?: string;
  }) => postJson<AnalyzeResponse>("/api/analyze-lead", body),

  draftEmail: (body: {
    businessName?: string;
    contactName?: string;
    contactRole?: string;
    website?: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    industry?: string;
    rep?: { name?: string; email?: string };
    insight?: string;
    recommendedTier?: "Basic" | "Growth" | "Premium";
    tone?: "warm" | "direct" | "consultative";
    intent?: "first_touch" | "follow_up" | "proposal_intro" | "discovery_recap";
  }) =>
    postJson<{ subject: string; text: string; source: "openai" | "fallback"; rep: { name: string; email: string } }>(
      "/api/draft-email",
      body,
    ),

  rewrite: (body: { text: string; tone?: string; audience?: string }) =>
    postJson<{ text: string; source: "openai" | "fallback" }>("/api/rewrite", body),

  proposal: (body: {
    businessName?: string;
    contactName?: string;
    contactRole?: string;
    overall?: "green" | "yellow" | "red";
    reviewCount?: number;
    topSignals?: PlaceSignal[];
    recommendedTier?: "Basic" | "Growth" | "Premium";
    goals?: string;
    noWebsite?: boolean;
    rep?: { name?: string; email?: string };
  }) =>
    postJson<{
      proposal: string;
      source: "openai" | "fallback";
      recommendation: Recommendation;
    }>("/api/proposal", body),

  trainingContent: (body: {
    topic: string;
    audience?: "new_rep" | "veteran_rep" | "manager";
    format?: "lesson" | "role_play" | "talk_track" | "objection_handling";
    context?: string;
  }) =>
    postJson<{ content: string; source: "openai" | "fallback"; format: string; audience: string }>(
      "/api/training-content",
      body,
    ),

  heatMap: (body: {
    businessName?: string;
    keyword?: string;
    city?: string;
    state?: string;
    address?: string;
    gridSize?: number;
    stepMiles?: number;
  }) => postJson<HeatMapResponse>("/api/heat-map", body),

  sendEmail: (body: {
    to: string;
    subject: string;
    text: string;
    kind?: "qualification" | "prospect" | "follow_up" | "proposal";
  }) =>
    postJson<{
      kind: string;
      delivery:
        | { status: "sent"; id: string }
        | { status: "queued_local"; reason: string }
        | { status: "error"; reason: string };
    }>("/api/send-email", body),
};
