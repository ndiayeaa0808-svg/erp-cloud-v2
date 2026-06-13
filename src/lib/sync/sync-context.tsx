"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { startSyncListener, onSyncStatus, checkPendingWrites, refreshCache, processSyncQueue, type SyncStatus } from "./sync";
import { isOnlineSync } from "@/lib/is-online";
import { createClient } from "@/lib/supabase/client";

interface SyncContextValue {
  status: SyncStatus;
  pendingCount: number;
  lastSyncTime: string | null;
  isOnline: boolean;
  triggerSync: () => void;
}

const SyncContext = createContext<SyncContextValue>({
  status: "idle",
  pendingCount: 0,
  lastSyncTime: null,
  isOnline: true,
  triggerSync: () => {},
});

export function SyncProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    setIsOnline(isOnlineSync());
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    const unsub = onSyncStatus((s, c, t) => {
      setStatus(s);
      setPendingCount(c ?? 0);
      if (t !== undefined) setLastSyncTime(t);
    });
    checkPendingWrites();
    const cleanup = startSyncListener();

    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        if (isOnlineSync()) refreshCache();
      }
    });
    if (isOnlineSync()) refreshCache();

    return () => { unsub(); cleanup(); subscription?.unsubscribe(); };
  }, []);

  const triggerSync = useCallback(() => {
    processSyncQueue();
  }, []);

  return (
    <SyncContext.Provider value={{ status, pendingCount, lastSyncTime, isOnline, triggerSync }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  return useContext(SyncContext);
}
