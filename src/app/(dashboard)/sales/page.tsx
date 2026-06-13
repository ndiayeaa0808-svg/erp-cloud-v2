"use client";

import { useRequirePermission } from "@/lib/use-permission";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";
import { getShopId, getShopInfo, getCurrentUser, requirePinAction, logAudit } from "@/lib/security";
import { loadSalesOffline } from "@/lib/offline-data";
import { isOnlineSync } from "@/lib/is-online";
import { deleteSaleOffline, updateSaleOffline, createSaleOffline } from "@/lib/sync/sync";
import { getCachedSales, cacheSales } from "@/lib/sync/db";
import {
  Search,
  Receipt,
  Eye,
  Trash2,
  RotateCcw,
  Printer,
  Lock,
  MessageCircle,
  Download,
} from "lucide-react";
import { exportCSV } from "@/lib/export-csv";
import type { Sale, Shop } from "@/types";

export default function SalesPage() {
  useRequirePermission("sales");
  const [sales, setSales] = useState<Sale[]>([]);
  const [deletedSales, setDeletedSales] = useState<Sale[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("active");
  const [userId, setUserId] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [shop, setShop] = useState<Shop | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSale, setPreviewSale] = useState<Sale | null>(null);
  const [previewType, setPreviewType] = useState<"thermal_50mm" | "a5">("a5");
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    getShopInfo().then(setShop);
    getCurrentUser().then((u) => {
      if (u) setUserId(u.id);
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadSalesOffline() as unknown as Sale[];
      setSales(data.filter((s) => !s.deleted_at));
      setDeletedSales(data.filter((s) => s.deleted_at));
    } catch {
      try {
        const shopId = await getShopId();
        if (!shopId) { setLoading(false); return; }
        const [activeRes, deletedRes] = await Promise.all([
          supabase.from("sales").select("*").eq("shop_id", shopId).is("deleted_at", null).order("created_at", { ascending: false }).limit(100),
          supabase.from("sales").select("*").eq("shop_id", shopId).not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(50),
        ]);
        if (activeRes.data) setSales(activeRes.data as Sale[]);
        if (deletedRes.data) setDeletedSales(deletedRes.data as Sale[]);
      } catch {}
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const adjustStockForSale = async (sale: Sale, direction: "add" | "remove") => {
    if (!Array.isArray(sale.items)) return;
    for (const item of sale.items) {
      if (!item.product_id) continue;
      const multiplier = direction === "add" ? 1 : -1;
      const qty = (item.qty || 0) * multiplier;
      if (isOnlineSync()) {
        const { data: prod } = await supabase.from("products").select("stock").eq("id", item.product_id).single();
        if (prod) {
          const newStock = Math.max(0, (prod.stock || 0) + qty);
          await supabase.from("products").update({ stock: newStock }).eq("id", item.product_id);
        }
      }
    }
  };

  const handleDelete = async (saleId: string) => {
    const valid = await requirePinAction(userId, pinInput, "delete_sale", "sale", saleId);
    if (!valid) { setPinError(true); return; }
    if (!isOnlineSync()) {
      await deleteSaleOffline(saleId);
      const cached = await getCachedSales();
      const updated = cached.map((s) => s.id === saleId ? { ...s, deleted_at: new Date().toISOString(), updatedAt: new Date().toISOString() } : s);
      await cacheSales(updated as any);
      setDeleteTarget(null);
      setPinInput("");
      setPinError(false);
      load();
      return;
    }
    const shopId = await getShopId();
    if (!shopId) return;
    const { data: sale } = await supabase.from("sales").select("*").eq("id", saleId).eq("shop_id", shopId).single();
    if (!sale) return;
    // Find and delete linked credit
    const { data: linkedCredits } = await supabase.from("credits").select("id,paid,sale_id,note").or(`sale_id.eq.${saleId},note.ilike.%${sale.invoice_number}%`).eq("shop_id", shopId);
    if (linkedCredits && linkedCredits.length > 0) {
      for (const credit of linkedCredits) {
        // Restore stock if credit wasn't fully paid (stock already restored via adjustStockForSale if paid)
        if (credit.paid && credit.paid > 0 && sale.items && Array.isArray(sale.items)) {
          for (const item of sale.items) {
            if (!item.product_id) continue;
            const { data: prod } = await supabase.from("products").select("stock").eq("id", item.product_id).single();
            if (prod) {
              const restoreQty = Math.round((credit.paid / (sale.total > 0 ? sale.total : 1)) * item.qty);
              await supabase.from("products").update({ stock: Math.max(0, (prod.stock || 0) - restoreQty) }).eq("id", item.product_id);
            }
          }
        }
        await supabase.from("credits").delete().eq("id", credit.id).eq("shop_id", shopId);
      }
    }
    await adjustStockForSale(sale as Sale, "add");
    // Create refund entry if part of this sale was paid
    if ((sale.total || 0) > 0) {
      try {
        await supabase.from("accounting_entries").insert({
          shop_id: shopId,
          type: "refund",
          amount: -(sale.total || 0),
          payment_method: sale.payment || "especes",
          reference: `Remb-${sale.invoice_number}-${Date.now()}`,
          description: `Annulation vente ${sale.invoice_number} - ${sale.client || "client"}`,
          entry_date: new Date().toISOString().split("T")[0],
          created_by: userId,
        });
      } catch {}
    }
    await supabase.from("sales").update({ deleted_at: new Date().toISOString() }).eq("id", saleId).eq("shop_id", shopId);
    setDeleteTarget(null);
    setPinInput("");
    setPinError(false);
    load();
  };

  const handleRestore = async (saleId: string) => {
    const shopId = await getShopId();
    if (!shopId) return;
    if (!isOnlineSync()) {
      await updateSaleOffline(saleId, { deleted_at: null });
      const cached = await getCachedSales();
      const updated = cached.map((s) => s.id === saleId ? { ...s, deleted_at: null, updatedAt: new Date().toISOString() } : s);
      await cacheSales(updated as any);
      load();
      return;
    }
    const { data: sale } = await supabase.from("sales").select("*").eq("id", saleId).eq("shop_id", shopId).single();
    if (sale) {
      await adjustStockForSale(sale as Sale, "remove");
    }
    await supabase.from("sales").update({ deleted_at: null }).eq("id", saleId).eq("shop_id", shopId);
    load();
  };

  const handlePrintInvoice = () => {
    const sel = previewType === "thermal_50mm" ? ".print-thermal" : ".a5-print-sale";
    const el = document.querySelector(sel);
    if (!el) { window.print(); return; }
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(".print-hide").forEach((n) => n.remove());
    clone.style.cssText = `margin:0 auto;background:white;${previewType === "thermal_50mm" ? "width:48mm;padding:2mm" : "width:138mm;padding:0"}`;
    const styles = Array.from(document.querySelectorAll("style, link[rel=stylesheet]")).map((s) => s.outerHTML).join("\n");
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;top:-9999px;left:0;width:0;height:0;border:none";
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow!.document;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><title>Facture</title>${styles}<style>
      @page{margin:${previewType === "thermal_50mm" ? "2mm" : "3mm"};size:${previewType === "thermal_50mm" ? "auto" : "A5 portrait"}}
      body{margin:0;padding:0;background:white;display:flex;justify-content:center}
      *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    </style></head><body>${clone.outerHTML}</body></html>`);
    doc.close();
    setTimeout(() => { iframe.contentWindow!.print(); setTimeout(() => iframe.remove(), 1000); }, 600);
  };

  const totalCA = sales.reduce((s, v) => s + (v.total || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ventes</h1>
          <p className="text-sm text-muted-foreground">
            {sales.length} ventes · {totalCA.toLocaleString()} FCFA total
          </p>
        </div>
        <Button variant="outline" onClick={() => exportCSV(sales, "ventes", [
          { key: "invoice_number", label: "Facture" },
          { key: "date", label: "Date" },
          { key: "client", label: "Client" },
          { key: "type", label: "Type" },
          { key: "payment", label: "Paiement" },
          { key: "vendor", label: "Vendeur" },
          { key: "total", label: "Total" },
          { key: "profit", label: "Profit" },
        ])}><Download className="h-4 w-4 mr-2" /> Export CSV</Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Rechercher par client..." className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="active">Ventes ({sales.length})</TabsTrigger>
          <TabsTrigger value="deleted">Corbeille ({deletedSales.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Facture</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Paiement</TableHead>
                  <TableHead>Vendeur</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Marge</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Chargement...</TableCell></TableRow>
                ) : sales.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    <Receipt className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    Aucune vente
                  </TableCell></TableRow>
                ) : sales.slice((page - 1) * pageSize, page * pageSize).map((s) => {
                  const dt = s.created_at ? new Date(s.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : s.date;
                  return (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">{s.invoice_number}</TableCell>
                    <TableCell className="text-xs">{dt}</TableCell>
                    <TableCell>{s.client || "-"}{s.client_phone ? ` (${s.client_phone})` : ""}</TableCell>
                    <TableCell className="text-xs">{s.type === "wholesale" ? "Gros" : "Détail"}</TableCell>
                    <TableCell className="capitalize text-xs">{s.payment}</TableCell>
                    <TableCell className="text-xs">{s.vendor || "-"}</TableCell>
                    <TableCell className="text-right font-medium">{s.total?.toLocaleString()} FCFA</TableCell>
                    <TableCell className="text-right text-emerald-400">{s.profit?.toLocaleString()} FCFA</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setPreviewSale(s); setPreviewOpen(true); }}>
                          <Eye className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400" onClick={() => setDeleteTarget(s.id)}>
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
          {sales.length > pageSize && (
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Lignes par page:</span>
                <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                  <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[10, 20, 50, 100].map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page === 1} onClick={() => setPage(page - 1)}>Précédent</Button>
                <span className="text-xs text-muted-foreground">Page {page}/{Math.ceil(sales.length / pageSize)}</span>
                <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page >= Math.ceil(sales.length / pageSize)} onClick={() => setPage(page + 1)}>Suivant</Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="deleted" className="mt-4">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Facture</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Supprimé le</TableHead>
                  <TableHead className="w-20">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deletedSales.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    <Trash2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    Corbeille vide
                  </TableCell></TableRow>
                ) : deletedSales.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">{s.invoice_number}</TableCell>
                    <TableCell>{s.created_at ? new Date(s.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : s.date}</TableCell>
                    <TableCell>{s.client || "-"}</TableCell>
                    <TableCell className="text-right">{s.total?.toLocaleString()} FCFA</TableCell>
                    <TableCell className="text-xs">{s.deleted_at ? new Date(s.deleted_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-400" onClick={() => handleRestore(s.id)}>
                        <RotateCcw className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Aperçu facture professionnel A5/Thermique ── */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className={previewType === "thermal_50mm" ? "max-w-[320px]" : "max-w-3xl"}>
          <DialogHeader className="print-hide">
            <div className="flex items-center justify-between">
              <DialogTitle>Aperçu facture</DialogTitle>
              <div className="flex gap-1 rounded-lg border p-0.5">
                <Button variant={previewType === "thermal_50mm" ? "secondary" : "ghost"} size="sm" className="h-7 text-xs" onClick={() => setPreviewType("thermal_50mm")}>50mm</Button>
                <Button variant={previewType === "a5" ? "secondary" : "ghost"} size="sm" className="h-7 text-xs" onClick={() => setPreviewType("a5")}>A5</Button>
              </div>
            </div>
          </DialogHeader>

          {previewSale && (() => {
            const dt = previewSale.created_at ? new Date(previewSale.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : previewSale.date;
            return (
            <>
              {previewType === "thermal_50mm" ? (
                <div className="space-y-2 text-xs print-thermal">
                  <div className="text-center border-b pb-2">
                    {shop?.logo && <img src={shop.logo} alt="" className="mx-auto mb-1 h-8" />}
                    <p className="font-bold text-sm">{shop?.name || "Boutique"}</p>
                    {shop?.address && <p className="text-muted-foreground">{shop.address}</p>}
                    {shop?.phone && <p className="text-muted-foreground">Tél: {shop.phone}</p>}
                  </div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Facture</span><span className="font-bold">{previewSale.invoice_number}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span>{dt}</span></div>
                  {previewSale.client && <div className="flex justify-between"><span className="text-muted-foreground">Client</span><span>{previewSale.client}</span></div>}
                  <div className="border-t pt-1">
                    {Array.isArray(previewSale.items) && previewSale.items.map((item, i) => (
                      <div key={i} className="flex justify-between py-0.5">
                        <span>{item.product_name} x{item.qty}</span>
                        <span>{item.total?.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between font-bold border-t pt-1">
                    <span>Total</span>
                    <span>{previewSale.total?.toLocaleString()} FCFA</span>
                  </div>
                  <p className="text-center text-muted-foreground pt-1">Merci de votre confiance !</p>
                  <Button onClick={handlePrintInvoice} className="w-full h-7 text-[10px] print-hide">
                    <Printer className="h-3 w-3 mr-1" /> Imprimer
                  </Button>
                </div>
              ) : (
                <div className="w-[148mm] min-h-[210mm] mx-auto bg-white text-xs leading-snug a5-print-sale">
                  <div className="relative overflow-hidden bg-[#4A0E2E] text-white" style={{ background: 'linear-gradient(135deg, #4A0E2E 0%, #6B1A44 100%)' }}>
                    <div className="absolute top-0 right-0 w-24 h-24 rounded-full bg-white/5 -translate-y-1/2 translate-x-1/4" />
                    <div className="relative z-10 flex items-start justify-between px-4 py-[7mm]">
                      <div className="flex items-start gap-3">
                        <div className="w-[36px] h-[36px] rounded-lg bg-[#F5E6D3] flex items-center justify-center text-[#4A0E2E] font-bold text-sm shadow overflow-hidden flex-shrink-0">
                          {shop?.logo ? <img src={shop.logo} alt="" className="w-full h-full object-cover" /> : shop?.name?.charAt(0) || "B"}
                        </div>
                        <div>
                          <div className="text-sm font-bold tracking-tight">{shop?.name || "Boutique"}</div>
                          <div className="text-[9px] text-white/70 leading-tight">{shop?.address || "Dakar, Sénégal"}</div>
                          <div className="text-[9px] text-white/70 leading-tight">{shop?.phone || "+221 00 000 00 00"}</div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="inline-block px-2.5 py-0.5 rounded-full bg-[#F5E6D3] text-[#4A0E2E] text-[9px] font-bold tracking-wider mb-1">FACTURE</div>
                        <div className="text-[10px] font-mono text-white/90 leading-tight">{previewSale.invoice_number}</div>
                        <div className="text-[9px] text-white/70 leading-tight">{dt}</div>
                        {previewSale.status === "completed" && (
                          <div className="inline-block mt-0.5 px-2 py-[1px] rounded-full bg-emerald-500/20 text-emerald-300 text-[8px] font-semibold border border-emerald-400/30">PAYÉE</div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 px-4 mt-[5mm]">
                    <div className="rounded-lg border border-[#F0E6D8] bg-[#FDF8F4] px-3 py-[4mm]">
                      <div className="text-[8px] font-semibold text-[#4A0E2E] tracking-wider mb-1">ÉMETTEUR</div>
                      <div className="text-[10px] font-medium leading-tight">{shop?.name || "Boutique"}</div>
                      <div className="text-[8px] text-gray-500 leading-tight">{shop?.address || "Dakar, Sénégal"}</div>
                      <div className="text-[8px] text-gray-500 leading-tight">Tél: {shop?.phone || "+221 00 000 00 00"}</div>
                    </div>
                    <div className="rounded-lg border border-[#F0E6D8] bg-[#FDF8F4] px-3 py-[4mm]">
                      <div className="text-[8px] font-semibold text-[#4A0E2E] tracking-wider mb-1">FACTURE À</div>
                      <div className="text-[10px] font-bold leading-tight">{previewSale.client || "Client"}</div>
                      {previewSale.client_phone && <div className="text-[8px] text-gray-500 leading-tight">{previewSale.client_phone}</div>}
                      <div className="mt-1 flex gap-3 text-[8px] text-gray-500">
                        <span>Paiement: <span className="font-medium capitalize text-gray-700">{previewSale.payment}</span></span>
                        <span>Type: <span className="font-medium text-gray-700">{previewSale.type === "wholesale" ? "Gros" : "Détail"}</span></span>
                      </div>
                    </div>
                  </div>
                  <div className="mx-4 mt-[4mm] overflow-hidden rounded-lg border border-[#F0E6D8]">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-[#4A0E2E] text-white text-[8px] uppercase tracking-wider">
                          <th className="text-left px-3 py-[3mm] font-medium">Désignation</th>
                          <th className="text-center px-2 py-[3mm] font-medium">Qté</th>
                          <th className="text-right px-2 py-[3mm] font-medium">Prix unit.</th>
                          <th className="text-right px-3 py-[3mm] font-medium">Montant</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.isArray(previewSale.items) && previewSale.items.length > 0 ? previewSale.items.map((item, i) => (
                          <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-[#FDF8F4]"}>
                            <td className="px-3 py-[2.5mm] text-[9px] font-medium">{item.product_name}</td>
                            <td className="px-2 py-[2.5mm] text-center text-[9px]">{item.qty}</td>
                            <td className="px-2 py-[2.5mm] text-right text-[9px]">{item.price?.toLocaleString()}</td>
                            <td className="px-3 py-[2.5mm] text-right text-[9px] font-semibold">{item.total?.toLocaleString()} FCFA</td>
                          </tr>
                        )) : (
                          <tr><td colSpan={4} className="px-4 py-[8mm] text-center text-gray-400 text-[9px]">Aucun article</td></tr>
                        )}
                      </tbody>
                    </table>
                    <div className="border-t border-[#F0E6D8] px-3 py-[2mm] flex justify-between text-[9px] bg-[#FDF8F4]">
                      <span className="text-gray-500">Sous-total HT</span>
                      <span className="font-semibold">{previewSale.total?.toLocaleString()} FCFA</span>
                    </div>
                  </div>
                  <div className="mx-4 mt-[4mm] rounded-lg bg-[#4A0E2E] px-4 py-[3.5mm] flex items-center justify-between text-white" style={{ background: 'linear-gradient(135deg, #4A0E2E 0%, #6B1A44 100%)' }}>
                    <div className="text-[10px] font-medium tracking-wider">TOTAL TTC</div>
                    <div className="text-base font-bold tracking-tight">{previewSale.total?.toLocaleString()} FCFA</div>
                  </div>
                  <div className="mx-4 mt-[3mm] rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-[2.5mm]">
                    <div className="text-[8px] font-semibold text-emerald-700">NOTE</div>
                    <div className="text-[8px] text-emerald-600">Merci pour votre confiance !</div>
                  </div>
                  <div className="mx-4 mt-[3mm] text-center text-[8px] text-gray-400 border-t border-[#F0E6D8] pt-[2.5mm] leading-tight">
                    <div className="font-medium text-[#4A0E2E]">{shop?.name || "Boutique"} — {shop?.address || "Dakar, Sénégal"}</div>
                    <div>Tél: {shop?.phone || "+221 00 000 00 00"} | {shop?.email || "contact@boutique.sn"}</div>
                    <div className="opacity-50">Facture {previewSale.invoice_number} du {dt}</div>
                  </div>
                  <div className="flex gap-2 mx-4 mt-[4mm] mb-2 print-hide">
                    <Button onClick={handlePrintInvoice} className="flex-1 h-8 text-xs">
                      <Printer className="h-3 w-3 mr-1" /> Imprimer
                    </Button>
                    <Button variant="outline" className="flex-1 h-8 text-xs" onClick={() => {
                      const msg = `*${shop?.name || "Boutique"}*\nFacture: ${previewSale?.invoice_number}\nDate: ${dt}\nTotal: ${previewSale?.total?.toLocaleString()} FCFA`;
                      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
                    }}>
                      <MessageCircle className="h-3 w-3 mr-1 text-green-500" /> WhatsApp
                    </Button>
                  </div>
                </div>
              )}
            </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) { setDeleteTarget(null); setPinInput(""); setPinError(false); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4" /> Supprimer la vente
            </AlertDialogTitle>
            <AlertDialogDescription>
              Cette action dǸplacera la vente dans la corbeille. Entrez votre code secret pour confirmer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            type="password"
            placeholder="Code secret"
            value={pinInput}
            onChange={(e) => { setPinInput(e.target.value); setPinError(false); }}
            maxLength={6}
            className="text-center text-lg tracking-widest"
          />
          {pinError && <p className="text-sm text-red-500 text-center">Code secret incorrect</p>}
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && handleDelete(deleteTarget)}>Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
