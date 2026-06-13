"use client";

import { useRequirePermission } from "@/lib/use-permission";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { getShopId, getCurrentUser, requirePinAction } from "@/lib/security";
import { Plus, Search, Users, Pencil, Trash2, Phone, Mail, MapPin, DollarSign } from "lucide-react";
import type { Supplier } from "@/types";

export default function SuppliersPage() {
  useRequirePermission("products");
  const [items, setItems] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Partial<Supplier>>({});
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => { getCurrentUser().then(u => u && setUserId(u.id)); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const shopId = await getShopId();
    if (!shopId) { setLoading(false); return; }
    let q = supabase.from("suppliers").select("*").eq("shop_id", shopId);
    if (search) q = q.or(`name.ilike.%${search}%,contact.ilike.%${search}%,phone.ilike.%${search}%`);
    const { data } = await q.order("name");
    if (data) setItems(data as Supplier[]);
    setLoading(false);
  }, [search, supabase]);

  useEffect(() => { load(); }, [load]);

  const openEdit = (item?: Supplier) => {
    setEdit(item ? { ...item } : { name: "", contact: "", phone: "", email: "", address: "", notes: "" });
    setOpen(true);
  };

  const save = async () => {
    const shopId = await getShopId();
    if (!shopId || !edit.name) return;
    if (edit.id) {
      await supabase.from("suppliers").update({
        name: edit.name, contact: edit.contact, phone: edit.phone,
        email: edit.email, address: edit.address, notes: edit.notes,
      }).eq("id", edit.id).eq("shop_id", shopId);
    } else {
      await supabase.from("suppliers").insert({
        id: crypto.randomUUID(), shop_id: shopId, name: edit.name,
        contact: edit.contact, phone: edit.phone, email: edit.email,
        address: edit.address, notes: edit.notes,
      });
    }
    setOpen(false);
    load();
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !userId) return;
    const valid = await requirePinAction(userId, pinInput, "delete_supplier", "suppliers", deleteTarget);
    if (!valid) { setPinError(true); return; }
    await supabase.from("suppliers").delete().eq("id", deleteTarget);
    setDeleteTarget(null);
    setPinInput("");
    setPinError(false);
    load();
  };

  const totalDebt = items.reduce((s, i) => s + (i.debt || 0), 0);

  return (
    <div className="space-y-4 page-enter">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Fournisseurs</h1>
          <p className="text-sm text-muted-foreground">{items.length} fournisseur(s)</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Rechercher..."
              className="pl-8 h-8 w-48 text-xs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button size="sm" className="h-8" onClick={() => openEdit()}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Ajouter
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Total</CardTitle></CardHeader><CardContent><p className="text-lg font-bold">{items.length}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Dette totale</CardTitle></CardHeader><CardContent><p className="text-lg font-bold text-red-500">{totalDebt.toLocaleString()} FCFA</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Avec dette</CardTitle></CardHeader><CardContent><p className="text-lg font-bold text-amber-500">{items.filter(i => (i.debt || 0) > 0).length}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Sans dette</CardTitle></CardHeader><CardContent><p className="text-lg font-bold text-emerald-500">{items.filter(i => !(i.debt || 0) || i.debt === 0).length}</p></CardContent></Card>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Téléphone</TableHead>
              <TableHead>Dette</TableHead>
              <TableHead className="w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Chargement...</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                Aucun fournisseur
              </TableCell></TableRow>
            ) : items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell className="text-muted-foreground">{item.contact || "-"}</TableCell>
                <TableCell>
                  {item.phone ? (
                    <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{item.phone}</span>
                  ) : "-"}
                </TableCell>
                <TableCell>
                  {(item.debt || 0) > 0 ? (
                    <Badge variant="destructive">{item.debt?.toLocaleString()} FCFA</Badge>
                  ) : (
                    <span className="text-emerald-500 text-sm">0 FCFA</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(item)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Supprimer ?</AlertDialogTitle><AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription></AlertDialogHeader>
                        <div className="px-6 pb-2">
                          <Input
                            type="password" placeholder="Code PIN"
                            value={deleteTarget === item.id ? pinInput : ""}
                            onChange={(v) => { setDeleteTarget(item.id); setPinInput(v.target.value); setPinError(false); }}
                            className="text-center text-lg tracking-widest" maxLength={4} autoFocus
                          />
                          {pinError && <p className="text-xs text-red-400 mt-1">Code PIN incorrect</p>}
                        </div>
                        <AlertDialogFooter>
                          <AlertDialogCancel onClick={() => { setDeleteTarget(null); setPinInput(""); setPinError(false); }}>Annuler</AlertDialogCancel>
                          <AlertDialogAction onClick={confirmDelete}>Supprimer</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit.id ? "Modifier" : "Ajouter"} un fournisseur</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Nom *</Label>
              <Input value={edit.name || ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Contact</Label>
              <Input value={edit.contact || ""} onChange={(e) => setEdit({ ...edit, contact: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Téléphone</Label>
                <Input value={edit.phone || ""} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" value={edit.email || ""} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Adresse</Label>
              <Input value={edit.address || ""} onChange={(e) => setEdit({ ...edit, address: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea value={edit.notes || ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
              <Button onClick={save}>{edit.id ? "Modifier" : "Ajouter"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
