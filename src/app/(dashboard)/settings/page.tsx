"use client";

import { useRequirePermission } from "@/lib/use-permission";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createClient } from "@/lib/supabase/client";
import { getShopId, getCurrentUser, verifyPin, updatePin as updateUserPin } from "@/lib/security";
import {
  Building,
  Save,
  LogOut,
  ImagePlus,
  Lock,
  Shield,
  Check,
  Eye,
  EyeOff,
  RefreshCw,
  Smartphone,
  Trash2,
  Cloud,
  CloudOff,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { useSync } from "@/lib/sync/sync-context";
import { getPendingWrites, removePendingWrite, getCachedProducts, getCachedClients } from "@/lib/sync/db";
import { tryRetryPendingWrite, refreshCache } from "@/lib/sync/sync";
import type { Shop } from "@/types";
import type { PendingWrite, CachedProduct, CachedClient } from "@/lib/sync/db";

export default function SettingsPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  useRequirePermission("settings");
  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [pin, setPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [pinError, setPinError] = useState("");
  const [pinSuccess, setPinSuccess] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  const load = useCallback(async () => {
    try {
      const shopId = await getShopId();
      if (shopId) {
        const { data } = await supabase.from("shops").select("*").eq("id", shopId).single();
        if (data) {
          setShop(data as Shop);
          setLoading(false);
          return;
        }
      }
    } catch {}
    const cached = typeof localStorage !== "undefined" ? localStorage.getItem("cached_shop") : null;
    if (cached) try { setShop(JSON.parse(cached) as Shop); } catch {}
    setLoading(false);
  }, [supabase]);

  useEffect(() => { if (mounted) load(); }, [mounted, load]);

  const saveShop = async () => {
    if (!shop) return;
    setSaving(true);
    await supabase.from("shops").update({
      name: shop.name,
      phone: shop.phone,
      address: shop.address,
      email: shop.email,
      ninea: shop.ninea,
      rccm: shop.rccm,
      currency: shop.currency,
    }).eq("id", shop.id);
    setSaving(false);
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !shop) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.secure_url) {
        await supabase.from("shops").update({ logo: data.secure_url }).eq("id", shop.id);
        setShop({ ...shop, logo: data.secure_url });
      }
    } catch {}
  };

  const handleUpdatePin = async () => {
    setPinError("");
    setPinSuccess(false);
    const user = await getCurrentUser();
    if (!user) return;
    const valid = await verifyPin(user.id, pin);
    if (!valid) { setPinError("Code secret actuel incorrect"); return; }
    if (newPin.length < 4) { setPinError("Le code doit contenir au moins 4 caractères"); return; }
    if (newPin !== confirmPin) { setPinError("Les codes ne correspondent pas"); return; }
    const ok = await updateUserPin(user.id, newPin);
    if (!ok) { setPinError("Erreur lors de la mise à jour"); return; }
    setPinSuccess(true);
    setPin("");
    setNewPin("");
    setConfirmPin("");
    setTimeout(() => setPinSuccess(false), 3000);
  };

  const logout = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {}
    window.location.href = "/login";
  };

  if (!mounted) return <div className="text-center py-8">Chargement...</div>;
  if (loading) return <div className="text-center py-8">Chargement...</div>;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Paramètres</h1>

      {success && (
        <Alert className="border-emerald-500/50">
          <Check className="h-4 w-4 text-emerald-500" />
          <AlertDescription className="text-emerald-500">Paramètres enregistrés</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="shop">
        <TabsList>
          <TabsTrigger value="shop"><Building className="h-4 w-4 mr-1" /> Boutique</TabsTrigger>
          <TabsTrigger value="security"><Lock className="h-4 w-4 mr-1" /> Sécurité</TabsTrigger>
          <TabsTrigger value="sync"><Smartphone className="h-4 w-4 mr-1" /> PWA & Sync</TabsTrigger>
        </TabsList>

        <TabsContent value="shop" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informations boutique</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-4 mb-4">
                {shop?.logo ? (
                  <img src={shop.logo} alt="Logo" className="h-16 w-16 rounded-lg object-cover border" />
                ) : (
                  <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center">
                    <Building className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <Label className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted">
                  <ImagePlus className="h-4 w-4" />
                  {shop?.logo ? "Changer le logo" : "Ajouter un logo"}
                  <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                </Label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Nom de la boutique *</Label>
                  <Input value={shop?.name || ""} onChange={(e) => setShop(shop ? { ...shop, name: e.target.value } : null)} />
                </div>
                <div>
                  <Label>Téléphone</Label>
                  <Input value={shop?.phone || ""} onChange={(e) => setShop(shop ? { ...shop, phone: e.target.value } : null)} />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input value={shop?.email || ""} onChange={(e) => setShop(shop ? { ...shop, email: e.target.value } : null)} />
                </div>
                <div className="col-span-2">
                  <Label>Adresse</Label>
                  <Input value={shop?.address || ""} onChange={(e) => setShop(shop ? { ...shop, address: e.target.value } : null)} />
                </div>
                <div>
                  <Label>NINEA</Label>
                  <Input value={shop?.ninea || ""} onChange={(e) => setShop(shop ? { ...shop, ninea: e.target.value } : null)} />
                </div>
                <div>
                  <Label>RCCM</Label>
                  <Input value={shop?.rccm || ""} onChange={(e) => setShop(shop ? { ...shop, rccm: e.target.value } : null)} />
                </div>
                <div>
                  <Label>Monnaie</Label>
                  <Input value={shop?.currency || "FCFA"} onChange={(e) => setShop(shop ? { ...shop, currency: e.target.value } : null)} />
                </div>
              </div>
              <Button onClick={saveShop} disabled={saving}>
                <Save className="h-4 w-4 mr-2" /> {saving ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4" /> Code secret
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Le code secret protège les actions sensibles : suppression, modification, ajustement de stock, fermeture de caisse.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {pinSuccess && (
                <Alert className="border-emerald-500/50">
                  <Check className="h-4 w-4 text-emerald-500" />
                  <AlertDescription className="text-emerald-500">Code secret mis à jour</AlertDescription>
                </Alert>
              )}
              {pinError && (
                <Alert variant="destructive"><AlertDescription>{pinError}</AlertDescription></Alert>
              )}
              <div>
                <Label>Code actuel</Label>
                <div className="relative">
                  <Input type={showPin ? "text" : "password"} value={pin} onChange={(e) => setPin(e.target.value)} maxLength={6} className="tracking-widest pr-10" />
                  <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setShowPin(!showPin)}>
                    {showPin ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                  </button>
                </div>
              </div>
              <div>
                <Label>Nouveau code (4-6 chiffres)</Label>
                <Input type="password" value={newPin} onChange={(e) => setNewPin(e.target.value)} maxLength={6} className="tracking-widest" />
              </div>
              <div>
                <Label>Confirmer le nouveau code</Label>
                <Input type="password" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} maxLength={6} className="tracking-widest" />
              </div>
              <Button onClick={handleUpdatePin}>
                <Lock className="h-4 w-4 mr-2" /> Changer le code secret
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Actions protégées</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between py-1 border-b">
                  <span>Suppression produit</span>
                  <Lock className="h-3 w-3 text-amber-500" />
                </div>
                <div className="flex items-center justify-between py-1 border-b">
                  <span>Modification produit</span>
                  <Lock className="h-3 w-3 text-amber-500" />
                </div>
                <div className="flex items-center justify-between py-1 border-b">
                  <span>Ajustement de stock</span>
                  <Lock className="h-3 w-3 text-amber-500" />
                </div>
                <div className="flex items-center justify-between py-1 border-b">
                  <span>Suppression vente</span>
                  <Lock className="h-3 w-3 text-amber-500" />
                </div>
                <div className="flex items-center justify-between py-1">
                  <span>Paramètres système</span>
                  <Lock className="h-3 w-3 text-amber-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Compte</CardTitle></CardHeader>
            <CardContent>
              <Button variant="destructive" onClick={logout}>
                <LogOut className="h-4 w-4 mr-2" /> Déconnexion
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sync" className="space-y-4 mt-4">
          <SyncTabContent />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SyncTabContent() {
  const { status, pendingCount, lastSyncTime, isOnline, triggerSync } = useSync();
  const [writes, setWrites] = useState<PendingWrite[]>([]);
  const [cachedProducts, setCachedProducts] = useState<CachedProduct[]>([]);
  const [cachedClients, setCachedClients] = useState<CachedClient[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, [status]);

  const loadData = async () => {
    const [w, p, c] = await Promise.all([
      getPendingWrites(),
      getCachedProducts(),
      getCachedClients(),
    ]);
    setWrites(w);
    setCachedProducts(p);
    setCachedClients(c);
  };

  const handleForceSync = async () => {
    triggerSync();
    setTimeout(loadData, 2000);
  };

  const handleRetry = async (id: number) => {
    await tryRetryPendingWrite(id);
    loadData();
  };

  const handleDeleteWrite = async (id: number) => {
    await removePendingWrite(id);
    loadData();
  };

  const handleRefreshCache = async () => {
    setRefreshing(true);
    await refreshCache();
    loadData();
    setRefreshing(false);
  };

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleString("fr-FR");
    } catch {
      return d;
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCw className="h-4 w-4" /> Statut de la synchronisation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2">
              {isOnline ? (
                <Cloud className="h-4 w-4 text-emerald-500" />
              ) : (
                <CloudOff className="h-4 w-4 text-red-500" />
              )}
              <span>{isOnline ? "Connecté" : "Hors-ligne"}</span>
            </div>
            <div className="flex items-center gap-2">
              {status === "idle" ? (
                <Check className="h-4 w-4 text-emerald-500" />
              ) : status === "syncing" ? (
                <RefreshCw className="h-4 w-4 text-amber-500 animate-spin" />
              ) : status === "error" ? (
                <AlertTriangle className="h-4 w-4 text-red-500" />
              ) : (
                <Clock className="h-4 w-4 text-amber-500" />
              )}
              <span>
                {status === "idle" ? "Synchronisé" : status === "syncing" ? "En cours..." : status === "error" ? "Erreur" : "En attente"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>{lastSyncTime ? formatDate(lastSyncTime) : "Jamais"}</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              <span>{pendingCount} écriture(s) en attente</span>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button size="sm" onClick={handleForceSync} disabled={!isOnline || status === "syncing"}>
              <RefreshCw className={`h-3 w-3 mr-1 ${status === "syncing" ? "animate-spin" : ""}`} />
              Forcer la sync
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Smartphone className="h-4 w-4" /> Cache local
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm mb-4">
            <div>Produits en cache: <strong>{cachedProducts.length}</strong></div>
            <div>Clients en cache: <strong>{cachedClients.length}</strong></div>
          </div>
          <Button size="sm" onClick={handleRefreshCache} disabled={refreshing || !isOnline}>
            <RefreshCw className={`h-3 w-3 mr-1 ${refreshing ? "animate-spin" : ""}`} />
            Mettre à jour le cache
          </Button>
        </CardContent>
      </Card>

      {writes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" /> Écritures en attente ({writes.length})
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Ces écritures seront rejouées automatiquement lors de la prochaine synchronisation.
            </p>
          </CardHeader>
          <CardContent className="max-h-80 overflow-y-auto">
            <div className="space-y-2">
              {writes.map((w) => (
                <div key={w.id} className="flex items-start justify-between gap-2 rounded-lg border p-3 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        w.action === "create" ? "bg-emerald-500/10 text-emerald-600" :
                        w.action === "update" ? "bg-amber-500/10 text-amber-600" :
                        "bg-red-500/10 text-red-600"
                      }`}>
                        {w.action}
                      </span>
                      <span className="font-medium">{w.table}</span>
                      <span className="text-muted-foreground text-[10px]">#{w.id}</span>
                      <span className="text-muted-foreground text-[10px]">{formatDate(w.createdAt)}</span>
                    </div>
                    {w.lastError && (
                      <p className="text-xs text-red-500 mt-1 truncate" title={w.lastError}>
                        Erreur: {w.lastError}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Tentatives: {w.retries}/{5}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleRetry(w.id!)} title="Réessayer">
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => handleDeleteWrite(w.id!)} title="Supprimer">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
