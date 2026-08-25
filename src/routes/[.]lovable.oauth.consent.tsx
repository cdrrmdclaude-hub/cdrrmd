import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import logoAsset from "@/assets/logo.jpg.asset.json";

type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: any }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: any }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: any }>;
};

const oauthApi = () => (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    const next = location.pathname + location.searchStr;
    if (!data.session) throw redirect({ to: "/auth", search: { next } });
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
    if (error) throw error;
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main style={wrap}>
      <div style={card}>
        <p>Could not load this authorization request: {String((error as Error)?.message ?? error)}</p>
      </div>
    </main>
  ),
});

const wrap: React.CSSProperties = {
  minHeight: "100dvh",
  background: "linear-gradient(135deg,#E8EDF6 0%,#FBEDEE 100%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  fontFamily: "'Inter','Segoe UI',sans-serif",
};

const card: React.CSSProperties = {
  width: "100%",
  maxWidth: 420,
  background: "#fff",
  borderRadius: 14,
  padding: 28,
  textAlign: "center",
  boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
};

function Consent() {
  const details = Route.useLoaderData() as any;
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientName = details?.client?.name ?? "an app";

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error: err } = approve
      ? await oauthApi().approveAuthorization(authorization_id)
      : await oauthApi().denyAuthorization(authorization_id);
    if (err) {
      setBusy(false);
      setError(err.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main style={wrap}>
      <div style={card}>
        <img
          src={logoAsset.url}
          alt=""
          width={84}
          height={84}
          style={{ display: "block", margin: "0 auto 14px", borderRadius: "50%", objectFit: "contain" }}
        />
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 8px", color: "#1a1a1a" }}>
          Connect {clientName}
        </h1>
        <p style={{ color: "#666", fontSize: 14, margin: "0 0 20px" }}>
          {clientName} is requesting access to your CDRRMD Time &amp; Leave account. It will be able to
          read your profile, balances and requests, and submit requests as you.
        </p>
        {error && (
          <p role="alert" style={{ color: "#b42318", fontSize: 13, marginBottom: 12 }}>
            {error}
          </p>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => decide(false)}
            style={{
              flex: 1, padding: "11px 0", borderRadius: 9, border: "1px solid #ddd",
              background: "#fff", color: "#444", fontWeight: 700, cursor: "pointer",
            }}
          >
            Deny
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => decide(true)}
            style={{
              flex: 1, padding: "11px 0", borderRadius: 9, border: "none",
              background: "#1E3A6E", color: "#fff", fontWeight: 700, cursor: "pointer",
            }}
          >
            {busy ? "Working…" : "Approve"}
          </button>
        </div>
      </div>
    </main>
  );
}
