import { useEffect, useState, type FC } from "react";
import { LeadAnalyzer } from "./components/LeadAnalyzer";
import { LeadListGenerator, createLeadSearchState, type LeadSearchState } from "./components/LeadListGenerator";
import { EmailComposer } from "./components/EmailComposer";
import { ProposalBuilder } from "./components/ProposalBuilder";
import { MapPackHeatMap } from "./components/MapPackHeatMap";
import { TrainingHub } from "./components/TrainingHub";
import { PipelineDashboard } from "./components/PipelineDashboard";
import { PayoutSetup } from "./components/PayoutSetup";
import { CommandCenter } from "./components/CommandCenter";
import { IntegrationsHub } from "./components/IntegrationsHub";
import { UsageDashboard } from "./components/UsageDashboard";
import { AppointmentCalendar } from "./components/AppointmentCalendar";
import { SalesOpsLayout, type SalesOpsModuleId } from "./components/SalesOpsLayout";
import type { AnalyzeResponse } from "./api";
import { pathForModule, resolveRoute, type Route } from "./router";
import { DocusignCallback } from "./pages/DocusignCallback";
import { DocusignConsentComplete } from "./pages/DocusignConsentComplete";
import { GustoCallback } from "./pages/GustoCallback";
import { Privacy } from "./pages/Privacy";
import { Terms } from "./pages/Terms";
import { supabase } from "./lib/supabase";

const SUPER_ADMIN_EMAILS = new Set(["mstogollc@gmail.com", "admin@mstogo.com"]);
const PRIVILEGED_EMAILS = new Set([...SUPER_ADMIN_EMAILS, "joe@mstogo.com"]);

interface OpsAppProps {
  initialModule: SalesOpsModuleId;
}

const OpsApp: FC<OpsAppProps> = ({ initialModule }) => {
  const [module, setModule] = useState<SalesOpsModuleId>(initialModule);
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [leadSearch, setLeadSearch] = useState<LeadSearchState>(createLeadSearchState);

  useEffect(() => {
    setModule(initialModule);
  }, [initialModule]);

  useEffect(() => {
    const onPop = () => {
      const r = resolveRoute(window.location.pathname);
      if (r.id === "ops" && r.module) setModule(r.module);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;

    async function loadRole(userId: string | undefined) {
      if (!userId) {
        setRole(null);
        return;
      }
      const { data } = await client
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .single();
      setRole((data?.role as string | undefined) ?? null);
    }

    client.auth.getSession().then(({ data }) => {
      setUserEmail(data.session?.user.email ?? null);
      void loadRole(data.session?.user.id);
    });
    const { data: sub } = client.auth.onAuthStateChange((_e, s) => {
      setUserEmail(s?.user.email ?? null);
      void loadRole(s?.user.id);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  function navigate(next: SalesOpsModuleId) {
    setModule(next);
    const path = pathForModule(next);
    if (typeof window !== "undefined" && window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
  }

  const isSuperAdmin = userEmail ? SUPER_ADMIN_EMAILS.has(userEmail.toLowerCase()) : false;
  const isPrivileged = userEmail ? PRIVILEGED_EMAILS.has(userEmail.toLowerCase()) : false;
  // Admins (super admins + managers) can see the Usage & Cost dashboard. Role
  // comes from the profile; the email allowlist covers the super-admin seats
  // before the profile row loads. The server independently re-checks the role.
  const isAdmin = isSuperAdmin || role === "super_admin" || role === "manager";

  // Hard guard: a non-admin can't land on the usage route (deep link / refresh).
  const safeModule: SalesOpsModuleId = module === "usage" && !isAdmin ? "command-center" : module;

  return (
    <SalesOpsLayout
      activeId={safeModule}
      onNavigate={navigate}
      userEmail={userEmail}
      isSuperAdmin={isSuperAdmin}
      isAdmin={isAdmin}
      onSignOut={() => supabase?.auth.signOut()}
    >
      {safeModule === "command-center" && (
        <CommandCenter onNavigate={navigate} userEmail={userEmail} isSuperAdmin={isPrivileged} />
      )}
      {safeModule === "leads" && (
        <LeadListGenerator
          state={leadSearch}
          setState={setLeadSearch}
          onUseLead={() => navigate("intel")}
        />
      )}
      {safeModule === "intel" && <LeadAnalyzer onAnalysisReady={setAnalysis} />}
      {safeModule === "heatmap" && <MapPackHeatMap />}
      {safeModule === "proposal" && <ProposalBuilder analysis={analysis} />}
      {safeModule === "outreach" && <EmailComposer analysis={analysis} />}
      {safeModule === "calendar" && <AppointmentCalendar />}
      {safeModule === "pipeline" && <PipelineDashboard />}
      {safeModule === "payouts" && <PayoutSetup />}
      {safeModule === "training" && <TrainingHub />}
      {safeModule === "integrations" && <IntegrationsHub />}
      {safeModule === "usage" && isAdmin && <UsageDashboard />}
    </SalesOpsLayout>
  );
};

export const App: FC = () => {
  const initial: Route =
    typeof window === "undefined"
      ? { id: "ops", module: "command-center" }
      : resolveRoute(window.location.pathname);

  switch (initial.id) {
    case "docusign-callback":
      return <DocusignCallback />;
    case "docusign-consent-complete":
      return <DocusignConsentComplete />;
    case "gusto-callback":
      return <GustoCallback />;
    case "privacy":
      return <Privacy />;
    case "terms":
      return <Terms />;
    case "ops":
    default:
      return <OpsApp initialModule={initial.module ?? "command-center"} />;
  }
};
