import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
// @ts-expect-error - JS module without type declarations
import HRApp from "../HRApp.jsx";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Dashboard · CDRRMD Time & Leave Management" },
      { name: "description", content: "Employee dashboard for filing and tracking leave, overtime, and duty-off requests at CDRRMD." },
      { property: "og:title", content: "Dashboard · CDRRMD Time & Leave Management" },
      { property: "og:description", content: "Employee dashboard for filing and tracking leave, overtime, and duty-off requests at CDRRMD." },
      { property: "og:url", content: "https://cdrrmd.lovable.app/" },
    ],
    links: [{ rel: "canonical", href: "https://cdrrmd.lovable.app/" }],
  }),

  component: IndexPage,
});

function IndexPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        navigate({ to: "/auth", replace: true });
      } else {
        setReady(true);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session?.user) navigate({ to: "/auth", replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  if (!ready) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Inter','Segoe UI',sans-serif", color: "#666",
      }}>Loading…</div>
    );
  }
  return <HRApp />;
}
