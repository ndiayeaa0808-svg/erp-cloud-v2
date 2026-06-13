"use client";

import { useRequirePermission } from "@/lib/use-permission";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { createClient } from "@/lib/supabase/client";
import { getShopId, getCurrentUser, requirePinAction, logAudit } from "@/lib/security";
import { loadClientsOffline } from "@/lib/offline-data";
import { isOnlineSync } from "@/lib/is-online";
import { createClientOffline, updateClientOffline, deleteClientOffline } from "@/lib/sync/sync";
import { getCachedClients, cacheClients, updateCachedClient, deleteCachedClient } from "@/lib/sync/db";
import {
  Plus,
  Search,
  Users,
  Pencil,
  Trash2,
  Lock,
  DollarSign,
  History,
  TrendingUp,
  Award,
  Receipt,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Client, Sale } from "@/types";

export default function ClientsPage() {
  useRequirePermission("clients");
  const [clients, setClients] = useState<Client[]>([]);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Partial<Client>>({});
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [tab, setTab] = useState("clients");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [salesHistory, setSalesHistory] = useState<Sale[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [clientDebts, setClientDebts] = useState<Record<string, number>>({});
  const [clientPurchaseCounts, setClientPurchaseCounts] = useState<Record<string, number>>({});
  const supabase = useMemo(() => createClient(), []);

  const totalClients = allClients.length;
  const totalSpent = allClients.reduce((sum, c) => sum + (c.total_spent || 0), 0);
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const newThisMonth = allClients.filter((c) => c.created_at && c.created_at >= startOfMonth).length;
  const totalLoyaltyPoints = allClients.reduce((sum, c) => sum + (c.loyalty_points || 0), 0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await loadClientsOffline() as unknown as Client[];
      setAllClients(all);
      let filtered = all;
      if (search) filtered = filtered.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));
      setClients(filtered);
    } catch {}
    try {
      const user = await getCurrentUser();
      if (user) setUserId(user.id);
    } catch {}
    setLoading(false);
  }, [search]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const shopId = await getShopId();
        if (!isOnlineSync()) return;
        const [{ data: credits }, { data: sales }] = await Promise.all([
          supabase.from("credits").select("client, total, paid").eq("shop_id", shopId),
          supabase.from("sales").select("client_id").eq("shop_id", shopId),
        ]);
        if (credits) {
          const debtMap: Record<string, number> = {};
          for (const cr of credits) {
            const name = cr.client || "";
            debtMap[name] = (debtMap[name] || 0) + (cr.total || 0) - (cr.paid || 0);
          }
          setClientDebts(debtMap);
        }
        if (sales) {
          const countMap: Record<string, number> = {};
          for (const s of sales) {
            const cid = s.client_id || "";
            if (cid) countMap[cid] = (countMap[cid] || 0) + 1;
          }
          setClientPurchaseCounts(countMap);
        }
      } catch {}
    })();
  }, []);

  const loadSalesHistory = useCallback(async (client: Client) => {
    if (!client) return;
    setHistoryLoading(true);
    try {
      const shopId = await getShopId();
      if (!isOnlineSync()) { setHistoryLoading(false); return; }
      const { data } = await supabase
        .from("sales")
        .select("id, invoice_number, date, created_at, total, payment")
        .eq("client_id", client.id)
        .eq("shop_id", shopId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (data) setSalesHistory(data as Sale[]);
    } catch {}
    setHistoryLoading(false);
  }, []);

  useEffect(() => {
    if (selectedClient) loadSalesHistory(selectedClient);
    else setSalesHistory([]);
  }, [selectedClient]);

  useEffect(() => { load(); }, [load]);

  const handleDeleteClient = async () => {
    if (!deleteTarget) return;
    const valid = await requirePinAction(userId, pinInput, "delete_client", "clients", deleteTarget);
    if (!valid) { setPinError(true); return; }
    if (!isOnlineSync()) {
      await deleteClientOffline(deleteTarget);
      await deleteCachedClient(deleteTarget);
      setDeleteTarget(null);
      setPinInput("");
      setPinError(false);
      load();
      return;
    }
    const shopId = await getShopId();
    const { error } = await supabase.from("clients").delete().eq("id", deleteTarget).eq("shop_id", shopId);
    if (error) console.error("Delete client error:", error);
    setDeleteTarget(null);
    setPinInput("");
    setPinError(false);
    load();
  };

  const save = async () => {
    try {
      if (!isOnlineSync()) {
        const shopId = await getShopId();
        const now = new Date().toISOString();
        if (edit.id) {
          await updateClientOffline(edit.id, edit);
          await updateCachedClient(edit.id, edit as any);
        } else {
          const newId = crypto.randomUUID();
          await createClientOffline({ ...edit, id: newId, shop_id: shopId });
          const cached = await getCachedClients();
          await cacheClients([...cached, { ...edit, id: newId, shop_id: shopId, updatedAt: now } as any]);
        }
        setOpen(false);
        setEdit({});
        load();
        return;
      }
      const shopId = await getShopId();
      if (edit.id) {
        await supabase.from("clients").update(edit).eq("id", edit.id).eq("shop_id", shopId);
      } else {
        await supabase.from("clients").insert({ ...edit, id: crypto.randomUUID(), shop_id: shopId });
      }
      setOpen(false);
      setEdit({});
      load();
    } catch {}
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Clients ({clients.length})</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button onClick={() => setEdit({ name: "" })}><Plus className="h-4 w-4 mr-2" /> Nouveau client</Button>} />
          <DialogContent>
            <DialogHeader><DialogTitle>{edit.id ? "Modifier" : "Nouveau"} client</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nom *</Label><Input value={edit.name || ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
              <div><Label>Téléphone</Label><Input value={edit.phone || ""} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></div>
              <div><Label>Email</Label><Input value={edit.email || ""} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></div>
              <div><Label>Adresse</Label><Input value={edit.address || ""} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></div>
            </div>
            <Button onClick={save} className="w-full">{edit.id ? "Enregistrer" : "Créer"}</Button>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total clients</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalClients}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total dépenses</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSpent.toLocaleString()} FCFA</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Nouveaux ce mois</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{newThisMonth}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Points fidélité total</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalLoyaltyPoints.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="clients"><Users className="h-4 w-4 mr-1" /> Clients ({clients.length})</TabsTrigger>
          <TabsTrigger value="history"><History className="h-4 w-4 mr-1" /> Historique</TabsTrigger>
        </TabsList>

        <TabsContent value="clients" className="mt-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Rechercher un client..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Téléphone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Dépenses totales</TableHead>
                  <TableHead>Achats</TableHead>
                  <TableHead>Dette</TableHead>
                  <TableHead>Points fidélité</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8">Chargement...</TableCell></TableRow>
                ) : clients.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    Aucun client
                  </TableCell></TableRow>
                ) : clients.map((c) => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer"
                    onClick={() => { setSelectedClient(c); setTab("history"); }}
                  >
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.phone || "-"}</TableCell>
                    <TableCell>{c.email || "-"}</TableCell>
                    <TableCell className="font-medium">{(c.total_spent || 0).toLocaleString()} FCFA</TableCell>
                    <TableCell>{clientPurchaseCounts[c.id] != null ? clientPurchaseCounts[c.id] : "-"}</TableCell>
                    <TableCell>
                      {clientDebts[c.name] != null && clientDebts[c.name] > 0 ? (
                        <Badge variant="destructive">{clientDebts[c.name].toLocaleString()} FCFA</Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>{c.loyalty_points || 0}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setEdit(c); setOpen(true); }}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400" onClick={(e) => { e.stopPropagation(); setDeleteTarget(c.id); setPinInput(""); setPinError(false); }}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-4">
          <Select
            value={selectedClient?.id || ""}
            onValueChange={(id) => {
              const client = allClients.find((c) => c.id === id) || null;
              setSelectedClient(client);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Sélectionner un client" />
            </SelectTrigger>
            <SelectContent>
              {allClients.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Facture</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Paiement</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!selectedClient ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    Sélectionnez un client pour voir son historique
                  </TableCell></TableRow>
                ) : historyLoading ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8">Chargement...</TableCell></TableRow>
                ) : salesHistory.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    <Receipt className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    Aucun achat trouvé
                  </TableCell></TableRow>
                ) : salesHistory.map((s, i) => (
                  <TableRow key={s.id || i}>
                    <TableCell>{s.date ? new Date(s.date).toLocaleDateString() : (s.created_at ? new Date(s.created_at).toLocaleDateString() : "-")}</TableCell>
                    <TableCell className="font-medium">{s.invoice_number || "-"}</TableCell>
                    <TableCell>{(s.total || 0).toLocaleString()} FCFA</TableCell>
                    <TableCell>{s.payment || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4" /> Confirmer la suppression
            </AlertDialogTitle>
            <AlertDialogDescription>
              Cette action supprimera définitivement ce client. Entrez votre code secret pour confirmer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Input
              type="password"
              placeholder="Code secret"
              value={pinInput}
              onChange={(e) => { setPinInput(e.target.value); setPinError(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleDeleteClient(); }}
              maxLength={6}
              className="text-center text-lg"
            />
            {pinError && <p className="text-sm text-red-500 text-center mt-2">Code secret incorrect</p>}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteClient}>Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
