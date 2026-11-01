import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api } from "./api";
import { Host } from "./host";
import { KBProvider } from "./kb";
import { GlossMark } from "./mark";
import type { Bootstrap } from "./types";
import "./styles.css";
import "./gloss.css";

function Boot() {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api.bootstrap().then(setData).catch((e: Error) => setErr(e.message || "Could not load the library."));
  }, []);
  if (err) {
    return (
      <div className="boot">
        <div className="boot-card">
          <GlossMark size={28} />
          <h1 className="page-title" style={{ fontSize: 32 }}>Gloss</h1>
          <p className="err">{err}</p>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="boot">
        <div className="boot-card">
          <GlossMark size={28} />
          <div className="shimmer" style={{ height: 16, marginTop: 18 }} />
          <div className="shimmer" style={{ height: 16, width: "70%", marginTop: 8 }} />
        </div>
      </div>
    );
  }
  return (
    <KBProvider initial={data}>
      <Host />
    </KBProvider>
  );
}

createRoot(document.getElementById("root")!).render(<Boot />);
