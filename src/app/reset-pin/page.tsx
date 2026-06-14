"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ResetPinPage() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [msg, setMsg] = useState("");

  const handleReset = async () => {
    setStatus("loading");
    setMsg("");
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setStatus("error"); setMsg("Tu dois être connecté"); return; }
      const res = await fetch("/api/auth/reset-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id }),
      });
      const json = await res.json();
      if (json.success) { setStatus("success"); setMsg("PIN réinitialisé à 0000"); }
      else { setStatus("error"); setMsg(json.error || "Erreur"); }
    } catch { setStatus("error"); setMsg("Erreur réseau"); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "sans-serif", background: "#1a1a2e", color: "#e0e0e0" }}>
      <div style={{ background: "#16213e", padding: "2rem", borderRadius: "12px", maxWidth: "400px", width: "100%" }}>
        <h1 style={{ margin: "0 0 1rem", fontSize: "1.5rem" }}>Réinitialisation du code secret</h1>
        <p style={{ marginBottom: "1.5rem", color: "#a0a0b0" }}>
          Le code secret sera réinitialisé à <strong>0000</strong>. Tu pourras le changer ensuite dans Paramètres.
        </p>
        {status === "success" && <p style={{ color: "#4ade80", marginBottom: "1rem" }}>{msg}</p>}
        {status === "error" && <p style={{ color: "#f87171", marginBottom: "1rem" }}>{msg}</p>}
        <button
          onClick={handleReset}
          disabled={status === "loading"}
          style={{
            width: "100%", padding: "0.75rem", borderRadius: "8px", border: "none",
            background: status === "loading" ? "#555" : "#e94560", color: "white",
            fontSize: "1rem", cursor: status === "loading" ? "not-allowed" : "pointer",
          }}
        >
          {status === "loading" ? "Réinitialisation..." : "Réinitialiser le code secret"}
        </button>
      </div>
    </div>
  );
}
