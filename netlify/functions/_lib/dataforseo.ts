import { getEnv } from "./env";

// "available" — the live API answered for the verified domain (zeros here are
//   real and safe to show).
// "unavailable" — we could not get a trustworthy answer (missing creds, API
//   error, subscription denied, no domain). We must NOT render this as zero.
// "not_configured" — DataForSEO creds are absent in this environment.
export type SeoDataStatus = "available" | "unavailable" | "not_configured";

// Backlink data sits behind a separate DataForSEO subscription. When that
// subscription is denied we surface "unavailable", never "zero backlinks".
export type BacklinkDataStatus = "available" | "unavailable" | "not_requested";

export interface DataForSeoSnapshot {
  configured: boolean;
  /** Whether organic/keyword metrics are trustworthy. */
  status: SeoDataStatus;
  /** The domain actually queried (post-normalization). */
  domain?: string;
  organicKeywordCount?: number;
  organicTrafficEstimate?: number;
  paidKeywordCount?: number;
  topKeywords?: Array<{ keyword: string; position: number; searchVolume?: number }>;
  backlinks?: {
    status: BacklinkDataStatus;
    count?: number;
    referringDomains?: number;
    /** Internal/admin only — why backlinks are unavailable. */
    detail?: string;
  };
  rankSignals?: {
    label: string;
    level: "green" | "yellow" | "red";
    detail: string;
  }[];
  /** Internal/admin metadata. Not for prospect-facing copy. */
  source: string;
  fetchedAt: string;
  /** Internal/admin only. */
  rawError?: string;
}

interface DfsResponse<T> {
  status_code?: number;
  status_message?: string;
  tasks?: Array<{
    status_code?: number;
    status_message?: string;
    result?: T[];
  }>;
}

interface DomainOverviewResult {
  target?: string;
  metrics?: {
    organic?: {
      count?: number;
      etv?: number;
    };
    paid?: {
      count?: number;
    };
  };
  items?: Array<{
    keyword_data?: {
      keyword?: string;
      keyword_info?: {
        search_volume?: number;
      };
    };
    ranked_serp_element?: {
      serp_item?: {
        rank_absolute?: number;
      };
    };
  }>;
}

// Normalize any user/Places-supplied website into a bare registrable host:
// strips scheme, www, path, query, and trailing dots. Returns undefined for
// blank/invalid input so callers can branch on "no domain".
export function normalizeDomain(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const raw = input.trim();
  if (!raw) return undefined;
  let host: string;
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    host = new URL(withScheme).hostname;
  } catch {
    host = raw.replace(/^https?:\/\//i, "").split(/[/?#]/)[0];
  }
  host = host.trim().toLowerCase().replace(/^www\./, "").replace(/\.+$/, "");
  return host || undefined;
}

function authHeader(login: string, password: string): string {
  return `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`;
}

function rankSignalsFor(snapshot: DataForSeoSnapshot): DataForSeoSnapshot["rankSignals"] {
  // Only called when status === "available", so undefined here means the API
  // genuinely returned no value for that metric — treat as a real zero.
  const out: DataForSeoSnapshot["rankSignals"] = [];
  const keywords = snapshot.organicKeywordCount ?? 0;
  if (keywords === 0) {
    out.push({
      label: "Organic keyword footprint",
      level: "red",
      detail: "Domain has no measurable organic keyword footprint.",
    });
  } else if (keywords < 50) {
    out.push({
      label: "Organic keyword footprint",
      level: "yellow",
      detail: `Domain ranks for roughly ${keywords} keywords — limited topical authority.`,
    });
  } else {
    out.push({
      label: "Organic keyword footprint",
      level: "green",
      detail: `Domain ranks for ${keywords.toLocaleString()} keywords — established topical authority.`,
    });
  }

  const traffic = snapshot.organicTrafficEstimate ?? 0;
  if (traffic < 100) {
    out.push({
      label: "Estimated organic traffic",
      level: traffic === 0 ? "red" : "yellow",
      detail: `Estimated ${Math.round(traffic).toLocaleString()} monthly organic visits — well below local-leader benchmarks.`,
    });
  } else {
    out.push({
      label: "Estimated organic traffic",
      level: "green",
      detail: `Estimated ${Math.round(traffic).toLocaleString()} monthly organic visits.`,
    });
  }

  return out;
}

const UNAVAILABLE_SIGNAL = {
  label: "SEO visibility",
  level: "yellow" as const,
  detail:
    "Search visibility data isn't available for this website right now — we'll confirm it live before the proposal.",
};

function unavailableSnapshot(
  domain: string | undefined,
  rawError: string,
  source: string,
): DataForSeoSnapshot {
  return {
    configured: true,
    status: "unavailable",
    domain,
    rankSignals: [UNAVAILABLE_SIGNAL],
    source,
    fetchedAt: new Date().toISOString(),
    rawError,
  };
}

export async function fetchDataForSeoSnapshot(
  website: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<DataForSeoSnapshot> {
  const login = getEnv("DATAFORSEO_LOGIN");
  const password = getEnv("DATAFORSEO_PASSWORD");
  const domain = normalizeDomain(website);
  const fetchedAt = new Date().toISOString();

  if (!login || !password) {
    return {
      configured: false,
      status: "not_configured",
      domain,
      source: "DataForSEO",
      fetchedAt,
    };
  }

  if (!domain) {
    return {
      configured: true,
      status: "available",
      source: "DataForSEO",
      fetchedAt,
      rankSignals: [
        {
          label: "Web presence",
          level: "red",
          detail:
            "No website on file — there's no domain to rank, so every search hands this prospect's customers to competitors. Prime opportunity for a first MS2GO site.",
        },
      ],
    };
  }

  try {
    const res = await fetchImpl(
      "https://api.dataforseo.com/v3/dataforseo_labs/google/domain_rank_overview/live",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: authHeader(login, password),
        },
        body: JSON.stringify([
          {
            target: domain,
            language_code: "en",
            location_code: 2840,
            limit: 10,
          },
        ]),
      },
    );

    if (!res.ok) {
      return unavailableSnapshot(domain, `dataforseo_${res.status}`, "DataForSEO");
    }

    const body = (await res.json()) as DfsResponse<DomainOverviewResult>;
    // A task-level error (e.g. auth/subscription) is not an HTTP failure but
    // still means the metrics are not trustworthy — do not coerce to zero.
    const task = body.tasks?.[0];
    const taskFailed =
      (typeof body.status_code === "number" && body.status_code >= 40000) ||
      (typeof task?.status_code === "number" && task.status_code >= 40000);
    if (taskFailed) {
      return unavailableSnapshot(
        domain,
        task?.status_message || body.status_message || "dataforseo_task_error",
        "DataForSEO",
      );
    }

    const result = task?.result?.[0];
    if (!result) {
      // No result object at all — the API didn't give us a verdict. Treat as
      // unavailable rather than inventing a zero footprint.
      return unavailableSnapshot(domain, "dataforseo_empty_result", "DataForSEO");
    }

    const organicCount = result.metrics?.organic?.count;
    const organicEtv = result.metrics?.organic?.etv;
    const paidCount = result.metrics?.paid?.count;

    const topKeywords =
      result.items?.slice(0, 5).map((it) => ({
        keyword: it.keyword_data?.keyword || "",
        position: it.ranked_serp_element?.serp_item?.rank_absolute || 0,
        searchVolume: it.keyword_data?.keyword_info?.search_volume,
      })) ?? [];

    const snapshot: DataForSeoSnapshot = {
      configured: true,
      status: "available",
      domain,
      organicKeywordCount: organicCount,
      organicTrafficEstimate: organicEtv,
      paidKeywordCount: paidCount,
      topKeywords,
      source: "DataForSEO",
      fetchedAt,
    };
    snapshot.rankSignals = rankSignalsFor(snapshot);
    return snapshot;
  } catch (err) {
    return unavailableSnapshot(
      domain,
      err instanceof Error ? err.message : "unknown_dfs_error",
      "DataForSEO",
    );
  }
}
