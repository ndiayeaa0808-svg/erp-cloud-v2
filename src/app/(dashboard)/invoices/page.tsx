"use client";

import { useRequirePermission } from "@/lib/use-permission";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";
import { getShopId, getShopInfo, getCurrentUser, requirePinAction, logAudit } from "@/lib/security";
import { isOnlineSync } from "@/lib/is-online";
import { loadSalesOffline } from "@/lib/offline-data";
import { updateSaleOffline } from "@/lib/sync/sync";
import { getCachedSales, cacheSales } from "@/lib/sync/db";
import type { CachedSale } from "@/lib/sync/db";
import {
  Search,
  Printer,
  Eye,
  Receipt,
  Building,
  MessageCircle,
  Trash2,
  Lock,
  RotateCcw,
} from "lucide-react";
import type { Sale, Shop } from "@/types";

export default function InvoicesPage() {
  useRequirePermission("invoices");
  const [sales, setSales] = useState<Sale[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [shop, setShop] = useState<Shop | null>(null);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [previewType, setPreviewType] = useState<"thermal_50mm" | "a5">("thermal_50mm");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const invoiceRef = useRef<HTMLDivElement>(null);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    getShopInfo().then(setShop);
    getCurrentUser().then((u) => { if (u) setUserId(u.id); });
  }, []);

  const [tab, setTab] = useState("all");
  const [deletedSales, setDeletedSales] = useState<Sale[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const shopId = await getShopId();
    if (!shopId) { setLoading(false); return; }

    if (!isOnlineSync()) {
      const cached = await loadSalesOffline();
      setSales(cached.filter((s) => !s.deleted_at) as unknown as Sale[]);
      setDeletedSales(cached.filter((s) => s.deleted_at) as unknown as Sale[]);
      setLoading(false);
      return;
    }

    const queryDeleted = tab === "deleted";

    // Always build a fresh base query for each attempt (Supabase mutates the builder)
    const buildQuery = () => {
      let q = supabase.from("sales").select("*").eq("shop_id", shopId).order("created_at", { ascending: false });
      if (search) q = q.ilike("client", `%${search}%`);
      return q;
    };

    if (queryDeleted) {
      let q = buildQuery();
      let { data, error } = await q.not("invoice_deleted_at", "is", null).limit(100);
      if (error) {
        const { data: fallback } = await buildQuery().limit(100);
        if (fallback) setDeletedSales(fallback.filter((s: Sale) => s.deleted_at) as Sale[]);
      } else if (data) {
        setDeletedSales(data as Sale[]);
      }
    } else {
      let q = buildQuery();
      let { data, error } = await q.is("invoice_deleted_at", null).limit(100);
      if (error) {
        const { data: fallback } = await buildQuery().limit(100);
        if (fallback) setSales(fallback.filter((s: Sale) => !s.deleted_at) as Sale[]);
      } else if (data) {
        setSales(data as Sale[]);
      }
    }
    setLoading(false);
  }, [search, supabase, tab]);

  useEffect(() => { load(); }, [load]);

  const openPreview = (sale: Sale) => {
    setSelectedSale(sale);
    setPreviewOpen(true);
  };

  const handlePrint = () => {
    const el = previewType === "thermal_50mm"
      ? document.querySelector<HTMLElement>(".print-thermal")
      : invoiceRef.current;
    if (!el) return;

    // Clone invoice content, strip print-hide elements
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(".print-hide").forEach((n) => n.remove());
    clone.style.cssText = `margin:0 auto;background:white;${previewType === "thermal_50mm" ? "width:48mm;padding:2mm" : "width:138mm;padding:0"}`;

    // Collect all CSS from the document
    const styles = Array.from(document.querySelectorAll("style, link[rel=stylesheet]"))
      .map((s) => s.outerHTML).join("\n");

    const isThermal = previewType === "thermal_50mm";
    const pageSize = isThermal ? "auto" : "A5 portrait";
    const pageMargin = isThermal ? "2mm" : "3mm";

    // Build standalone print document in an invisible iframe
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;top:-9999px;left:0;width:0;height:0;border:none";
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow!.document;
    doc.open();
    doc.write(`<!DOCTYPE html>
<html>
<head><title>Facture</title>
${styles}
<style>
  @page { margin:${pageMargin}; size:${pageSize}; }
  body { margin:0; padding:0; background:white; display:flex; justify-content:center; }
  * { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
</style>
</head>
<body>${clone.outerHTML}</body>
</html>`);
    doc.close();
    // Wait for styles to load then print
    setTimeout(() => { iframe.contentWindow!.print(); setTimeout(() => iframe.remove(), 1000); }, 600);
  };

  const handleShareImage = async () => {
    if (!invoiceRef.current) return;
    setSharing(true);
    try {
      await new Promise((r) => requestAnimationFrame(r));

      // Pre-fetch all external stylesheets and strip unsupported CSS functions
      const cssPatches: { href: string; text: string }[] = [];
      for (const link of document.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet]")) {
        try {
          const res = await fetch(link.href);
          const text = await res.text();
          cssPatches.push({ href: link.href, text });
        } catch { /* skip cross-origin */ }
      }

      const canvas = await html2canvas(invoiceRef.current, {
        scale: 2, useCORS: true, allowTaint: true,
        backgroundColor: "#ffffff",
        onclone: (doc) => {
          const patchCss = (css: string) =>
            css
              .replace(/color-mix\s*\(\s*in\s+oklab\s*[^)]*\)/gi, "transparent")
              .replace(/lab\(\s*[^)]*\)/gi, "transparent")
              .replace(/lch\(\s*[^)]*\)/gi, "transparent");
          doc.querySelectorAll("link[rel=stylesheet]").forEach((l) => {
            const href = (l as HTMLLinkElement).href;
            const patch = cssPatches.find((p) => p.href === href);
            if (patch) {
              const s = doc.createElement("style");
              s.textContent = patchCss(patch.text);
              l.replaceWith(s);
            }
          });
          doc.querySelectorAll("style").forEach((s) => {
            if (s.textContent) s.textContent = patchCss(s.textContent);
          });
        },
      });
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      const pdf = new jsPDF({ format: "a4", orientation: "portrait", unit: "mm" });
      const imgW = 190;
      const imgH = (canvas.height / canvas.width) * imgW;
      pdf.addImage(imgData, "JPEG", 10, 10, imgW, imgH);
      const pdfBlob = pdf.output("blob");
      const file = new File([pdfBlob], `facture_${selectedSale?.invoice_number || "invoice"}.pdf`, { type: "application/pdf" });
      try {
        if (typeof navigator.canShare !== "undefined" && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: `Facture ${selectedSale?.invoice_number}` });
          setSharing(false);
          return;
        }
      } catch { /* fall through to download */ }
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `facture_${selectedSale?.invoice_number || "invoice"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Capture/PDF failed", e);
    } finally {
      setSharing(false);
    }
  };

  const handleRestoreInvoice = async (id: string) => {
    const shopId = await getShopId();
    if (!shopId) return;
    if (!isOnlineSync()) {
      await updateSaleOffline(id, { invoice_deleted_at: null });
      const cached = await getCachedSales();
      const updated = cached.map((s) => s.id === id ? { ...s, invoice_deleted_at: null, updatedAt: new Date().toISOString() } : s);
      await cacheSales(updated as CachedSale[]);
      load();
      return;
    }
    await supabase.from("sales").update({ invoice_deleted_at: null }).eq("id", id).eq("shop_id", shopId);
    logAudit({ action: "restore_invoice", entity: "sales", entity_id: id, data: {} });
    load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const valid = await requirePinAction(userId, pinInput, "delete_invoice", "sale", deleteTarget);
    if (!valid) { setPinError(true); return; }
    if (!isOnlineSync()) {
      await updateSaleOffline(deleteTarget, { invoice_deleted_at: new Date().toISOString() });
      const cached = await getCachedSales();
      const updated = cached.map((s) => s.id === deleteTarget ? { ...s, invoice_deleted_at: new Date().toISOString(), updatedAt: new Date().toISOString() } : s);
      await cacheSales(updated as CachedSale[]);
      setDeleteTarget(null);
      setPinInput("");
      setPinError(false);
      load();
      return;
    }
    const shopId = await getShopId();
    if (!shopId) return;
    await supabase.from("sales").update({ invoice_deleted_at: new Date().toISOString() }).eq("id", deleteTarget).eq("shop_id", shopId);
    logAudit({ action: "delete_invoice", entity: "sales", entity_id: deleteTarget, data: {} });
    setDeleteTarget(null);
    setPinInput("");
    setPinError(false);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Facturation</h1>
          <p className="text-sm text-muted-foreground">{tab === "deleted" ? deletedSales.length : sales.length} factures</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <Building className="h-3 w-3" /> {shop?.name || "Boutique"}
          </Badge>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Rechercher par client..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Tabs defaultValue="all" value={tab} onValueChange={(v) => setTab(v)}>
        <TabsList>
          <TabsTrigger value="all">Toutes</TabsTrigger>
          <TabsTrigger value="deleted">Supprimées</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Facture</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Paiement</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Chargement...</TableCell></TableRow>
                ) : sales.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    <Receipt className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    Aucune facture
                  </TableCell></TableRow>
                ) : sales.map((s) => {
                  const dt = s.created_at ? new Date(s.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : s.date;
                  return (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">{s.invoice_number}</TableCell>
                    <TableCell>{dt}</TableCell>
                    <TableCell>{s.client || "-"}{s.client_phone ? ` (${s.client_phone})` : ""}</TableCell>
                    <TableCell className="capitalize">{s.payment}</TableCell>
                    <TableCell>
                      {s.status === "completed" ? (
                        <Badge className="bg-emerald-500/20 text-emerald-600 border-emerald-300 text-xs">Payée</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">Impayée</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">{s.total?.toLocaleString()} FCFA</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openPreview(s)}>
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
                  <TableHead>Supprimée le</TableHead>
                  <TableHead className="w-20">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Chargement...</TableCell></TableRow>
                ) : deletedSales.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    <Trash2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    Corbeille vide
                  </TableCell></TableRow>
                ) : deletedSales.map((s) => {
                  const dt = s.created_at ? new Date(s.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : s.date;
                  return (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">{s.invoice_number}</TableCell>
                    <TableCell>{dt}</TableCell>
                    <TableCell>{s.client || "-"}</TableCell>
                    <TableCell className="text-right">{s.total?.toLocaleString()} FCFA</TableCell>
                    <TableCell className="text-xs">{s.invoice_deleted_at ? new Date(s.invoice_deleted_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-400" onClick={() => handleRestoreInvoice(s.id)}>
                        <RotateCcw className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className={`${previewType === "thermal_50mm" ? "max-w-[320px]" : "max-w-3xl"}`}>
          <DialogHeader className="print-hide">
            <div className="flex items-center justify-between">
              <DialogTitle>Aperçu facture</DialogTitle>
              <div className="flex gap-1 rounded-lg border p-0.5">
                <Button variant={previewType === "thermal_50mm" ? "secondary" : "ghost"} size="sm" className="h-7 text-xs" onClick={() => setPreviewType("thermal_50mm")}>50mm</Button>
                <Button variant={previewType === "a5" ? "secondary" : "ghost"} size="sm" className="h-7 text-xs" onClick={() => setPreviewType("a5")}>A5</Button>
              </div>
            </div>
          </DialogHeader>

              {selectedSale && (() => {
                const previewDt = selectedSale.created_at ? new Date(selectedSale.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : selectedSale.date;
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
                  <div className="flex justify-between"><span className="text-muted-foreground">Facture</span><span className="font-bold">{selectedSale.invoice_number}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span>{previewDt}</span></div>
                  {selectedSale.client && <div className="flex justify-between"><span className="text-muted-foreground">Client</span><span>{selectedSale.client}</span></div>}
                  <div className="border-t pt-1">
                    {Array.isArray(selectedSale.items) && selectedSale.items.map((item, i) => (
                      <div key={i} className="flex justify-between py-0.5">
                        <span>{item.product_name} x{item.qty}</span>
                        <span>{item.total?.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between font-bold border-t pt-1">
                    <span>Total</span>
                    <span>{selectedSale.total?.toLocaleString()} FCFA</span>
                  </div>
                  <p className="text-center text-muted-foreground pt-1">Merci de votre confiance !</p>
                  <Button onClick={handlePrint} className="w-full h-7 text-[10px] print-hide">
                    <Printer className="h-3 w-3 mr-1" /> Imprimer
                  </Button>
                </div>
              ) : (
                <div ref={invoiceRef} className="w-[148mm] min-h-[210mm] mx-auto bg-white text-xs leading-snug print-full print-full-a5">
                  {/* ── EN-TÊTE (hauteur ~28mm) ── */}
                  <div className="relative overflow-hidden bg-[#4A0E2E] text-white" style={{ background: 'linear-gradient(135deg, #4A0E2E 0%, #6B1A44 100%)' }}>
                    <div className="absolute top-0 right-0 w-24 h-24 rounded-full bg-white/5 -translate-y-1/2 translate-x-1/4" />
                    <div className="relative z-10 flex items-start justify-between px-4 py-[7mm]">
                      <div className="flex items-start gap-3">
                        <div className="w-[36px] h-[36px] rounded-lg bg-[#F5E6D3] flex items-center justify-center text-[#4A0E2E] font-bold text-sm shadow overflow-hidden flex-shrink-0">
                          {shop?.logo ? (
                            <img src={shop.logo} alt="" className="w-full h-full object-cover" />
                          ) : (
                            shop?.name?.charAt(0) || "B"
                          )}
                        </div>
                        <div>
                          <div className="text-sm font-bold tracking-tight">{shop?.name || "Boutique"}</div>
                          <div className="text-[9px] text-white/70 leading-tight">{shop?.address || "Dakar, Sénégal"}</div>
                          <div className="text-[9px] text-white/70 leading-tight">{shop?.phone || "+221 00 000 00 00"}</div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="inline-block px-2.5 py-0.5 rounded-full bg-[#F5E6D3] text-[#4A0E2E] text-[9px] font-bold tracking-wider mb-1">FACTURE</div>
                        <div className="text-[10px] font-mono text-white/90 leading-tight">{selectedSale.invoice_number}</div>
                        <div className="text-[9px] text-white/70 leading-tight">{previewDt}</div>
                        {selectedSale.status === "completed" && (
                          <div className="inline-block mt-0.5 px-2 py-[1px] rounded-full bg-emerald-500/20 text-emerald-300 text-[8px] font-semibold border border-emerald-400/30">PAYÉE</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ── INFOS (hauteur ~18mm) ── */}
                  <div className="grid grid-cols-2 gap-3 px-4 mt-[5mm]">
                    <div className="rounded-lg border border-[#F0E6D8] bg-[#FDF8F4] px-3 py-[4mm]">
                      <div className="text-[8px] font-semibold text-[#4A0E2E] tracking-wider mb-1">ÉMETTEUR</div>
                      <div className="text-[10px] font-medium leading-tight">{shop?.name || "Boutique"}</div>
                      <div className="text-[8px] text-gray-500 leading-tight">{shop?.address || "Dakar, Sénégal"}</div>
                      <div className="text-[8px] text-gray-500 leading-tight">Tél: {shop?.phone || "+221 00 000 00 00"}</div>
                    </div>
                    <div className="rounded-lg border border-[#F0E6D8] bg-[#FDF8F4] px-3 py-[4mm]">
                      <div className="text-[8px] font-semibold text-[#4A0E2E] tracking-wider mb-1">FACTURE À</div>
                      <div className="text-[10px] font-bold leading-tight">{selectedSale.client || "Client"}</div>
                      {selectedSale.client_phone && <div className="text-[8px] text-gray-500 leading-tight">{selectedSale.client_phone}</div>}
                      <div className="mt-1 flex gap-3 text-[8px] text-gray-500">
                        <span>Paiement: <span className="font-medium capitalize text-gray-700">{selectedSale.payment}</span></span>
                        <span>Type: <span className="font-medium text-gray-700">{selectedSale.type === "wholesale" ? "Gros" : "Détail"}</span></span>
                      </div>
                    </div>
                  </div>

                  {/* ── TABLEAU PRODUITS (hauteur ~100mm) ── */}
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
                        {Array.isArray(selectedSale.items) && selectedSale.items.length > 0 ? selectedSale.items.map((item, i) => (
                          <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-[#FDF8F4]"}>
                            <td className="px-3 py-[2.5mm] text-[9px] font-medium">{item.product_name}</td>
                            <td className="px-2 py-[2.5mm] text-center text-[9px]">{item.qty}</td>
                            <td className="px-2 py-[2.5mm] text-right text-[9px]">{item.price?.toLocaleString()}</td>
                            <td className="px-3 py-[2.5mm] text-right text-[9px] font-semibold">{item.total?.toLocaleString()} FCFA</td>
                          </tr>
                        )) : (
                          <tr>
                            <td colSpan={4} className="px-4 py-[8mm] text-center text-gray-400 text-[9px]">Aucun article</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                    <div className="border-t border-[#F0E6D8] px-3 py-[2mm] flex justify-between text-[9px] bg-[#FDF8F4]">
                      <span className="text-gray-500">Sous-total HT</span>
                      <span className="font-semibold">{selectedSale.total?.toLocaleString()} FCFA</span>
                    </div>
                  </div>

                  {/* ── TOTAL (hauteur ~12mm) ── */}
                  <div className="mx-4 mt-[4mm] rounded-lg bg-[#4A0E2E] px-4 py-[3.5mm] flex items-center justify-between text-white" style={{ background: 'linear-gradient(135deg, #4A0E2E 0%, #6B1A44 100%)' }}>
                    <div className="text-[10px] font-medium tracking-wider">TOTAL TTC</div>
                    <div className="text-base font-bold tracking-tight">{selectedSale.total?.toLocaleString()} FCFA</div>
                  </div>

                  {/* ── NOTE (hauteur ~8mm) ── */}
                  <div className="mx-4 mt-[3mm] rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-[2.5mm]">
                    <div className="text-[8px] font-semibold text-emerald-700">NOTE</div>
                    <div className="text-[8px] text-emerald-600">Merci pour votre confiance !</div>
                  </div>

                  {/* ── PIED DE PAGE (hauteur ~8mm) ── */}
                  <div className="mx-4 mt-[3mm] text-center text-[8px] text-gray-400 border-t border-[#F0E6D8] pt-[2.5mm] leading-tight">
                    <div className="font-medium text-[#4A0E2E]">{shop?.name || "Boutique"} — {shop?.address || "Dakar, Sénégal"}</div>
                    <div>Tél: {shop?.phone || "+221 00 000 00 00"} | {shop?.email || "contact@boutique.sn"}</div>
                    <div className="opacity-50">Facture {selectedSale.invoice_number} du {previewDt}</div>
                  </div>

                  {/* ── BOUTONS (cachés à l'impression) ── */}
                  <div className="flex gap-2 mx-4 mt-[4mm] mb-2 print-hide">
                    <Button onClick={handlePrint} className="flex-1 h-8 text-xs">
                      <Printer className="h-3 w-3 mr-1" /> Imprimer
                    </Button>
                    <Button variant="outline" className="flex-1 h-8 text-xs" disabled={sharing} onClick={handleShareImage}>
                      <MessageCircle className="h-3 w-3 mr-1 text-green-500" /> {sharing ? "..." : "WhatsApp"}
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
              <Lock className="h-4 w-4" /> Supprimer la facture
            </AlertDialogTitle>
            <AlertDialogDescription>
              Cette action supprimera la facture (la vente reste dans l'historique). Entrez votre code secret pour confirmer.
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
            <AlertDialogAction onClick={handleDelete}>Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
