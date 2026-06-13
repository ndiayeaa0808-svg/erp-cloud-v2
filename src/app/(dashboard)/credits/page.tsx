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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";
import { getShopId, getCurrentUser, requirePinAction, logAudit } from "@/lib/security";
import { isOnlineSync } from "@/lib/is-online";
import { loadCreditsOffline } from "@/lib/offline-data";
import { createCreditOffline, updateCreditOffline, deleteCreditOffline } from "@/lib/sync/sync";
import { getCachedCredits, cacheCredits, updateCachedCredit, deleteCachedCredit, getCachedProducts } from "@/lib/sync/db";
import {
  Plus,
  Search,
  CreditCard,
  HandCoins,
  Phone,
  Check,
  TrendingUp,
  Package,
  Trash2,
  Eye,
  Lock,
} from "lucide-react";
import type { Credit, Product } from "@/types";

export default function CreditsPage() {
  useRequirePermission("credits");
  const [credits, setCredits] = useState<Credit[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<{
    id?: string;
    client: string;
    client_phone: string;
    total: number;
    acompte: number;
    due: string;
    note: string;
    items: { product_id: string; product_name: string; qty: number; price: number; total: number }[];
  }>({ client: "", client_phone: "", total: 0, acompte: 0, due: "", note: "", items: [] });
  const [open, setOpen] = useState(false);
  const [detailCredit, setDetailCredit] = useState<Credit | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [payInput, setPayInput] = useState({ id: "", amount: 0, method: "especes", open: false, note: "" });
  const [tab, setTab] = useState("active");
  const [prodSearch, setProdSearch] = useState("");
  const [userId, setUserId] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");
  const supabase = useMemo(() => createClient(), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadCreditsOffline() as unknown as Credit[];
      let filtered = data;
      if (search) filtered = filtered.filter((c) => c.client?.toLowerCase().includes(search.toLowerCase()));
      setCredits(filtered);
    } catch {
      try {
        const shopId = await getShopId();
        if (!shopId) { setLoading(false); return; }
        let q = supabase.from("credits").select("*").eq("shop_id", shopId).order("created_at", { ascending: false });
        if (search) q = q.ilike("client", `%${search}%`);
        const { data } = await q;
        if (data) setCredits(data as Credit[]);
      } catch {}
    }
    const user = await getCurrentUser();
    if (user) setUserId(user.id);
    setLoading(false);
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const loadProducts = async () => {
    if (!isOnlineSync()) {
      const cached = await getCachedProducts();
      setProducts(cached as unknown as Product[]);
      return;
    }
    const shopId = await getShopId();
    if (!shopId) return;
    const { data } = await supabase.from("products").select("id,name,retail,wholesale").is("deleted_at", null).eq("shop_id", shopId).order("name");
    if (data) setProducts(data as Product[]);
  };

  const openNew = () => {
    loadProducts();
    setEdit({ client: "", client_phone: "", total: 0, acompte: 0, due: "", note: "", items: [] });
    setProdSearch("");
    setOpen(true);
  };

  const addProduct = (product: Product) => {
    setEdit((prev) => {
      const exists = prev.items.find((i) => i.product_id === product.id);
      if (exists) return prev;
      const newItems = [...prev.items, { product_id: product.id, product_name: product.name, qty: 1, price: product.retail || 0, total: product.retail || 0 }];
      return { ...prev, items: newItems, total: newItems.reduce((s, i) => s + i.total, 0) };
    });
  };

  const removeProduct = (productId: string) => {
    setEdit((prev) => {
      const newItems = prev.items.filter((i) => i.product_id !== productId);
      return { ...prev, items: newItems, total: newItems.reduce((s, i) => s + i.total, 0) };
    });
  };

  const updateItemQty = (productId: string, qty: number) => {
    if (qty < 1) return;
    setEdit((prev) => {
      const newItems = prev.items.map((i) => i.product_id === productId ? { ...i, qty, total: qty * i.price } : i);
      return { ...prev, items: newItems, total: newItems.reduce((s, i) => s + i.total, 0) };
    });
  };

  const save = async () => {
    setSaveError("");
    const shopId = await getShopId();
    if (!shopId) { setSaveError("Impossible de récupérer la boutique"); return; }

    if (!isOnlineSync()) {
      const paidAmount = Number(edit.acompte) || 0;
      const now = new Date().toISOString();
      const status = paidAmount >= (edit.total || 0) ? "paid" : paidAmount > 0 ? "partial" : "open";
      const creditPayload = {
        id: edit.id || crypto.randomUUID(),
        shop_id: shopId,
        client: edit.client,
        client_phone: edit.client_phone || null,
        total: edit.total,
        paid: paidAmount,
        status,
        date: now.split("T")[0],
        note: edit.note || null,
      };
      if (edit.id) {
        await updateCreditOffline(edit.id, creditPayload);
        await updateCachedCredit(edit.id, { ...creditPayload, updatedAt: now } as any);
      } else {
        await createCreditOffline(creditPayload);
        const cached = await getCachedCredits();
        await cacheCredits([...cached, { ...creditPayload, updatedAt: now } as any]);
      }
      setOpen(false);
      setSaveError("");
      setEdit({ client: "", client_phone: "", total: 0, acompte: 0, due: "", note: "", items: [] });
      load();
      return;
    }

    if (edit.id) {
      await supabase.from("credits").update({ ...edit, total: Number(edit.total) }).eq("id", edit.id).eq("shop_id", shopId);
    } else {
      const paidAmount = Number(edit.acompte) || 0;
      const now = new Date().toISOString();
      const payments = paidAmount > 0 ? [{ amount: paidAmount, date: now, method: "especes", note: "Acompte" }] : [];
      const status = paidAmount >= (edit.total || 0) ? "paid" : paidAmount > 0 ? "partial" : "open";
      const base = {
        id: crypto.randomUUID(),
        shop_id: shopId,
        client: edit.client,
        total: edit.total,
        paid: paidAmount,
        status,
      };
      const { error } = await supabase.from("credits").insert({ ...base, date: new Date().toISOString().split("T")[0] });
      if (error) {
        const { error: e2 } = await supabase.from("credits").insert({
          ...base, date: new Date().toISOString().split("T")[0],
          client_phone: edit.client_phone || null, due: edit.due || null, note: edit.note || null,
          items: edit.items.length > 0 ? edit.items : null,
        });
        if (e2) {
          const { error: e3 } = await supabase.from("credits").insert({
            ...base, date: new Date().toISOString().split("T")[0],
            client_phone: edit.client_phone || null, due: edit.due || null, note: edit.note || null,
            items: edit.items.length > 0 ? edit.items : [],
          });
          if (e3) {
            setSaveError(`Erreur: ${e3.message}`);
            return;
          }
        }
      }
    }
    if (edit.items.length > 0) {
      for (const item of edit.items) {
        const { data: prod } = await supabase.from("products").select("stock").eq("id", item.product_id).single();
        if (prod) {
          await supabase.from("products").update({ stock: Math.max(0, (prod.stock || 0) - item.qty) }).eq("id", item.product_id);
        }
      }
    }
    setOpen(false);
    setSaveError("");
    setEdit({ client: "", client_phone: "", total: 0, acompte: 0, due: "", note: "", items: [] });
    load();
  };

  const handleDeleteCredit = async () => {
    if (!deleteTarget) return;
    const valid = await requirePinAction(userId, pinInput, "delete_credit", "credits", deleteTarget);
    if (!valid) { setPinError(true); return; }
    if (!isOnlineSync()) {
      await deleteCreditOffline(deleteTarget);
      await deleteCachedCredit(deleteTarget);
      setDeleteTarget(null);
      setPinInput("");
      setPinError(false);
      load();
      return;
    }
    const credit = credits.find((c) => c.id === deleteTarget);
    const shopId = await getShopId();
    const { error } = await supabase.from("credits").delete().eq("id", deleteTarget).eq("shop_id", shopId);
    if (error) { console.error("Delete credit error:", error); setPinError(true); return; }
    if (credit?.status !== "paid" && credit?.items && Array.isArray(credit.items)) {
      for (const item of credit.items as { product_id: string; qty: number }[]) {
        const { data: prod } = await supabase.from("products").select("stock, name").eq("id", item.product_id).single();
        if (prod) {
          await supabase.from("products").update({ stock: (prod.stock || 0) + item.qty }).eq("id", item.product_id);
          logAudit({ action: "restore_stock", entity: "credit", entity_id: deleteTarget!, data: { product_id: item.product_id, product_name: prod.name, qty: item.qty } });
        }
      }
    }
    setDeleteTarget(null);
    setPinInput("");
    setPinError(false);
    load();
  };

  const addPayment = async () => {
    const credit = credits.find((c) => c.id === payInput.id);
    if (!credit) return;
    const paymentAmount = Number(payInput.amount);
    const newPaid = (credit.paid || 0) + paymentAmount;
    const newStatus = newPaid >= (credit.total || 0) ? "paid" : "partial";
    if (!isOnlineSync()) {
      await updateCreditOffline(payInput.id, { paid: newPaid, status: newStatus });
      await updateCachedCredit(payInput.id, { paid: newPaid, status: newStatus, updatedAt: new Date().toISOString() } as any);
      setPayInput({ id: "", amount: 0, method: "especes", open: false, note: "" });
      load();
      return;
    }
    const payments = Array.isArray(credit.payments) ? credit.payments : [];
    const now = new Date().toISOString();
    const shopId = await getShopId();
    if (!shopId) return;
    try {
      await supabase
        .from("credits")
        .update({
          paid: newPaid,
          status: newStatus,
          payments: [...payments, { amount: paymentAmount, date: now, method: payInput.method, note: payInput.note }],
        })
        .eq("id", payInput.id)
        .eq("shop_id", shopId);
    } catch {
      await supabase.from("credits").update({ paid: newPaid, status: newStatus }).eq("id", payInput.id).eq("shop_id", shopId);
    }
    const saleItems = Array.isArray(credit.items) ? await Promise.all(credit.items.map(async (item: any) => {
      const { data: prod } = await supabase.from("products").select("cost").eq("id", item.product_id).single();
      return { ...item, cost: prod?.cost || 0 };
    })) : [];
    const totalItemCost = saleItems.reduce((s: number, i: any) => s + (i.cost * i.qty), 0);
    const totalProfit = (credit.total || 0) - totalItemCost;
    const proportionalProfit = (credit.total || 0) > 0 ? Math.round((paymentAmount / (credit.total || 0)) * totalProfit) : 0;
    // Update the original sale (if linked) to reflect cumulative payment
    const linkedSaleId = (credit as any).sale_id || null;
    let linkedSale: any = null;
    if (linkedSaleId) {
      const { data } = await supabase.from("sales").select("id,total,profit,invoice_number").eq("id", linkedSaleId).single();
      linkedSale = data;
    } else {
      const invMatch = credit.note?.match(/Reliquat vente (\S+)/);
      if (invMatch?.[1]) {
        const { data } = await supabase.from("sales").select("id,total,profit,invoice_number").ilike("invoice_number", `%${invMatch[1]}%`).limit(1).maybeSingle();
        linkedSale = data;
      }
    }
    if (linkedSale?.id) {
      // Update original sale: increment total and profit
      const newTotal = (linkedSale.total || 0) + paymentAmount;
      const newProfit = (linkedSale.profit || 0) + proportionalProfit;
      await supabase.from("sales").update({ total: newTotal, profit: newProfit }).eq("id", linkedSale.id);
      try {
        await supabase.from("accounting_entries").insert({
          shop_id: shopId,
          type: "credit_payment",
          amount: paymentAmount,
          payment_method: payInput.method,
          reference: `CRD-${credit.id?.substring(0, 8)}-${Date.now()}`,
          description: `Remb. crédit ${credit.client} — facture ${linkedSale.invoice_number}`,
          entry_date: now.split("T")[0],
        });
      } catch {}
    } else {
      // Fallback: create a new sale for the payment
      try {
        await supabase.from("sales").insert({
          id: crypto.randomUUID(),
          shop_id: shopId,
          invoice_number: `PMT-${Date.now()}`,
          date: now.split("T")[0],
          client: credit.client,
          client_phone: credit.client_phone || null,
          total: paymentAmount,
          profit: proportionalProfit,
          discount: 0,
          payment: payInput.method,
          payment_type: "complet",
          status: "completed",
          items: [{ product_name: `Paiement crédit ${credit.client}`, qty: 1, price: paymentAmount, total: paymentAmount }],
          vendor: "Crédit",
        });
      } catch (e) { console.error("Sale creation failed", e); }
    }
    setPayInput({ id: "", amount: 0, method: "especes", open: false, note: "" });
    load();
  };

  const activeCredits = credits.filter((c) => c.status !== "paid");
  const paidCredits = credits.filter((c) => c.status === "paid");

  const totalCredits = credits.reduce((s, c) => s + (c.total || 0), 0);
  const totalPaid = credits.reduce((s, c) => s + (c.paid || 0), 0);
  const totalPending = totalCredits - totalPaid;

  const filteredProducts = products.filter((p) => p.name.toLowerCase().includes(prodSearch.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Crédits clients</h1>
        <p className="text-sm text-muted-foreground">Les crédits sont générés automatiquement depuis la caisse POS</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-amber-500" /> Total crédits
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCredits.toLocaleString()} FCFA</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-500" /> Remboursé
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">{totalPaid.toLocaleString()} FCFA</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-red-500" /> Reste à percevoir
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{totalPending.toLocaleString()} FCFA</div>
          </CardContent>
        </Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Rechercher par client..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nouveau crédit</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Client *</Label>
              <Input value={edit.client} onChange={(e) => setEdit({ ...edit, client: e.target.value })} placeholder="Nom du client" />
            </div>
            <div>
              <Label>Téléphone</Label>
              <Input value={edit.client_phone} onChange={(e) => setEdit({ ...edit, client_phone: e.target.value })} placeholder="Téléphone du client" />
            </div>
            <div>
              <Label>Ajouter des produits</Label>
              <Input placeholder="Rechercher un produit..." value={prodSearch} onChange={(e) => setProdSearch(e.target.value)} className="mb-2" />
              <div className="max-h-32 overflow-y-auto border rounded-lg divide-y text-sm">
                {filteredProducts.length === 0 ? (
                  <p className="p-3 text-muted-foreground text-center">Aucun produit</p>
                ) : filteredProducts.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-3 py-2 hover:bg-muted/50 cursor-pointer" onClick={() => addProduct(p)}>
                    <span>{p.name}</span>
                    <span className="text-xs text-muted-foreground">{p.retail?.toLocaleString()} FCFA</span>
                  </div>
                ))}
              </div>
            </div>
            {edit.items.length > 0 && (
              <div>
                <Label>Articles</Label>
                <div className="border rounded-lg divide-y text-sm">
                  {edit.items.map((item) => (
                    <div key={item.product_id} className="flex items-center justify-between px-3 py-2">
                      <div className="flex-1">
                        <p className="font-medium">{item.product_name}</p>
                        <p className="text-xs text-muted-foreground">{item.price.toLocaleString()} FCFA × {item.qty}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateItemQty(item.product_id, item.qty - 1)}>-</Button>
                        <span className="w-6 text-center">{item.qty}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateItemQty(item.product_id, item.qty + 1)}>+</Button>
                        <span className="w-20 text-right font-medium">{(item.price * item.qty).toLocaleString()} FCFA</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400" onClick={() => removeProduct(item.product_id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <Label>Montant total</Label>
              <Input type="number" value={edit.total || 0} onChange={(e) => setEdit({ ...edit, total: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Acompte (optionnel)</Label>
              <Input type="number" placeholder="Montant versé aujourd'hui" value={edit.acompte || 0} onChange={(e) => setEdit({ ...edit, acompte: Math.max(0, Number(e.target.value)) })} />
              {edit.acompte > 0 && <p className="text-xs text-amber-400 mt-1">Reste: <strong>{(edit.total - edit.acompte).toLocaleString()} FCFA</strong></p>}
            </div>
            <div>
              <Label>Date échéance</Label>
              <Input type="date" value={edit.due || ""} onChange={(e) => setEdit({ ...edit, due: e.target.value })} />
            </div>
            <div>
              <Label>Note</Label>
              <Input value={edit.note || ""} onChange={(e) => setEdit({ ...edit, note: e.target.value })} />
            </div>
            {saveError && <p className="text-sm text-red-500 text-center">{saveError}</p>}
            <Button onClick={save} className="w-full" disabled={!edit.client || edit.total <= 0}>Créer le crédit</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="active">En cours ({activeCredits.length})</TabsTrigger>
          <TabsTrigger value="paid">Payés ({paidCredits.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Payé</TableHead>
                  <TableHead className="text-right">Reste</TableHead>
                  <TableHead>Progression</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Échéance</TableHead>
                  <TableHead className="w-28">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8">Chargement...</TableCell></TableRow>
                ) : activeCredits.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    Aucun crédit en cours
                  </TableCell></TableRow>
                ) : activeCredits.map((c) => {
                  const rest = (c.total || 0) - (c.paid || 0);
                  const percent = c.total ? Math.round(((c.paid || 0) / c.total) * 100) : 0;
                  const isOverdue = c.due && new Date(c.due) < new Date() && c.status !== "paid";
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.client}{c.client_phone ? ` (${c.client_phone})` : ""}</TableCell>
                      <TableCell className="text-xs">{c.created_at ? new Date(c.created_at).toLocaleDateString("fr-FR") : "-"}</TableCell>
                      <TableCell className="text-right">{c.total?.toLocaleString()} FCFA</TableCell>
                      <TableCell className="text-right">{c.paid?.toLocaleString()} FCFA</TableCell>
                      <TableCell className="text-right font-bold text-red-400">{rest.toLocaleString()} FCFA</TableCell>
                      <TableCell className="w-36">
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${percent}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground w-8 text-right">{percent}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={isOverdue ? "destructive" : c.status === "partial" ? "default" : "secondary"}>
                          {isOverdue ? "En retard" : c.status === "partial" ? "Partiel" : "Ouvert"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={isOverdue ? "text-red-400 font-bold" : ""}>
                          {c.due || "-"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setDetailCredit(c); setDetailOpen(true); }} title="Détails">
                            <Eye className="h-3 w-3" />
                          </Button>
                          <Button variant="outline" size="sm" className="h-8" onClick={() => setPayInput({ id: c.id, amount: 0, method: "especes", open: true, note: "" })}>
                            <HandCoins className="h-3 w-3 mr-1" /> Payer
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400" onClick={() => { setDeleteTarget(c.id); setPinInput(""); setPinError(false); }}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="paid" className="mt-4">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Payé</TableHead>
                  <TableHead>Payé le</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="w-16">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paidCredits.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    <Check className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    Aucun crédit payé
                  </TableCell></TableRow>
                ) : paidCredits.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.client}</TableCell>
                    <TableCell className="text-right">{c.total?.toLocaleString()} FCFA</TableCell>
                    <TableCell className="text-right text-emerald-500">{c.paid?.toLocaleString()} FCFA</TableCell>
                    <TableCell>{new Date(c.updated_at || "").toLocaleDateString("fr-FR")}</TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate">{c.note || "-"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400" onClick={() => { setDeleteTarget(c.id); setPinInput(""); setPinError(false); }}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Détail du crédit</DialogTitle></DialogHeader>
          {detailCredit && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Client</span>
                <span className="font-medium">{detailCredit.client}{detailCredit.client_phone ? ` - ${detailCredit.client_phone}` : ""}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total</span>
                <span className="font-bold">{detailCredit.total?.toLocaleString()} FCFA</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payé</span>
                <span className="text-emerald-500 font-bold">{detailCredit.paid?.toLocaleString()} FCFA</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reste</span>
                <span className="text-red-400 font-bold">{((detailCredit.total || 0) - (detailCredit.paid || 0)).toLocaleString()} FCFA</span>
              </div>
              <div>
                <span className="text-muted-foreground">Progression</span>
                <div className="flex items-center gap-2 mt-1">
                  <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${detailCredit.total ? Math.round(((detailCredit.paid || 0) / detailCredit.total) * 100) : 0}%` }} />
                  </div>
                  <span className="text-xs">{detailCredit.total ? Math.round(((detailCredit.paid || 0) / detailCredit.total) * 100) : 0}%</span>
                </div>
              </div>
              {Array.isArray(detailCredit.items) && detailCredit.items.length > 0 && (
                <div>
                  <span className="text-muted-foreground">Produits</span>
                  <div className="border rounded-lg divide-y mt-1 text-xs">
                    {detailCredit.items.map((item: any, i: number) => (
                      <div key={i} className="flex justify-between px-2 py-1">
                        <span>{item.product_name} x{item.qty}</span>
                        <span>{item.total?.toLocaleString()} FCFA</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Paiements</span>
                {Array.isArray(detailCredit.payments) && detailCredit.payments.length > 0 ? (
                  <div className="border rounded-lg divide-y mt-1 text-xs">
                    {detailCredit.payments.map((p: any, i: number) => (
                      <div key={i} className="flex justify-between items-center px-2 py-1">
                        <div>
                          <span className="font-medium">{p.amount?.toLocaleString()} FCFA</span>
                          <span className="text-muted-foreground ml-2 capitalize">{p.method}</span>
                        </div>
                        <span className="text-muted-foreground">{new Date(p.date).toLocaleDateString("fr-FR")}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">Aucun paiement</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4" /> Confirmer la suppression
            </AlertDialogTitle>
            <AlertDialogDescription>
              Cette action supprimera définitivement ce crédit. Entrez votre code secret pour confirmer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Input
              type="password"
              placeholder="Code secret"
              value={pinInput}
              onChange={(e) => { setPinInput(e.target.value); setPinError(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleDeleteCredit(); }}
              maxLength={6}
              className="text-center text-lg"
            />
            {pinError && <p className="text-sm text-red-500 text-center mt-2">Code secret incorrect</p>}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCredit}>Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={payInput.open} onOpenChange={(v) => setPayInput({ ...payInput, open: v })}>
        <DialogContent>
          <DialogHeader><DialogTitle>Enregistrer un paiement</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Montant</Label>
              <Input type="number" value={payInput.amount || ""} onChange={(e) => setPayInput({ ...payInput, amount: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Méthode de paiement</Label>
              <Select value={payInput.method} onValueChange={(v) => v && setPayInput({ ...payInput, method: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="especes">Espèces</SelectItem>
                  <SelectItem value="orange_money">Orange Money</SelectItem>
                  <SelectItem value="wave">Wave</SelectItem>
                  <SelectItem value="transfert">Virement</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Note</Label>
              <Input value={payInput.note} onChange={(e) => setPayInput({ ...payInput, note: e.target.value })} />
            </div>
          </div>
          <Button onClick={addPayment}>Valider le paiement</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
