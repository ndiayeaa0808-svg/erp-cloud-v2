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
import { Plus, Search, Users, Pencil, Trash2, Lock } from "lucide-react";
import type { Client } from "@/types";

export default function ClientsPage() {
  useRequirePermission("clients");
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Partial<Client>>({});
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const allClients = await loadClientsOffline() as unknown as Client[];
      let filtered = allClients;
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

  const handleDeleteClient = async () => {
    if (!deleteTarget) return;
    const valid = await requirePinAction(userId, pinInput, "delete_client", "clients", deleteTarget);
    if (!valid) { setPinError(true); return; }
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
              <TableHead>Points fidélité</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8">Chargement...</TableCell></TableRow>
            ) : clients.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                Aucun client
              </TableCell></TableRow>
            ) : clients.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>{c.phone || "-"}</TableCell>
                <TableCell>{c.email || "-"}</TableCell>
                <TableCell className="font-medium">{(c.total_spent || 0).toLocaleString()} FCFA</TableCell>
                <TableCell>{c.loyalty_points || 0}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEdit(c); setOpen(true); }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400" onClick={() => { setDeleteTarget(c.id); setPinInput(""); setPinError(false); }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

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
