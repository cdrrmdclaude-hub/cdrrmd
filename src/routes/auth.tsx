import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import logoAsset from "@/assets/logo.jpg.asset.json";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({ meta: [{ title: "Sign in · CDRRMD HR" }] }),
  component: AuthPage,
});

const DEPARTMENTS = [
  "Admin","Operations","DRRM Operations","Rescue and Response",
  "Logistics","Training","Rescue","IT",
];
const EMPLOYMENT_STATUSES = ["Regular","Casual","Service Contract","Job Order"] as const;


function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");
  const [dept, setDept] = useState("");
  const [position, setPosition] = useState("");
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
    if (!name.trim() || !dept || !position.trim() || !email.trim() || !pw) {
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
        data: { full_name: name.trim(), department: dept, position: position.trim(), avatar: initials || "EM" },
      },
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setInfo("Account created. You can sign in now.");
    setMode("login");
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg,#E8EDF6 0%,#FBEDEE 100%)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      fontFamily: "'Inter','Segoe UI',sans-serif",
    }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginBottom: 28 }}>
          <img src={logoAsset.url} alt="CDRRMD logo" width={120} height={120} style={{ display: "block", margin: "0 auto 12px", borderRadius: "50%", objectFit: "contain" }} />
          <h1 style={{ margin: 0, fontSize: 25, fontWeight: 800, color: "#1a1a1a" }}>CDRRMD</h1>
          <p style={{ margin: "6px 0 0", color: "#777", fontSize: 14 }}>Time & Leave Management System</p>
        </div>

        <div style={{
          display: "flex", gap: 6, background: "#fff", borderRadius: 11, padding: 4, marginBottom: 16,
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        }}>
          {(["login", "register"] as const).map(m => (
            <button key={m} onClick={() => { setMode(m); setErr(""); setInfo(""); }} style={{
              flex: 1, padding: "9px 0", borderRadius: 8, border: "none", cursor: "pointer",
              fontWeight: 700, fontSize: 13.5, background: mode === m ? "#1E3A6E" : "transparent",
              color: mode === m ? "#fff" : "#888",
            }}>{m === "login" ? "Sign In" : "Create Account"}</button>
          ))}
        </div>

        <div style={{
          background: "#fff", borderRadius: 14, padding: 24,
          boxShadow: "0 1px 4px rgba(0,0,0,0.07),0 0 0 1px rgba(0,0,0,0.04)",
          display: "flex", flexDirection: "column", gap: 12,
        }}>
          {mode === "register" && (
            <>
              <Field label="Full Name" value={name} onChange={setName} placeholder="e.g. Pedro Dela Cruz" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Department" as="select" value={dept} onChange={setDept}>
                  <option value="">Select…</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </Field>
                <Field label="Position" value={position} onChange={setPosition} placeholder="e.g. Staff" />
              </div>
            </>
          )}
          <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@company.com" />
          <Field label="Password" type="password" value={pw} onChange={setPw} placeholder="••••••••"
            onEnter={mode === "login" ? signIn : signUp} />
          {err && <p style={{ margin: 0, color: "#A30E26", fontSize: 13 }}>{err}</p>}
          {info && <p style={{ margin: 0, color: "#1A7F56", fontSize: 13 }}>{info}</p>}
          <button onClick={mode === "login" ? signIn : signUp} disabled={busy} style={{
            marginTop: 4, padding: "11px 20px", borderRadius: 9, border: "none",
            background: "#1E3A6E", color: "#fff", fontWeight: 700, fontSize: 14,
            cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1,
          }}>
            {busy ? "Please wait…" : mode === "login" ? "Sign In" : "Create Account"}
          </button>
          {mode === "register" && (
            <p style={{ margin: 0, fontSize: 12, color: "#aaa", textAlign: "center" }}>
              The first account becomes the administrator. Subsequent accounts are employees.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, type = "text", placeholder, as, children, onEnter,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  as?: "select";
  children?: React.ReactNode;
  onEnter?: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: "#555" }}>{label}</label>
      {as === "select" ? (
        <select value={value} onChange={e => onChange(e.target.value)} style={inputStyle}>
          {children}
        </select>
      ) : (
        <input type={type} value={value} placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && onEnter) onEnter(); }}
          style={inputStyle} />
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  border: "1.5px solid #E2E5EA", borderRadius: 9, padding: "9px 13px", fontSize: 14,
  fontFamily: "inherit", color: "#1a1a1a", background: "#FAFAFA", outline: "none",
  width: "100%", boxSizing: "border-box",
};
