export const MS2GO_BRAND = {
  primaryRep: {
    name: "Joe Pearce",
    title: "Sales Lead, MS2GO",
    defaultEmail: "joe@mstogo.com",
  },
  defaultFromEmail: "sales@ms2go.com",
  defaultReplyTo: "joe@mstogo.com",
  packages: [
    {
      tier: "Basic",
      price: 300,
      cadence: "month",
      summary: "Foundational local presence — profile health, listings hygiene, monthly reporting.",
    },
    {
      tier: "Growth",
      price: 750,
      cadence: "month",
      summary: "Active demand generation — reputation engine, content, and paid amplification.",
    },
    {
      tier: "Premium",
      price: 2000,
      cadence: "month",
      summary: "Full sales acceleration — multi-channel campaigns, creative production, dedicated strategist.",
    },
  ],
} as const;

export type MS2GOPackage = (typeof MS2GO_BRAND.packages)[number];

export function recommendPackage(opts: {
  overall: "green" | "yellow" | "red";
  reviewCount?: number;
}): MS2GOPackage {
  if (opts.overall === "red") return MS2GO_BRAND.packages[1];
  if (opts.overall === "yellow") return MS2GO_BRAND.packages[1];
  if ((opts.reviewCount ?? 0) > 200) return MS2GO_BRAND.packages[2];
  return MS2GO_BRAND.packages[0];
}
