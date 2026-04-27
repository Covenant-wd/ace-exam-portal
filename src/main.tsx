import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// ── Service Worker registration ───────────────────────────────
// The SW caches the app shell (HTML + all JS/CSS bundles) so the portal
// keeps working even when the internet connection drops temporarily.
// This also means the blank-screen-on-offline issue is fully resolved.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
      console.warn("SW registration failed:", err);
    });
  });
}
