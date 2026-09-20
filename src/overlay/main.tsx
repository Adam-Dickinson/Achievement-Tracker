import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/styles/index.css";
import { Toast } from "@/overlay/Toast";

// M1: subscribe to `achievement://unlocked` events, run the queue/stack logic
// (docs/DESIGN.md §6) and render up to 3 toasts. Static preview for now.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div className="flex h-full flex-col items-end justify-end gap-3 p-4">
      <Toast
        rarity="ultra_rare"
        title="Lord of Frenzied Flame"
        description="Achieve the Lord of Frenzied Flame ending"
        game="Elden Ring"
        platform="Steam"
        percent={1.4}
      />
    </div>
  </StrictMode>,
);
