"use client";

import { useSync } from "@/lib/sync/sync-context";
import { useState, useEffect } from "react";
import { RefreshCw, CloudOff, Cloud, Clock, AlertTriangle } from "lucide-react";

export function SyncIndicator() {
  const { status, pendingCount, lastSyncTime, isOnline } = useSync();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);
  if (!hydrated) return null;

  if (!isOnline) {
    return (
      <div className="flex items-center gap-1 text-xs text-red-400" title="Hors-ligne — les données ne sont pas synchronisées">
        <CloudOff className="h-3 w-3" />
        <span>Hors-ligne</span>
      </div>
    );
  }

  if (status === "syncing") {
    return (
      <div className="flex items-center gap-1 text-xs text-amber-400" title="Synchronisation en cours...">
        <RefreshCw className="h-3 w-3 animate-spin" />
        <span>Sync...</span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex items-center gap-1 text-xs text-amber-400" title={`${pendingCount} écriture(s) en échec — cliquez pour réessayer`}>
        <AlertTriangle className="h-3 w-3" />
        <span>{pendingCount} échec(s)</span>
      </div>
    );
  }

  if (status === "pending") {
    return (
      <div className="flex items-center gap-1 text-xs text-amber-400" title={`${pendingCount} modification(s) en attente de synchronisation`}>
        <Clock className="h-3 w-3" />
        <span>{pendingCount} en attente</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 text-xs text-emerald-500" title={lastSyncTime ? `Dernière sync: ${new Date(lastSyncTime).toLocaleString("fr-FR")}` : "Synchronisé"}>
      <Cloud className="h-3 w-3" />
      <span>En ligne</span>
    </div>
  );
}
