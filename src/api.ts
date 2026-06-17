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
  websiteDomain?: string;
  signals: PlaceSignal[];
  overall: "green" | "yellow" | "red";
  summary: string;
}

export interface DataForSeoSnapshot {
  configured: boolean;
  status: "available" | "unavailable" | "not_configured";
  domain?: string;
  organicKeywordCount?: number;
  organicTrafficEstimate?: number;
  paidKeywordCount?: number;
  topKeywords?: Array<{ keyword: string; position: number; searchVolume?: number }>;
  backlinks?: {
    status: "available" | "unavailable" | "not_requested";
    count?: number;
    referringDomains?: number;
  };
  rankSignals?: PlaceSignal[];
}

export interface WebsiteResolution {
  enteredWebsite?: string;
  enteredDomain?: string;
  verifiedWebsite?: string;
  verifiedDomain?: string;
  usedDomain?: string;
  usedVerified: boolean;
  mismatch: boolean;
  notice?: string;
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
  websiteResolution?: WebsiteResolution;
  recommendation: Recommendation;
  packages: ReadonlyArray<{ tier: string; price: number; cadence: string; summary: string }>;
  narrative: string;
  narrativeSource: "openai" | "fallback";
}

export type HeatLevel = "green" | "blue" | "yellow" | "red";

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
  website?: string;
  keyword?: string;
  competitor?: string;
  center?: { lat: number; lng: number };
  gridSize: number;
  stepMiles: number;
  cells: HeatCell[];
  averageRank: number | null;
  bestRank: number | null;
  worstRank: number | null;
  topThreeShare: number;
  topTenShare: number;
  weakZoneShare: number;
  talkingPoints: string[];
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

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { ...(await authHeader()) } });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `request_failed_${res.status}`);
  }
  return data;
}

export type WebsiteBuildStatus = "requested" | "in_progress" | "ready" | "needs_info" | "cancelled";

export interface WebsiteBuildRequestRecord {
  id: string;
  business_name: string;
  current_website: string | null;
  no_website: boolean;
  contact_name: string | null;
  contact_email: string | null;
  city: string | null;
  state: string | null;
  industry: string | null;
  goals: string | null;
  status: WebsiteBuildStatus;
  preview_url: string | null;
  notes: string | null;
  requested_at: string;
  created_at: string;
  updated_at: string;
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
    city?: string;
    state?: string;
    industry?: string;
    overall?: "green" | "yellow" | "red";
    reviewCount?: number;
    topSignals?: PlaceSignal[];
    recommendedTier?: "Basic" | "Growth" | "Premium";
    goals?: string;
    website?: string;
    noWebsite?: boolean;
    format?: "full" | "intro";
    rep?: { name?: string; email?: string };
  }) =>
    postJson<{
      proposal: string;
      format: "full" | "intro";
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
    website?: string;
    keyword?: string;
    city?: string;
    state?: string;
    address?: string;
    competitor?: string;
    gridSize?: number;
    stepMiles?: number;
  }) => postJson<HeatMapResponse>("/api/heat-map", body),

  sendEmail: (body: {
    to: string;
    subject: string;
    text: string;
    kind?: "qualification" | "prospect" | "follow_up" | "proposal";
    businessName?: string;
    contactName?: string;
  }) =>
    postJson<{
      kind: string;
      delivery:
        | { status: "sent"; id: string }
        | { status: "queued_local"; reason: string }
        | { status: "error"; reason: string };
    }>("/api/send-email", body),

  createWebsiteBuildRequest: (body: {
    businessName?: string;
    currentWebsite?: string;
    noWebsite?: boolean;
    contactName?: string;
    contactEmail?: string;
    city?: string;
    state?: string;
    industry?: string;
    goals?: string;
    leadId?: string;
    prospectId?: string;
  }) =>
    postJson<{ request: WebsiteBuildRequestRecord | null; persisted: boolean; status: WebsiteBuildStatus }>(
      "/api/website-build-request",
      body,
    ),

  listWebsiteBuildRequests: () =>
    getJson<{ requests: WebsiteBuildRequestRecord[] }>("/api/website-build-request"),
};
