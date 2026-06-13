"use client";

import { useEffect } from "react";

export function RegisterSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/api/sw", { updateViaCache: "none" });
        console.log("SW enregistré");

        if ("sync" in registration) {
          try {
            const syncMgr = (registration as unknown as { sync: { register: (tag: string) => Promise<void> } }).sync;
            if (syncMgr) await syncMgr.register("sync-pending-writes");
          } catch {}
        }

        navigator.serviceWorker.addEventListener("message", (event) => {
          if (event.data?.type === "CACHE_CLEARED") {
            window.location.reload();
          }
        });

        navigator.serviceWorker.addEventListener("controllerchange", () => {
          window.location.reload();
        });
      } catch {}
    };

    register();
  }, []);

  return null;
}
