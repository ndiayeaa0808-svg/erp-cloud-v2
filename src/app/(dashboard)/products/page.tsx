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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";
import { getShopId, requirePinAction, logAudit } from "@/lib/security";
import { loadProductsOffline } from "@/lib/offline-data";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Package,
  Lock,
  Grid3X3,
  List,
  ImagePlus,
  ShieldAlert,
  ClipboardList,
  History,
} from "lucide-react";
import type { Product } from "@/types";
import { cn } from "@/lib/utils";

export default function ProductsPage() {
  useRequirePermission("products");
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<Partial<Product>>({});
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"grid" | "table">("table");
  const [pinDialog, setPinDialog] = useState<{ open: boolean; action: "edit" | "delete" | "stock"; id?: string }>({ open: false, action: "edit" });
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [stockAdjust, setStockAdjust] = useState<{ id: string; name: string; currentStock: number; mode: "add" | "remove"; qty: number; description: string; pin: string; pinError: boolean } | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [catDialog, setCatDialog] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [activeTab, setActiveTab] = useState("produits");
  const [productHistory, setProductHistory] = useState<{ id: string; name: string; action: string; date: string }[]>([]);
  const [historyDialog, setHistoryDialog] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id);
    });
  }, [supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const allProducts = await loadProductsOffline() as unknown as Product[];
      let filtered = allProducts;
      if (search) filtered = filtered.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
      if (categoryFilter) filtered = filtered.filter((p) => p.cat === categoryFilter);
      setProducts(filtered);
      const cats = [...new Set(allProducts.map((p) => p.cat).filter(Boolean))] as string[];
      setCategories(cats);
    } catch {}
    setLoading(false);
  }, [search, categoryFilter]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setError(null);
    const shopId = await getShopId();
    if (!shopId) { setError("Aucune boutique associée à ce compte"); return; }
    try {
      if (edit.id) {
        const { id: _id, created_at: _ca, updated_at: _ua, ...clean } = edit;
        await supabase.from("products").update(clean).eq("id", edit.id).eq("shop_id", shopId);
        logAudit({ action: "update_product", entity: "products", entity_id: edit.id });
      } else {
        const newId = crypto.randomUUID();
        await supabase.from("products").insert({ ...edit, id: newId, shop_id: shopId });
        logAudit({ action: "create_product", entity: "products", entity_id: newId, data: { name: edit.name } });
      }
      setOpen(false);
      setEdit({});
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  };

  const handlePinAction = async () => {
    try {
      const action = pinDialog.action === "delete" ? "delete_product" : pinDialog.action === "stock" ? "adjust_stock" : "edit_product";
      const valid = await requirePinAction(currentUserId, pinInput, action, "product", pinDialog.id);
      if (valid) {
        setPinInput("");
        setPinError(false);
        setPinDialog({ open: false, action: "edit" });
        if (pinDialog.action === "delete" && pinDialog.id) {
          const shopId = await getShopId();
          if (!shopId) return;
          await supabase.from("products").update({ deleted_at: new Date().toISOString() }).eq("id", pinDialog.id).eq("shop_id", shopId);
          load();
        }
      } else {
        setPinError(true);
      }
    } catch {}
  };

  const handleStockAdjust = async () => {
    if (!stockAdjust) return;
    try {
      const valid = await requirePinAction(currentUserId, stockAdjust.pin, "adjust_stock", "product", stockAdjust.id);
      if (valid) {
        const shopId = await getShopId();
        if (!shopId) return;
        const newStock = stockAdjust.mode === "add"
          ? (stockAdjust.currentStock + stockAdjust.qty)
          : Math.max(0, stockAdjust.currentStock - stockAdjust.qty);
        await supabase.from("products").update({ stock: newStock }).eq("id", stockAdjust.id).eq("shop_id", shopId);
        logAudit({ action: "adjust_stock", entity: "products", entity_id: stockAdjust.id, data: { mode: stockAdjust.mode, qty: stockAdjust.qty, from: stockAdjust.currentStock, to: newStock, description: stockAdjust.description } });
        setStockAdjust(null);
        load();
      } else {
        setStockAdjust((prev) => prev ? { ...prev, pinError: true } : null);
      }
    } catch {}
  };

  const confirmDelete = (id: string) => {
    setPinDialog({ open: true, action: "delete", id });
  };

  const confirmStockAdjust = (product: Product) => {
    setStockAdjust({ id: product.id, name: product.name, currentStock: product.stock || 0, mode: "add", qty: 1, description: "", pin: "", pinError: false });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.secure_url) setEdit((prev) => ({ ...prev, photo: data.secure_url }));
      else setError(data.error || "Erreur upload");
    } catch {
      setError("Erreur lors de l'upload de l'image");
    }
  };

  const openEdit = (product?: Product) => {
    setEdit(product || { name: "", retail: 0, wholesale: 0, cost: 0, stock: 0, threshold: 5, unit: "pcs", cat: "Général" });
    setOpen(true);
  };

  const handleAddCategory = async () => {
    if (!newCategory.trim() || categories.includes(newCategory.trim())) return;
    setCategories((prev) => [...prev, newCategory.trim()]);
    setNewCategory("");
  };

  const handleRemoveCategory = (cat: string) => {
    setCategories((prev) => prev.filter((c) => c !== cat));
  };

  const loadHistory = async (productId: string, productName: string) => {
    const { data } = await supabase
      .from("audit_logs")
      .select("*")
      .eq("entity_id", productId)
      .eq("entity", "product")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) {
      setProductHistory(data.map((d: { action: string; created_at: string }) => ({ id: productId, name: productName, action: d.action, date: d.created_at })));
    }
    setHistoryDialog(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Produits</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setCatDialog(true)}>
            <Package className="h-4 w-4 mr-1" /> Catégories
          </Button>
          <div className="flex rounded-lg border p-0.5">
            <Button variant={view === "table" ? "secondary" : "ghost"} size="sm" className="h-8" onClick={() => setView("table")}>
              <List className="h-4 w-4" />
            </Button>
            <Button variant={view === "grid" ? "secondary" : "ghost"} size="sm" className="h-8" onClick={() => setView("grid")}>
              <Grid3X3 className="h-4 w-4" />
            </Button>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={<Button onClick={() => openEdit()}><Plus className="h-4 w-4 mr-2" /> Nouveau produit</Button>} />
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{edit.id ? "Modifier" : "Nouveau"} produit</DialogTitle>
              </DialogHeader>
              {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Nom *</Label>
                  <Input value={edit.name || ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <Label>Image produit</Label>
                  <div className="flex items-center gap-3">
                    {edit.photo && (
                      <img src={edit.photo} alt="" className="h-16 w-16 rounded-lg object-cover border" />
                    )}
                    <Label className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted">
                      <ImagePlus className="h-4 w-4" />
                      {edit.photo ? "Changer" : "Ajouter une image"}
                      <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                    </Label>
                  </div>
                </div>
                <div>
                  <Label>Catégorie</Label>
                  <Input value={edit.cat || ""} onChange={(e) => setEdit({ ...edit, cat: e.target.value })} />
                </div>
                <div>
                  <Label>Référence</Label>
                  <Input value={edit.ref || ""} onChange={(e) => setEdit({ ...edit, ref: e.target.value })} />
                </div>
                <div>
                  <Label>Prix revient</Label>
                  <Input type="number" value={edit.cost || 0} onChange={(e) => setEdit({ ...edit, cost: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Prix détail</Label>
                  <Input type="number" value={edit.retail || 0} onChange={(e) => setEdit({ ...edit, retail: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Prix gros</Label>
                  <Input type="number" value={edit.wholesale || 0} onChange={(e) => setEdit({ ...edit, wholesale: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Stock</Label>
                  <Input type="number" value={edit.stock || 0} disabled={!!edit.id} className={edit.id ? "opacity-60" : ""} />
                  {edit.id && <p className="text-xs text-muted-foreground mt-1">Utilisez le bouton <strong>réajustement</strong> pour modifier le stock</p>}
                </div>
                {edit.id && (
                  <div className="col-span-2 rounded-lg border bg-muted/30 p-3 space-y-1 text-xs">
                    <div className="flex justify-between"><span className="text-muted-foreground">Coût total du stock</span><span className="font-medium">{((edit.stock || 0) * (edit.cost || 0)).toLocaleString()} FCFA</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Vente potentielle</span><span className="font-medium">{((edit.stock || 0) * (edit.retail || 0)).toLocaleString()} FCFA</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Marge unitaire</span><span className="font-medium text-emerald-500">{((edit.retail || 0) - (edit.cost || 0)).toLocaleString()} FCFA</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Marge totale potentielle</span><span className="font-medium text-emerald-500">{((edit.stock || 0) * ((edit.retail || 0) - (edit.cost || 0))).toLocaleString()} FCFA</span></div>
                  </div>
                )}
                <div>
                  <Label>Seuil alerte</Label>
                  <Input type="number" value={edit.threshold || 5} onChange={(e) => setEdit({ ...edit, threshold: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Unité</Label>
                  <Input value={edit.unit || "pcs"} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} />
                </div>
                <div>
                  <Label>Fournisseur</Label>
                  <Input value={edit.supplier || ""} onChange={(e) => setEdit({ ...edit, supplier: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <Label>Code-barres</Label>
                  <Input value={edit.barcode || ""} onChange={(e) => setEdit({ ...edit, barcode: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <Label>Description</Label>
                  <textarea
                    className="flex min-h-[80px] w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
                    value={edit.desc || ""}
                    onChange={(e) => setEdit({ ...edit, desc: e.target.value })}
                  />
                </div>
              </div>
              <Button onClick={save} className="w-full">
                {edit.id ? "Enregistrer" : "Créer le produit"}
              </Button>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
        <div className="rounded-lg border bg-card p-2">
          <p className="text-xs text-muted-foreground">Valeur du stock</p>
          <p className="font-bold">{(products || []).reduce((s, p) => s + ((p.cost || 0) * (p.stock || 0)), 0).toLocaleString()} FCFA</p>
        </div>
        <div className="rounded-lg border bg-card p-2">
          <p className="text-xs text-muted-foreground">Produits</p>
          <p className="font-bold">{(products || []).length}</p>
        </div>
        <div className="rounded-lg border bg-card p-2">
          <p className="text-xs text-muted-foreground">Catégories</p>
          <p className="font-bold">{categories.length}</p>
        </div>
        <div className="rounded-lg border bg-card p-2">
          <p className="text-xs text-muted-foreground">Stock bas</p>
          <p className="font-bold text-red-400">{(products || []).filter((p) => (p.stock || 0) <= (p.threshold || 10)).length}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Rechercher un produit..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v || "")}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Toutes catégories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Toutes catégories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {view === "table" ? (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">Img</TableHead>
                <TableHead>Nom</TableHead>
                <TableHead>Catégorie</TableHead>
                <TableHead className="text-right">Prix détail</TableHead>
                <TableHead className="text-right">Prix gros</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Seuil</TableHead>
                <TableHead className="text-right">Coût total</TableHead>
                <TableHead className="text-right">Vente potentielle</TableHead>
                <TableHead className="text-right">Marge</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Chargement...</TableCell></TableRow>
              ) : products.length === 0 ? (
                <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  Aucun produit
                </TableCell></TableRow>
              ) : products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    {p.photo ? (
                      <img src={p.photo} alt="" className="h-8 w-8 rounded object-cover" />
                    ) : (
                      <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                        <Package className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.cat}</TableCell>
                  <TableCell className="text-right">{p.retail?.toLocaleString()} FCFA</TableCell>
                  <TableCell className="text-right">{p.wholesale ? `${p.wholesale.toLocaleString()} FCFA` : "-"}</TableCell>
                  <TableCell className={`text-right ${(p.stock ?? 0) <= (p.threshold ?? 0) ? "text-red-400 font-bold" : ""}`}>
                    {p.stock}
                  </TableCell>
                  <TableCell className="text-right">{p.threshold}</TableCell>
                  <TableCell className="text-right text-xs">{((p.stock || 0) * (p.cost || 0)).toLocaleString()} FCFA</TableCell>
                  <TableCell className="text-right text-xs">{((p.stock || 0) * (p.retail || 0)).toLocaleString()} FCFA</TableCell>
                  <TableCell className="text-right text-xs text-emerald-500">{((p.stock || 0) * ((p.retail || 0) - (p.cost || 0))).toLocaleString()} FCFA</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-400" onClick={() => loadHistory(p.id, p.name)}>
                        <ClipboardList className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-amber-400" onClick={() => confirmStockAdjust(p)}>
                        <ShieldAlert className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400" onClick={() => confirmDelete(p.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {loading ? (
            <p className="col-span-full text-center py-8 text-muted-foreground">Chargement...</p>
          ) : products.length === 0 ? (
            <p className="col-span-full text-center py-8 text-muted-foreground">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
              Aucun produit
            </p>
          ) : products.map((p) => (
            <Card key={p.id} className="overflow-hidden hover:border-amber-500/50 transition-colors group">
              <CardContent className="p-0">
                <div className="aspect-square bg-muted relative overflow-hidden">
                  {p.photo ? (
                    <img src={p.photo} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center">
                      <Package className="h-10 w-10 text-muted-foreground/40" />
                    </div>
                  )}
                  {(p.stock ?? 0) <= (p.threshold ?? 0) && (
                    <span className="absolute top-2 right-2 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded">Stock bas</span>
                  )}
                </div>
                <div className="p-3 space-y-1">
                  <p className="font-medium text-sm line-clamp-1">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.cat}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-amber-400">{p.retail?.toLocaleString()} FCFA</span>
                    <span className="text-xs text-muted-foreground">Stock: {p.stock}</span>
                  </div>
                  {p.wholesale && p.wholesale > 0 && (
                    <p className="text-xs text-muted-foreground">Gros: {p.wholesale.toLocaleString()} FCFA</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={pinDialog.open} onOpenChange={(v) => { setPinDialog({ ...pinDialog, open: v }); setPinError(false); setPinInput(""); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4" /> Action sécurisée
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {pinDialog.action === "delete" ? "Entrez votre code secret pour supprimer ce produit" :
             pinDialog.action === "stock" ? "Entrez votre code secret pour ajuster le stock" :
             "Entrez votre code secret pour modifier ce produit"}
          </p>
          <Input
            type="password"
            placeholder="Code secret"
            value={pinInput}
            onChange={(e) => { setPinInput(e.target.value); setPinError(false); }}
            maxLength={6}
            className="text-center text-lg tracking-widest"
          />
          {pinError && <p className="text-sm text-red-500">Code secret incorrect</p>}
          <Button onClick={handlePinAction} className="w-full">Confirmer</Button>
        </DialogContent>
      </Dialog>

      {stockAdjust && (
        <Dialog open={!!stockAdjust} onOpenChange={(v) => { if (!v) setStockAdjust(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Ajuster le stock</DialogTitle></DialogHeader>
            <p className="text-sm">Produit: <strong>{stockAdjust.name}</strong></p>
            <p className="text-xs text-muted-foreground mb-3">Stock actuel: <strong>{stockAdjust.currentStock}</strong></p>
            <div className="space-y-3">
              <div className="flex gap-2">
                <Button type="button" variant={stockAdjust.mode === "add" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => setStockAdjust({ ...stockAdjust, mode: "add", pinError: false })}>
                  + Ajouter
                </Button>
                <Button type="button" variant={stockAdjust.mode === "remove" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => setStockAdjust({ ...stockAdjust, mode: "remove", pinError: false })}>
                  - Retirer
                </Button>
              </div>
              <div>
                <Label>Quantité</Label>
                <Input type="number" min={1} value={stockAdjust.qty} onChange={(e) => setStockAdjust({ ...stockAdjust, qty: Math.max(1, Number(e.target.value)), pinError: false })} />
              </div>
              <div>
                <Label>Description (motif)</Label>
                <textarea
                  className="flex min-h-[60px] w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
                  value={stockAdjust.description}
                  onChange={(e) => setStockAdjust({ ...stockAdjust, description: e.target.value, pinError: false })}
                />
              </div>
              <div className="border-t pt-3">
                <Label>Code secret</Label>
                <Input type="password" placeholder="Entrez votre code secret" value={stockAdjust.pin} maxLength={6} className="text-center text-lg tracking-widest mt-1" onChange={(e) => setStockAdjust({ ...stockAdjust, pin: e.target.value, pinError: false })} />
                {stockAdjust.pinError && <p className="text-sm text-red-500 mt-1">Mot de passe incorrect</p>}
              </div>
              <p className="text-xs text-muted-foreground">
                Nouveau stock: <strong>{stockAdjust.mode === "add" ? stockAdjust.currentStock + stockAdjust.qty : Math.max(0, stockAdjust.currentStock - stockAdjust.qty)}</strong>
              </p>
              <Button onClick={handleStockAdjust} className="w-full" disabled={!stockAdjust.pin}>Confirmer l'ajustement</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={catDialog} onOpenChange={setCatDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Gérer les catégories</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Nouvelle catégorie"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddCategory(); }}
              />
              <Button onClick={handleAddCategory} size="sm">Ajouter</Button>
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {categories.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Aucune catégorie</p>
              ) : categories.map((cat) => (
                <div key={cat} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50">
                  <span className="text-sm">{cat}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400" onClick={() => handleRemoveCategory(cat)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={historyDialog} onOpenChange={setHistoryDialog}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-4 w-4" /> Historique du produit
            </DialogTitle>
          </DialogHeader>
          {productHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Aucun historique disponible</p>
          ) : (
            <div className="space-y-2">
              {productHistory.map((h, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b last:border-0 text-sm">
                  <span className="text-xs capitalize">{h.action.replace(/_/g, " ")}</span>
                  <span className="text-xs text-muted-foreground">{new Date(h.date).toLocaleString("fr-FR")}</span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
