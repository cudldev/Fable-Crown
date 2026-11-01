import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
const RpgApp = lazy(() => import("./rpg/RpgApp"));
import "./style.css";
const AssetReview = lazy(() => import("./render/AssetReview"));
const ActionPrototype = lazy(() => import("./action/ActionPrototype"));
const ValleyApp = lazy(() => import("./valley/ValleyApp"));
const reviewAssets = new URLSearchParams(location.search).get("assetReview") === "1";
const actionPrototype = new URLSearchParams(location.search).get("actionPrototype") === "1";
const chapter = new URLSearchParams(location.search).get("chapter");
const valley = !chapter || chapter === "valley";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense fallback={<div className="loading-screen">Opening your valley…</div>}>
      {reviewAssets ? <AssetReview /> : actionPrototype ? <ActionPrototype /> : valley ? <ValleyApp /> : <RpgApp />}
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
