"use client";

import { useRequirePermission } from "@/lib/use-permission";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { getShopId, getCurrentUser, requirePinAction, logAudit } from "@/lib/security";
import {
  Plus, Search, ShoppingCart, Pencil, Trash2, Truck, Lock, X,
} from "lucide-react";
import type { PurchaseOrder, PurchaseOrderItem, Supplier, Product } from "@/types";

const statusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: "En attente", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  ordered: { label: "Commandé", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
  partial: { label: "Partiel", className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400" },
  received: { label: "Reçu", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  cancelled: { label: "Annulé", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
};

export default function PurchaseOrdersPage() {
  useRequirePermission("products");
  const [items, setItems] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Partial<PurchaseOrder> & { items?: PurchaseOrderItem[] }>({});
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [pinTarget, setPinTarget] = useState<{ type: "status" | "receive" | "delete"; id: string; newStatus?: string } | null>(null);
  const [newItemProduct, setNewItemProduct] = useState("");
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemCost, setNewItemCost] = useState(0);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => { getCurrentUser().then(u => u && setUserId(u.id)); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const shopId = await getShopId();
    if (!shopId) { setLoading(false); return; }
    const [poRes, supRes, prodRes] = await Promise.all([
      supabase.from("purchase_orders").select("*").eq("shop_id", shopId).order("created_at", { ascending: false }),
      supabase.from("suppliers").select("*").eq("shop_id", shopId).order("name"),
      supabase.from("products").select("*").is("deleted_at", null).eq("shop_id", shopId).order("name"),
    ]);
    if (poRes.data) setItems(poRes.data as PurchaseOrder[]);
    if (supRes.data) setSuppliers(supRes.data as Supplier[]);
    if (prodRes.data) setProducts(prodRes.data as Product[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const filtered = search
    ? items.filter(i =>
        i.reference?.toLowerCase().includes(search.toLowerCase()) ||
        i.supplier_name?.toLowerCase().includes(search.toLowerCase())
      )
    : items;

  const openEdit = (item?: PurchaseOrder) => {
    if (item) {
      setEdit({ ...item });
    } else {
      setEdit({
        reference: `CMD-${Date.now()}`,
        status: "pending",
        items: [],
        total: 0,
        tax: 0,
        discount: 0,
        notes: "",
      });
    }
    setNewItemProduct("");
    setNewItemQty(1);
    setNewItemCost(0);
    setOpen(true);
  };

  const addItem = () => {
    if (!newItemProduct) return;
    const prod = products.find(p => p.id === newItemProduct);
    if (!prod) return;
    const item = {
      product_id: prod.id,
      product_name: prod.name,
      qty: newItemQty,
      unit_cost: newItemCost || prod.cost || 0,
      total: newItemQty * (newItemCost || prod.cost || 0),
    };
    const currentItems = edit.items || [];
    setEdit({ ...edit, items: [...currentItems, item] });
    setNewItemProduct("");
    setNewItemQty(1);
    setNewItemCost(0);
  };

  const removeItem = (index: number) => {
    const currentItems = [...(edit.items || [])];
    currentItems.splice(index, 1);
    setEdit({ ...edit, items: currentItems });
  };

  const calcSubtotal = () => (edit.items || []).reduce((s, i) => s + (i.qty * i.unit_cost), 0);
  const calcTotal = () => {
    const sub = calcSubtotal();
    const taxVal = (edit.tax || 0);
    const discVal = (edit.discount || 0);
    return sub + taxVal - discVal;
  };

  const save = async () => {
    const shopId = await getShopId();
    if (!shopId) return;
    const itemsData = (edit.items || []).map(i => ({
      product_id: i.product_id,
      product_name: i.product_name,
      qty: i.qty,
      unit_cost: i.unit_cost,
      total: i.qty * i.unit_cost,
    }));
    const total = calcTotal();
    if (edit.id) {
      await supabase.from("purchase_orders").update({
        supplier_id: edit.supplier_id,
        supplier_name: edit.supplier_name,
        reference: edit.reference,
        status: edit.status,
        items: itemsData,
        total,
        tax: edit.tax || 0,
        discount: edit.discount || 0,
        notes: edit.notes,
      }).eq("id", edit.id).eq("shop_id", shopId);
    } else {
      await supabase.from("purchase_orders").insert({
        id: crypto.randomUUID(), shop_id: shopId,
        supplier_id: edit.supplier_id,
        supplier_name: edit.supplier_name,
        reference: edit.reference || `CMD-${Date.now()}`,
        status: edit.status || "pending",
        items: itemsData,
        total,
        tax: edit.tax || 0,
        discount: edit.discount || 0,
        notes: edit.notes,
        ordered_at: new Date().toISOString(),
      });
    }
    setOpen(false);
    load();
  };

  const executePinAction = async () => {
    if (!pinTarget || !userId) return;
    const valid = await requirePinAction(userId, pinInput, pinTarget.type === "delete" ? "delete_purchase_order" : "update_purchase_order", "purchase_orders", pinTarget.id);
    if (!valid) { setPinError(true); return; }
    const shopId = await getShopId();
    if (!shopId) return;

    if (pinTarget.type === "status" && pinTarget.newStatus) {
      await supabase.from("purchase_orders").update({
        status: pinTarget.newStatus,
        ...(pinTarget.newStatus === "received" ? { received_at: new Date().toISOString() } : {}),
      }).eq("id", pinTarget.id).eq("shop_id", shopId);
    } else if (pinTarget.type === "receive") {
      const order = items.find(i => i.id === pinTarget.id);
      if (!order) return;
      await supabase.from("purchase_orders").update({
        status: "received",
        received_at: new Date().toISOString(),
        items: (order.items || []).map(i => ({ ...i, received_qty: i.qty })),
      }).eq("id", pinTarget.id).eq("shop_id", shopId);
      for (const item of (order.items || [])) {
        if (!item.product_id) continue;
        const prod = products.find(p => p.id === item.product_id);
        if (!prod) continue;
        const newStock = (prod.stock || 0) + item.qty;
        await supabase.from("products").update({ stock: newStock }).eq("id", item.product_id).eq("shop_id", shopId);
        await supabase.from("stock_movements").insert({
          id: crypto.randomUUID(), shop_id: shopId, product_id: item.product_id,
          product_name: item.product_name, type: "in", qty: item.qty,
          before: prod.stock || 0, after: newStock,
          reason: `Réception commande ${order.reference || ""}`, user_id: userId,
        });
      }
    } else if (pinTarget.type === "delete") {
      await supabase.from("purchase_orders").delete().eq("id", pinTarget.id);
    }

    setPinTarget(null);
    setPinInput("");
    setPinError(false);
    logAudit({ action: pinTarget.type === "delete" ? "delete_purchase_order" : "update_purchase_order", entity: "purchase_orders", entity_id: pinTarget.id, data: { newStatus: pinTarget.newStatus } });
    load();
  };

  return (
    <div className="space-y-4 page-enter">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Bons de commande</h1>
          <p className="text-sm text-muted-foreground">{items.length} commande(s)</p>
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
            <Plus className="h-3.5 w-3.5 mr-1" /> Nouvelle commande
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Total</CardTitle></CardHeader><CardContent><p className="text-lg font-bold">{items.length}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">En attente</CardTitle></CardHeader><CardContent><p className="text-lg font-bold text-yellow-500">{items.filter(i => i.status === "pending").length}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Commandées</CardTitle></CardHeader><CardContent><p className="text-lg font-bold text-blue-500">{items.filter(i => i.status === "ordered").length}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Reçues</CardTitle></CardHeader><CardContent><p className="text-lg font-bold text-emerald-500">{items.filter(i => i.status === "received").length}</p></CardContent></Card>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Référence</TableHead>
              <TableHead>Fournisseur</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Articles</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="w-36">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Chargement...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-50" />
                Aucun bon de commande
              </TableCell></TableRow>
            ) : filtered.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.reference || "-"}</TableCell>
                <TableCell className="text-muted-foreground">{item.supplier_name || "-"}</TableCell>
                <TableCell>
                  <Select
                    value={item.status ?? "pending"}
                    onValueChange={(v) => {
                      if (v !== item.status) {
                        setPinTarget({ type: "status", id: item.id, newStatus: v ?? undefined });
                        setPinInput("");
                        setPinError(false);
                      }
                    }}
                  >
                    <SelectTrigger className="h-7 text-xs w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">En attente</SelectItem>
                      <SelectItem value="ordered">Commandé</SelectItem>
                      <SelectItem value="partial">Partiel</SelectItem>
                      <SelectItem value="received">Reçu</SelectItem>
                      <SelectItem value="cancelled">Annulé</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right font-bold">{item.total?.toLocaleString()} FCFA</TableCell>
                <TableCell className="text-right">{item.items?.length || 0}</TableCell>
                <TableCell className="text-xs">{item.created_at ? new Date(item.created_at).toLocaleDateString("fr-FR") : "-"}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(item)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    {(item.status === "ordered" || item.status === "partial") && (
                      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { setPinTarget({ type: "receive", id: item.id }); setPinInput(""); setPinError(false); }}>
                        <Truck className="h-3 w-3 mr-1" /> Recevoir
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400" onClick={() => { setPinTarget({ type: "delete", id: item.id }); setPinInput(""); setPinError(false); }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{edit.id ? "Modifier" : "Nouveau"} bon de commande</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Fournisseur</Label>
                <Select
                  value={edit.supplier_id || ""}
                  onValueChange={(v) => setEdit({ ...edit, supplier_id: v ?? undefined, supplier_name: v ? suppliers.find(s => s.id === v)?.name || "" : "" })}
                >
                  <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Aucun</SelectItem>
                    {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Référence</Label>
                <Input value={edit.reference || ""} onChange={(e) => setEdit({ ...edit, reference: e.target.value })} />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Articles</Label>
              <div className="flex gap-2 items-end">
                <Select value={newItemProduct} onValueChange={(v) => setNewItemProduct(v ?? "")}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Produit" /></SelectTrigger>
                  <SelectContent>
                    {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input
                  type="number" min={1} placeholder="Qté"
                  className="w-20" value={newItemQty}
                  onChange={(e) => setNewItemQty(Math.max(1, parseInt(e.target.value) || 1))}
                />
                <Input
                  type="number" min={0} step={50} placeholder="P.U."
                  className="w-24" value={newItemCost || ""}
                  onChange={(e) => setNewItemCost(Math.max(0, parseFloat(e.target.value) || 0))}
                />
                <Button size="sm" onClick={addItem}><Plus className="h-3.5 w-3.5" /></Button>
              </div>
            </div>

            {(edit.items || []).length > 0 && (
              <div className="border rounded-lg text-sm">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produit</TableHead>
                      <TableHead className="text-right w-16">Qté</TableHead>
                      <TableHead className="text-right w-24">P.U.</TableHead>
                      <TableHead className="text-right w-24">Total</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(edit.items || []).map((i, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{i.product_name}</TableCell>
                        <TableCell className="text-right">{i.qty}</TableCell>
                        <TableCell className="text-right">{i.unit_cost.toLocaleString()} FCFA</TableCell>
                        <TableCell className="text-right font-bold">{(i.qty * i.unit_cost).toLocaleString()} FCFA</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeItem(idx)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Taxe</Label>
                <Input type="number" min={0} step={50} value={edit.tax || 0} onChange={(e) => setEdit({ ...edit, tax: Math.max(0, parseFloat(e.target.value) || 0) })} />
              </div>
              <div className="space-y-1">
                <Label>Remise</Label>
                <Input type="number" min={0} step={50} value={edit.discount || 0} onChange={(e) => setEdit({ ...edit, discount: Math.max(0, parseFloat(e.target.value) || 0) })} />
              </div>
              <div className="space-y-1">
                <Label className="text-base font-bold">Total</Label>
                <p className="text-lg font-bold text-right pt-1">{calcTotal().toLocaleString()} FCFA</p>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea value={edit.notes || ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
              <Button onClick={save}>{edit.id ? "Modifier" : "Créer"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pinTarget} onOpenChange={(v) => { if (!v) setPinTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4" /> Confirmer l'action
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pinTarget?.type === "status"
                ? `Changer le statut vers "${statusConfig[pinTarget.newStatus || ""]?.label || pinTarget.newStatus}" ?`
                : pinTarget?.type === "receive"
                  ? "Réceptionner cette commande et mettre à jour les stocks ?"
                  : "Supprimer définitivement ce bon de commande ?"}
              {" "}Entrez votre code secret pour confirmer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6 pb-2">
            <Input
              type="password" placeholder="Code PIN"
              value={pinInput}
              onChange={(v) => { setPinInput(v.target.value); setPinError(false); }}
              className="text-center text-lg tracking-widest" maxLength={4} autoFocus
            />
            {pinError && <p className="text-xs text-red-400 mt-1">Code PIN incorrect</p>}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setPinTarget(null); setPinInput(""); setPinError(false); }}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={executePinAction}>Confirmer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
