"use client";

import { useRequirePermission } from "@/lib/use-permission";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { createClient } from "@/lib/supabase/client";
import { getShopId, getCurrentUser, requirePinAction, logAudit } from "@/lib/security";
import {
  Package, AlertTriangle, Plus, Search, ArrowUpDown,
  ArrowDown, ArrowUp, History, TrendingDown,
} from "lucide-react";
import type { Product, StockMovement } from "@/types";

export default function StockPage() {
  useRequirePermission("products");
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("products");
  const [userId, setUserId] = useState("");
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null);
  const [adjustType, setAdjustType] = useState<"in" | "out">("in");
  const [adjustQty, setAdjustQty] = useState(1);
  const [adjustReason, setAdjustReason] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => { getCurrentUser().then(u => u && setUserId(u.id)); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const shopId = await getShopId();
    if (!shopId) { setLoading(false); return; }
    const [pRes, mRes] = await Promise.all([
      supabase.from("products").select("*").is("deleted_at", null).eq("shop_id", shopId).order("name"),
      supabase.from("stock_movements").select("*").eq("shop_id", shopId).order("created_at", { ascending: false }).limit(50),
    ]);
    if (pRes.data) setProducts(pRes.data as Product[]);
    if (mRes.data) setMovements(mRes.data as StockMovement[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const filtered = search ? products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.ref?.toLowerCase().includes(search.toLowerCase())) : products;
  const lowStock = products.filter(p => (p.stock || 0) < (p.threshold || 10));

  const handleAdjust = async () => {
    if (!adjustProduct || !userId || adjustQty <= 0) return;
    const valid = await requirePinAction(userId, pinInput, "adjust_stock", "stock", adjustProduct.id, { type: adjustType, qty: adjustQty, reason: adjustReason });
    if (!valid) { setPinError(true); return; }
    const shopId = await getShopId();
    if (!shopId) return;
    const newStock = adjustType === "in" ? (adjustProduct.stock || 0) + adjustQty : Math.max(0, (adjustProduct.stock || 0) - adjustQty);
    await supabase.from("products").update({ stock: newStock }).eq("id", adjustProduct.id).eq("shop_id", shopId);
    await supabase.from("stock_movements").insert({
      id: crypto.randomUUID(), shop_id: shopId, product_id: adjustProduct.id,
      product_name: adjustProduct.name, type: adjustType, qty: adjustQty,
      before: adjustProduct.stock || 0, after: newStock,
      reason: adjustReason, user_id: userId,
    });
    setAdjustProduct(null);
    setAdjustQty(1);
    setAdjustReason("");
    setPinInput("");
    setPinError(false);
    logAudit({ action: `stock_${adjustType}`, entity: "stock", entity_id: adjustProduct.id, data: { qty: adjustQty, reason: adjustReason } });
    load();
  };

  return (
    <div className="space-y-4 page-enter">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Gestion des stocks</h1>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Rechercher..." className="pl-8 h-8 w-48 text-xs" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Produits</CardTitle></CardHeader><CardContent><p className="text-lg font-bold">{products.length}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Stock total</CardTitle></CardHeader><CardContent><p className="text-lg font-bold">{products.reduce((s, p) => s + (p.stock || 0), 0).toLocaleString()}</p></CardContent></Card>
        <Card className={lowStock.length > 0 ? "border-red-500/30" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-red-400" /> Alerte seuil
            </CardTitle>
          </CardHeader>
          <CardContent><p className={`text-lg font-bold ${lowStock.length > 0 ? "text-red-500" : ""}`}>{lowStock.length}</p></CardContent>
        </Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Valeur stock</CardTitle></CardHeader><CardContent><p className="text-lg font-bold">{products.reduce((s, p) => s + ((p.cost || 0) * (p.stock || 0)), 0).toLocaleString()} FCFA</p></CardContent></Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="products"><Package className="h-3.5 w-3.5 mr-1" /> Stocks</TabsTrigger>
          {lowStock.length > 0 && <TabsTrigger value="alerts" className="text-red-400"><AlertTriangle className="h-3.5 w-3.5 mr-1" /> Alertes ({lowStock.length})</TabsTrigger>}
          <TabsTrigger value="movements"><History className="h-3.5 w-3.5 mr-1" /> Mouvements</TabsTrigger>
        </TabsList>

        <TabsContent value="products">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produit</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Seuil</TableHead>
                  <TableHead className="text-right">Coût</TableHead>
                  <TableHead className="text-right">Valeur</TableHead>
                  <TableHead className="w-32">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Chargement...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground"><Package className="h-8 w-8 mx-auto mb-2 opacity-50" />Aucun produit</TableCell></TableRow>
                ) : filtered.map((p) => {
                  const isLow = (p.stock || 0) < (p.threshold || 10);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className={`text-right font-bold ${isLow ? "text-red-500" : ""}`}>{p.stock || 0}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{p.threshold || 10}</TableCell>
                      <TableCell className="text-right">{p.cost?.toLocaleString()} FCFA</TableCell>
                      <TableCell className="text-right">{((p.cost || 0) * (p.stock || 0)).toLocaleString()} FCFA</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setAdjustProduct(p); setAdjustType("in"); setAdjustQty(1); setAdjustReason(""); }}>
                            <ArrowUp className="h-3 w-3 mr-1 text-emerald-500" /> Entrée
                          </Button>
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setAdjustProduct(p); setAdjustType("out"); setAdjustQty(1); setAdjustReason(""); }}>
                            <ArrowDown className="h-3 w-3 mr-1 text-red-500" /> Sortie
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

        <TabsContent value="alerts">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produit</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Seuil</TableHead>
                  <TableHead className="text-right">Manquant</TableHead>
                  <TableHead className="w-24">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lowStock.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Aucune alerte</TableCell></TableRow>
                ) : lowStock.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-right text-red-500 font-bold">{p.stock || 0}</TableCell>
                    <TableCell className="text-right">{p.threshold || 10}</TableCell>
                    <TableCell className="text-right text-amber-500">{(p.threshold || 10) - (p.stock || 0)}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setAdjustProduct(p); setAdjustType("in"); setAdjustQty((p.threshold || 10) - (p.stock || 0)); }}>
                        <Plus className="h-3 w-3 mr-1" /> Réappro.
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="movements">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Produit</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Qté</TableHead>
                  <TableHead className="text-right">Avant</TableHead>
                  <TableHead className="text-right">Après</TableHead>
                  <TableHead>Raison</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground"><History className="h-8 w-8 mx-auto mb-2 opacity-50" />Aucun mouvement</TableCell></TableRow>
                ) : movements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs">{m.created_at ? new Date(m.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-"}</TableCell>
                    <TableCell className="font-medium">{m.product_name || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={m.type === "in" ? "default" : "destructive"} className="text-xs">
                        {m.type === "in" ? "Entrée" : m.type === "out" ? "Sortie" : "Ajustement"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-bold">{m.qty}</TableCell>
                    <TableCell className="text-right">{m.before}</TableCell>
                    <TableCell className="text-right">{m.after}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{m.reason || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!adjustProduct} onOpenChange={(o) => { if (!o) setAdjustProduct(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajuster le stock — {adjustProduct?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Stock actuel:</span>
              <span className="font-bold text-lg">{adjustProduct?.stock || 0}</span>
            </div>
            <div className="flex gap-2">
              <Button variant={adjustType === "in" ? "default" : "outline"} size="sm" onClick={() => setAdjustType("in")} className="flex-1">
                <ArrowUp className="h-4 w-4 mr-1" /> Entrée
              </Button>
              <Button variant={adjustType === "out" ? "destructive" : "outline"} size="sm" onClick={() => setAdjustType("out")} className="flex-1">
                <ArrowDown className="h-4 w-4 mr-1" /> Sortie
              </Button>
            </div>
            <div className="space-y-1">
              <Label>Quantité</Label>
              <Input type="number" min={1} value={adjustQty} onChange={(e) => setAdjustQty(Math.max(1, parseInt(e.target.value) || 1))} />
            </div>
            <div className="space-y-1">
              <Label>Raison</Label>
              <Input value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder="Ex: réapprovisionnement, casse..." />
            </div>
            <div className="space-y-1">
              <Label>Code PIN</Label>
              <Input type="password" value={pinInput} onChange={(e) => { setPinInput(e.target.value); setPinError(false); }} className="text-center text-lg tracking-widest" maxLength={4} />
              {pinError && <p className="text-xs text-red-400">Code PIN incorrect</p>}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setAdjustProduct(null)}>Annuler</Button>
              <Button onClick={handleAdjust}>Confirmer</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
