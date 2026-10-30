import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import RpgApp from "./rpg/RpgApp";
import "./style.css";
const AssetReview = lazy(() => import("./render/AssetReview"));
const reviewAssets = new URLSearchParams(location.search).get("assetReview") === "1";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense fallback={<div className="loading-screen">Opening the art review scene…</div>}>
      {reviewAssets ? <AssetReview /> : <RpgApp />}
    </Suspense>
  </React.StrictMode>,
);
if ("serviceWorker" in navigator && import.meta.env.PROD)
  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
      })
      .catch(() => {});
  });
