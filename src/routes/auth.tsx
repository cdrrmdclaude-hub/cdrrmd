import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useId, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import logoAsset from "@/assets/logo.jpg.asset.json";

function safeNext(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!value.startsWith("/") || value.startsWith("//")) return undefined;
  return value;
}

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => ({ next: safeNext(s.next) }),
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in · CDRRMD Time & Leave Management" },
      { name: "description", content: "Sign in or create an account to access the CDRRMD Time & Leave Management portal." },
      { property: "og:title", content: "Sign in · CDRRMD Time & Leave Management" },
      { property: "og:description", content: "Sign in or create an account to access the CDRRMD Time & Leave Management portal." },
      { property: "og:url", content: "https://cdrrmd.lovable.app/auth" },
    ],
    links: [{ rel: "canonical", href: "https://cdrrmd.lovable.app/auth" }],
  }),

  component: AuthPage,
});

const DEPARTMENTS = [
  "Admin","Operations","DRRM Operations","Rescue and Response",
  "Logistics","Training","Rescue","IT",
];
const EMPLOYMENT_STATUSES = ["Regular","Casual","Service Contractual","Job Order"] as const;


function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");
  const [dept, setDept] = useState("");
  const [position, setPosition] = useState("");
  const [empStatus, setEmpStatus] = useState<string>("Regular");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/" });
    });
  }, [navigate]);

  async function signIn() {
    setErr(""); setInfo(""); setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    navigate({ to: "/" });
  }

  async function signUp() {
    setErr(""); setInfo("");
    if (!name.trim() || !dept || !position.trim() || !empStatus || !email.trim() || !pw) {
      setErr("Please fill in all fields."); return;
    }
    if (pw.length < 6) { setErr("Password must be at least 6 characters."); return; }
    setBusy(true);
    const initials = name.trim().split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password: pw,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { full_name: name.trim(), department: dept, position: position.trim(), employment_status: empStatus, avatar: initials || "EM" },
      },
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setInfo("Account created. You can sign in now.");
    setMode("login");
  }

  const formTitleId = useId();
  const isLogin = mode === "login";

  return (
    <main style={{
      minHeight: "100dvh",
      background: "linear-gradient(135deg,#E8EDF6 0%,#FBEDEE 100%)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      fontFamily: "'Inter','Segoe UI',sans-serif",
    }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginBottom: 28 }}>
          <img src={logoAsset.url} alt="" width={120} height={120} style={{ display: "block", margin: "0 auto 12px", borderRadius: "50%", objectFit: "contain" }} />
          <h1 id={formTitleId} style={{ margin: 0, fontSize: 25, fontWeight: 800, color: "#1a1a1a" }}>CDRRMD Time &amp; Leave Management</h1>
          <p style={{ margin: "6px 0 0", color: "#777", fontSize: 14 }}>Employee portal for leave, overtime, and duty-off requests</p>

        </div>

        <div
          role="tablist"
          aria-label="Authentication mode"
          style={{
            display: "flex", gap: 6, background: "#fff", borderRadius: 11, padding: 4, marginBottom: 16,
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          }}
        >
          {(["login", "register"] as const).map(m => {
            const selected = mode === m;
            return (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => { setMode(m); setErr(""); setInfo(""); }}
                style={{
                  flex: 1, padding: "9px 0", borderRadius: 8, border: "none", cursor: "pointer",
                  fontWeight: 700, fontSize: 13.5, background: selected ? "#1E3A6E" : "transparent",
                  color: selected ? "#fff" : "#888",
                }}
              >
                {m === "login" ? "Sign In" : "Create Account"}
              </button>
            );
          })}
        </div>

        <form
          aria-labelledby={formTitleId}
          onSubmit={(e) => { e.preventDefault(); if (!busy) (isLogin ? signIn() : signUp()); }}
          style={{
            background: "#fff", borderRadius: 14, padding: 24,
            boxShadow: "0 1px 4px rgba(0,0,0,0.07),0 0 0 1px rgba(0,0,0,0.04)",
            display: "flex", flexDirection: "column", gap: 12,
          }}
        >
          {!isLogin && (
            <>
              <Field label="Full Name" value={name} onChange={setName} placeholder="e.g. Pedro Dela Cruz" required autoComplete="name" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Department" as="select" value={dept} onChange={setDept} required>
                  <option value="">Select…</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </Field>
                <Field label="Position" value={position} onChange={setPosition} placeholder="e.g. Staff" required autoComplete="organization-title" />
              </div>
              <Field label="Employment Status" as="select" value={empStatus} onChange={setEmpStatus} required>
                {EMPLOYMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </Field>
            </>
          )}
          <Field
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@company.com"
            required
            autoComplete={isLogin ? "email" : "email"}
            inputMode="email"
          />
          <Field
            label="Password"
            type="password"
            value={pw}
            onChange={setPw}
            placeholder="••••••••"
            required
            autoComplete={isLogin ? "current-password" : "new-password"}
            minLength={isLogin ? undefined : 6}
          />
          {err && (
            <p role="alert" aria-live="assertive" style={{ margin: 0, color: "#A30E26", fontSize: 13 }}>{err}</p>
          )}
          {info && (
            <p role="status" aria-live="polite" style={{ margin: 0, color: "#1A7F56", fontSize: 13 }}>{info}</p>
          )}
          <button
            type="submit"
            disabled={busy}
            aria-busy={busy}
            style={{
              marginTop: 4, padding: "11px 20px", borderRadius: 9, border: "none",
              background: "#1E3A6E", color: "#fff", fontWeight: 700, fontSize: 14,
              cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? "Please wait…" : isLogin ? "Sign In" : "Create Account"}
          </button>
        </form>
      </div>
    </main>
  );
}

function Field({
  label, value, onChange, type = "text", placeholder, as, children,
  required, autoComplete, inputMode, minLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  as?: "select";
  children?: React.ReactNode;
  required?: boolean;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  minLength?: number;
}) {
  const id = useId();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label htmlFor={id} style={{ fontSize: 13, fontWeight: 600, color: "#555" }}>
        {label}{required && <span aria-hidden="true" style={{ color: "#A30E26", marginLeft: 3 }}>*</span>}
      </label>
      {as === "select" ? (
        <select
          id={id}
          value={value}
          onChange={e => onChange(e.target.value)}
          required={required}
          aria-required={required || undefined}
          style={inputStyle}
        >
          {children}
        </select>
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          required={required}
          aria-required={required || undefined}
          autoComplete={autoComplete}
          inputMode={inputMode}
          minLength={minLength}
          style={inputStyle}
        />
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  border: "1.5px solid #E2E5EA", borderRadius: 9, padding: "9px 13px", fontSize: 14,
  fontFamily: "inherit", color: "#1a1a1a", background: "#FAFAFA", outline: "none",
  width: "100%", boxSizing: "border-box",
};
