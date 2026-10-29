import React from "react";
import { createRoot } from "react-dom/client";
import RpgApp from "./rpg/RpgApp";
import "./style.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RpgApp />
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
