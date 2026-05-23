import { getEnv } from "./env";

export interface DataForSeoSnapshot {
  configured: boolean;
  domain?: string;
  organicKeywordCount?: number;
  organicTrafficEstimate?: number;
  paidKeywordCount?: number;
  topKeywords?: Array<{ keyword: string; position: number; searchVolume?: number }>;
  rankSignals?: {
    label: string;
    level: "green" | "yellow" | "red";
    detail: string;
  }[];
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

function extractDomain(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const raw = input.trim();
  if (!raw) return undefined;
  try {
    const withScheme = raw.startsWith("http") ? raw : `https://${raw}`;
    const url = new URL(withScheme);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return raw.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  }
}

function authHeader(login: string, password: string): string {
  return `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`;
}

function rankSignalsFor(snapshot: DataForSeoSnapshot): DataForSeoSnapshot["rankSignals"] {
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

export async function fetchDataForSeoSnapshot(
  website: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<DataForSeoSnapshot> {
  const login = getEnv("DATAFORSEO_LOGIN");
  const password = getEnv("DATAFORSEO_PASSWORD");
  const domain = extractDomain(website);

  if (!login || !password) {
    return {
      configured: false,
    };
  }

  if (!domain) {
    return {
      configured: true,
      rankSignals: [
        {
          label: "DataForSEO",
          level: "yellow",
          detail: "No website supplied — could not run a SERP snapshot.",
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
      return {
        configured: true,
        domain,
        rawError: `dataforseo_${res.status}`,
        rankSignals: [
          {
            label: "DataForSEO",
            level: "yellow",
            detail: "SEO snapshot temporarily unavailable.",
          },
        ],
      };
    }

    const body = (await res.json()) as DfsResponse<DomainOverviewResult>;
    const result = body.tasks?.[0]?.result?.[0];
    const organicCount = result?.metrics?.organic?.count;
    const organicEtv = result?.metrics?.organic?.etv;
    const paidCount = result?.metrics?.paid?.count;

    const topKeywords =
      result?.items?.slice(0, 5).map((it) => ({
        keyword: it.keyword_data?.keyword || "",
        position: it.ranked_serp_element?.serp_item?.rank_absolute || 0,
        searchVolume: it.keyword_data?.keyword_info?.search_volume,
      })) ?? [];

    const snapshot: DataForSeoSnapshot = {
      configured: true,
      domain,
      organicKeywordCount: organicCount,
      organicTrafficEstimate: organicEtv,
      paidKeywordCount: paidCount,
      topKeywords,
    };
    snapshot.rankSignals = rankSignalsFor(snapshot);
    return snapshot;
  } catch (err) {
    return {
      configured: true,
      domain,
      rawError: err instanceof Error ? err.message : "unknown_dfs_error",
      rankSignals: [
        {
          label: "DataForSEO",
          level: "yellow",
          detail: "SEO snapshot temporarily unavailable.",
        },
      ],
    };
  }
}
