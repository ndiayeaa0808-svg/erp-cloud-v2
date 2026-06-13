"use client";

import { useRequirePermission } from "@/lib/use-permission";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { getShopId, getShopInfo, getCurrentUser, logAudit, requirePinAction } from "@/lib/security";
import { isOnline as checkIsOnline, isOnlineSync } from "@/lib/is-online";
import { loadProductsOffline } from "@/lib/offline-data";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  Check,
  Package,
  Receipt,
  Printer,
  Square,
  Lock,
  MessageCircle,
  WifiOff,
} from "lucide-react";
import type { Shop } from "@/types";

interface CartItem {
  product_id: string;
  product_name: string;
  qty: number;
  price: number;
  cost: number;
  total: number;
  stock: number;
  photo?: string;
}

interface Product {
  id: string;
  name: string;
  retail: number;
  wholesale: number;
  stock: number;
  cost: number;
  photo?: string;
  cat?: string;
}

export default function POSPage() {
  useRequirePermission("pos");
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [payment, setPayment] = useState("especes");
  const [paymentType, setPaymentType] = useState<string>("complet");
  const [client, setClient] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [lastSale, setLastSale] = useState<{ invoice: string; client: string; clientPhone: string; total: number; paidAmount: number; remaining: number; payment: string; paymentType: string; items: CartItem[]; discount: number } | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [previewFormat, setPreviewFormat] = useState<"thermal_50mm" | "a5">("thermal_50mm");
  const [sharing, setSharing] = useState(false);
  const [priceMode, setPriceMode] = useState<"retail" | "wholesale">("retail");
  const [vendor, setVendor] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [discountFcfa, setDiscountFcfa] = useState(0);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerId, setRegisterId] = useState<string | null>(null);
  const [registerData, setRegisterData] = useState<any>(null);
  const [closeDialog, setCloseDialog] = useState(false);
  const [actualAmount, setActualAmount] = useState(0);
  const [closeNote, setCloseNote] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [userId, setUserId] = useState("");
  const [montantVerse, setMontantVerse] = useState(0);
  const [isOffline, setIsOffline] = useState(!isOnlineSync());

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const on = () => setIsOffline(false);
    const off = () => setIsOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    getShopInfo().then(setShop);
    getCurrentUser().then((u) => {
      if (u) {
        setVendor(u.name || u.login);
        setVendorId(u.id);
        setUserId(u.id);
      }
    });
  }, []);

  const loadProducts = useCallback(async () => {
    const data = await loadProductsOffline() as unknown as Product[];
    let filtered = data;
    if (search) filtered = filtered.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
    setProducts(filtered.slice(0, 50));
  }, [search]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  useEffect(() => {
    if (!vendorId) return;
    getShopId().then(shopId => {
      supabase.from("cash_registers").select("*").eq("shop_id", shopId).eq("user_id", vendorId).eq("status", "open").single().then(({ data }) => {
        if (data) { setRegisterOpen(true); setRegisterId(data.id); setRegisterData(data); }
      });
    });
  }, [vendorId, supabase]);

  const refreshRegister = useCallback(async () => {
    if (!registerId) return;
    const { data } = await supabase.from("cash_registers").select("*").eq("id", registerId).single();
    if (data) { setRegisterData(data); }
  }, [registerId, supabase]);

  const addToCart = (product: Product) => {
    if (product.stock <= 0) return;
    const defaultPrice = priceMode === "wholesale" ? product.wholesale : product.retail;
    const price = defaultPrice && defaultPrice > 0 ? defaultPrice : 0;
    setCart((prev) => {
      const existing = prev.find((c) => c.product_id === product.id);
      if (existing) {
        if (existing.qty >= product.stock) return prev;
        return prev.map((c) =>
          c.product_id === product.id
            ? { ...c, qty: c.qty + 1, total: (c.qty + 1) * c.price }
            : c
        );
      }
      return [
        ...prev,
        {
          product_id: product.id,
          product_name: product.name,
          qty: 1,
          price: price || 0,
          cost: product.cost || 0,
          total: price || 0,
          stock: product.stock,
          photo: product.photo,
        },
      ];
    });
  };

  const updatePrice = (productId: string, newPrice: number) => {
    setCart((prev) =>
      prev.map((c) =>
        c.product_id === productId
          ? { ...c, price: newPrice, total: c.qty * newPrice }
          : c
      )
    );
  };

  const updateQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) =>
          c.product_id === productId
            ? { ...c, qty: Math.max(0, c.qty + delta), total: Math.max(0, c.qty + delta) * c.price }
            : c
        )
        .filter((c) => c.qty > 0)
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((c) => c.product_id !== productId));
  };

  const subtotal = cart.reduce((sum, c) => sum + c.total, 0);
  const discountAmount = discountFcfa;
  const total = subtotal - discountAmount;
  const profit = cart.reduce((sum, c) => sum + (c.price - c.cost) * c.qty, 0) - discountAmount;

  const handleOpenRegister = async () => {
    const shopId = await getShopId();
    if (!shopId) return;
    const { data, error: regErr } = await supabase.from("cash_registers").insert({
      shop_id: shopId,
      user_id: vendorId,
      user_name: vendor,
      opened_at: new Date().toISOString(),
      initial_amount: 0,
      status: "open",
      device: navigator.userAgent.substring(0, 100),
    }).select().single();
    if (regErr) {
      setError(regErr.message);
      return;
    }
    if (data) { setRegisterOpen(true); setRegisterId(data.id); }
  };

  const handleCloseRegister = async () => {
    if (!registerData || !registerId) return;
    const valid = await requirePinAction(userId, pinInput, "close_register", "cash_register", registerId);
    if (!valid) { setPinError(true); return; }
    const expected = (registerData.initial_amount || 0) + (registerData.total_cash || 0);
    const diff = actualAmount - expected;
    const shopId = await getShopId();
    await supabase.from("cash_registers").update({
      closed_at: new Date().toISOString(),
      actual_amount: actualAmount,
      difference: diff,
      status: "closed",
      note: closeNote || null,
    }).eq("id", registerId).eq("shop_id", shopId);
    setRegisterOpen(false);
    setRegisterId(null);
    setRegisterData(null);
    setCloseDialog(false);
    setPinInput("");
    setPinError(false);
  };

  const handleCheckout = async () => {
    if (cart.length === 0 || !registerId) return;
    const paidAmount = paymentType === "pret" ? 0 : (paymentType === "partiel" ? montantVerse : total);
    if (paymentType === "partiel" && (paidAmount <= 0 || paidAmount >= total)) {
      setError("Le montant versé doit être entre 0 et le total");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(false);
    const proportionalProfit = paymentType === "pret" ? 0 : (paymentType === "partiel" && total > 0 ? Math.round((paidAmount / total) * profit) : profit);
    const saleTotal = paymentType === "pret" ? 0 : (paymentType === "partiel" ? paidAmount : total);
    const saleProfit = paymentType === "pret" ? 0 : (paymentType === "partiel" ? proportionalProfit : profit);
    const shopId = await getShopId();
    if (!shopId) { setError("Impossible de récupérer la boutique"); setLoading(false); return; }
    const remaining = total - paidAmount;

    // Mode hors-ligne : utiliser directement le workflow offline
    if (isOffline) {
      try {
        const { checkoutOffline } = await import("@/lib/sync/pos-offline");
        const result = await checkoutOffline({
          cart: cart as CartItem[],
          client: client || "",
          clientPhone: clientPhone || "",
          payment,
          paymentType,
          total: saleTotal,
          paidAmount,
          profit: saleProfit,
          discount: discountFcfa,
          vendor,
          vendorId,
          shopId,
        });
        if (result.success) {
          setLastSale({ invoice: result.invoiceNumber!, client, clientPhone, total, paidAmount, remaining, payment, paymentType, items: [...cart], discount: discountFcfa });
          setCart([]);
          setClient(""); setClientPhone(""); setDiscountFcfa(0); setPaymentType("complet"); setMontantVerse(0);
          setSuccess(true);
          setTimeout(() => setSuccess(false), 3000);
        } else {
          setError(result.error || "Erreur lors de la validation hors-ligne");
        }
        setLoading(false);
        return;
      } catch (e) {
        console.error("Offline checkout error:", e);
        setError("Erreur hors-ligne: " + (e instanceof Error ? e.message : "inconnue"));
        setLoading(false);
        return;
      }
    }

    const invoice = `INV-${Date.now()}`;
    const saleId = crypto.randomUUID();
    try {

      // Insert sale
      const salePayload: Record<string, unknown> = {
        id: saleId,
        shop_id: shopId,
        invoice_number: invoice,
        date: new Date().toISOString().split("T")[0],
        client: client || null,
        type: priceMode,
        payment,
        total: saleTotal,
        profit: saleProfit,
        discount: discountFcfa,
        status: "completed",
        vendor,
        vendor_id: vendor,
        items: cart.map((c) => ({
          product_id: c.product_id,
          product_name: c.product_name,
          qty: c.qty,
          price: c.price,
          cost: c.cost,
          total: c.total,
        })),
      };
      if (clientPhone) salePayload.client_phone = clientPhone;

      let { data: sale, error: saleErr } = await supabase.from("sales").insert(salePayload).select().single();
      if (saleErr) {
        // Retry without optional columns if column error
        delete salePayload.client_phone;
        delete salePayload.payment_type;
        const { data: d, error: e } = await supabase.from("sales").insert(salePayload).select().single();
        if (e) throw e;
        sale = d;
      }

      // Stock adjustment
      const stockErrors: string[] = [];
      for (const item of cart) {
        const { data: prod, error: fetchErr } = await supabase.from("products").select("stock").eq("id", item.product_id).single();
        if (fetchErr || !prod) {
          stockErrors.push(`${item.product_name}: produit introuvable`);
          continue;
        }
        const newStock = Math.max(0, (prod.stock || 0) - item.qty);
        const { error: updErr } = await supabase.from("products").update({ stock: newStock }).eq("id", item.product_id);
        if (updErr) stockErrors.push(`${item.product_name}: ${updErr.message}`);
      }

      // Update cash register
      if (registerId) {
        const { data: reg } = await supabase.from("cash_registers").select("*").eq("id", registerId).single();
        if (reg) {
          const isCash = payment === "especes";
          await supabase.from("cash_registers").update({
            total_sales: (reg.total_sales || 0) + paidAmount,
            total_cash: (reg.total_cash || 0) + (isCash ? paidAmount : 0),
            total_mobile: (reg.total_mobile || 0) + (!isCash && ["orange_money", "wave", "free_money"].includes(payment) ? paidAmount : 0),
            total_other: (reg.total_other || 0) + (!isCash && !["orange_money", "wave", "free_money"].includes(payment) ? paidAmount : 0),
          }).eq("id", registerId).eq("shop_id", shopId);
        }
      }

      // Create credit for unpaid balance (partiel or pret) — lié au vendeur
      if (remaining > 0 && client) {
        const creditInsert: Record<string, unknown> = {
          id: crypto.randomUUID(),
          shop_id: shopId,
          sale_id: saleId,
          client,
          client_phone: clientPhone || null,
          total: remaining,
          paid: 0,
          status: "open",
          date: new Date().toISOString().split("T")[0],
          note: `Reliquat vente ${invoice} — Vendeur: ${vendor}`,
          vendor,
          vendor_id: vendorId,
        };
        let { error: creditErr } = await supabase.from("credits").insert(creditInsert);
        if (creditErr) {
          delete creditInsert.sale_id;
          delete creditInsert.vendor;
          delete creditInsert.vendor_id;
          delete creditInsert.client_phone;
          const { error: e2 } = await supabase.from("credits").insert(creditInsert);
          if (e2) stockErrors.push(`Crédit: ${e2.message}`);
        }
      }

      // Accounting entry (non-blocking)
      try {
        await supabase.from("accounting_entries").insert({
          shop_id: shopId,
          cash_register_id: registerId,
          type: "sale",
          amount: paidAmount,
          payment_method: payment,
          reference: invoice,
          description: `Vente ${invoice} - ${client || "client inconnu"}`,
          entry_date: new Date().toISOString().split("T")[0],
          created_by: userId,
        });
      } catch {}

      logAudit({ action: "create_sale", entity: "sales", entity_id: sale.id, data: { total: saleTotal, paid: paidAmount, remaining, items: cart.length } });
      setLastSale({ invoice, client, clientPhone, total, paidAmount, remaining, payment, paymentType, items: [...cart], discount: discountFcfa });
      setCart([]);
      setClient("");
      setClientPhone("");
      setDiscountFcfa(0);
      setPaymentType("complet");
      setMontantVerse(0);
      if (stockErrors.length > 0) {
        setError("Stock: " + stockErrors.join("; "));
      } else {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      }
    } catch (err: unknown) {
      // Fallback: essayer le mode hors-ligne si la connexion a été perdue
      try {
        const online = await checkIsOnline();
        if (!online) {
          const { checkoutOffline } = await import("@/lib/sync/pos-offline");
          const fallbackResult = await checkoutOffline({
            cart: cart as CartItem[],
            client: client || "",
            clientPhone: clientPhone || "",
            payment,
            paymentType,
            total: saleTotal,
            paidAmount,
            profit: saleProfit,
            discount: discountFcfa,
            vendor,
            vendorId,
            shopId,
          });
          if (fallbackResult.success) {
            setLastSale({ invoice: fallbackResult.invoiceNumber!, client, clientPhone, total, paidAmount, remaining, payment, paymentType, items: [...cart], discount: discountFcfa });
            setCart([]);
            setClient(""); setClientPhone(""); setDiscountFcfa(0); setPaymentType("complet"); setMontantVerse(0);
            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
            setLoading(false);
            return;
          }
        }
      } catch {}
      console.error("POS checkout error:", err);
      setError(err instanceof Error ? err.message : "Erreur lors de la validation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Caisse POS</h1>
        <div className="flex items-center gap-2">
          {isOffline && <Badge variant="default" className="bg-red-500"><WifiOff className="h-3 w-3 mr-1" /> Hors-ligne</Badge>}
          {!registerOpen ? (
            <Button variant="outline" onClick={handleOpenRegister} className="text-amber-500">
              <Receipt className="h-4 w-4 mr-2" /> Ouvrir la caisse
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Badge variant="default" className="bg-emerald-500">Caisse ouverte</Badge>
              <Button variant="outline" size="sm" onClick={() => { setActualAmount(0); setCloseNote(""); setPinInput(""); setPinError(false); setCloseDialog(true); }}>
                <Square className="h-4 w-4 mr-1" /> Fermer
              </Button>
            </div>
          )}
          <Badge variant="secondary" className="text-xs">
            <ShoppingCart className="h-3 w-3 mr-1" /> {vendor}
          </Badge>
        </div>
      </div>

      {error && (
        <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
      )}
      {success && (
        <Alert className="border-emerald-500/50">
          <Check className="h-4 w-4 text-emerald-500" />
          <AlertDescription className="text-emerald-500">Vente enregistrée !</AlertDescription>
        </Alert>
      )}

      <Dialog open={closeDialog} onOpenChange={(v) => { if (!v) { setCloseDialog(false); setPinError(false); setPinInput(""); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Fermeture de caisse</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-muted-foreground">Fond de caisse</span>
              <span className="text-right font-bold">{(registerData?.initial_amount || 0).toLocaleString()} FCFA</span>
              <span className="text-muted-foreground">Total ventes</span>
              <span className="text-right font-bold">{(registerData?.total_sales || 0).toLocaleString()} FCFA</span>
              <span className="text-muted-foreground">Dont espèces</span>
              <span className="text-right font-bold">{(registerData?.total_cash || 0).toLocaleString()} FCFA</span>
              <span className="text-muted-foreground">Espèces attendues</span>
              <span className="text-right font-bold">{((registerData?.initial_amount || 0) + (registerData?.total_cash || 0)).toLocaleString()} FCFA</span>
              <span className="text-muted-foreground">Mobile Money</span>
              <span className="text-right font-bold">{(registerData?.total_mobile || 0).toLocaleString()} FCFA</span>
            </div>
            <div>
              <Label>Montant réel en caisse</Label>
              <Input type="number" value={actualAmount || ""} onChange={(e) => setActualAmount(Number(e.target.value))} />
            </div>
            <div>
              <Label>Note</Label>
              <Input value={closeNote} onChange={(e) => setCloseNote(e.target.value)} placeholder="Optionnel" />
            </div>
            <div className="border-t pt-2">
              <Label className="flex items-center gap-2"><Lock className="h-3 w-3" /> Code secret</Label>
              <Input type="password" placeholder="Code secret" value={pinInput} onChange={(e) => { setPinInput(e.target.value); setPinError(false); }} maxLength={6} className="text-center tracking-widest" />
              {pinError && <p className="text-sm text-red-500">Code incorrect</p>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { window.print(); }}>Imprimer le rapport</Button>
              <Button className="flex-1" onClick={handleCloseRegister}>
                <Square className="h-4 w-4 mr-2" /> Fermer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Aperçu facture professionnel ── */}
      <Dialog open={!!lastSale} onOpenChange={(v) => { if (!v) setLastSale(null); }}>
        <DialogContent className={previewFormat === "thermal_50mm" ? "max-w-[320px]" : "max-w-3xl"}>
          <DialogHeader className="print-hide">
            <div className="flex items-center justify-between">
              <DialogTitle>Vente validée</DialogTitle>
              <div className="flex gap-1 rounded-lg border p-0.5">
                <Button variant={previewFormat === "thermal_50mm" ? "secondary" : "ghost"} size="sm" className="h-7 text-xs" onClick={() => setPreviewFormat("thermal_50mm")}>50mm</Button>
                <Button variant={previewFormat === "a5" ? "secondary" : "ghost"} size="sm" className="h-7 text-xs" onClick={() => setPreviewFormat("a5")}>A5</Button>
              </div>
            </div>
          </DialogHeader>
          {lastSale && (() => {
            const dtNow = new Date().toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
            const handlePrint = () => {
              const el = document.querySelector(previewFormat === "thermal_50mm" ? ".print-thermal" : ".pos-a5-print");
              if (!el) { window.print(); return; }
              const clone = el.cloneNode(true) as HTMLElement;
              clone.querySelectorAll(".print-hide").forEach((n) => n.remove());
              clone.style.cssText = `margin:0 auto;background:white;${previewFormat === "thermal_50mm" ? "width:48mm;padding:2mm" : "width:138mm;padding:0"}`;
              const styles = Array.from(document.querySelectorAll("style, link[rel=stylesheet]")).map((s) => s.outerHTML).join("\n");
              const iframe = document.createElement("iframe");
              iframe.style.cssText = "position:fixed;top:-9999px;left:0;width:0;height:0;border:none";
              document.body.appendChild(iframe);
              const doc = iframe.contentWindow!.document;
              doc.open();
              doc.write(`<!DOCTYPE html><html><head><title>Facture</title>${styles}<style>@page{margin:${previewFormat === "thermal_50mm" ? "2mm" : "3mm"};size:${previewFormat === "thermal_50mm" ? "auto" : "A5 portrait"}}body{margin:0;padding:0;background:white;display:flex;justify-content:center}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body>${clone.outerHTML}</body></html>`);
              doc.close();
              setTimeout(() => { iframe.contentWindow!.print(); setTimeout(() => iframe.remove(), 1000); }, 600);
              setLastSale(null);
            };
            return (
            <>
              {previewFormat === "thermal_50mm" ? (
                <div className="space-y-2 text-xs print-thermal" style={{ width: "48mm" }}>
                  <div className="text-center border-b pb-2">
                    {shop?.logo && <img src={shop.logo} alt="" className="mx-auto mb-1 h-8" />}
                    <p className="font-bold text-sm">{shop?.name || "Boutique"}</p>
                    {shop?.address && <p className="text-muted-foreground">{shop.address}</p>}
                    {shop?.phone && <p className="text-muted-foreground">Tél: {shop.phone}</p>}
                    {shop?.email && <p className="text-muted-foreground">{shop.email}</p>}
                  </div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Facture</span><span className="font-bold">{lastSale.invoice}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span>{dtNow}</span></div>
                  {lastSale.client && <div className="flex justify-between"><span className="text-muted-foreground">Client</span><span>{lastSale.client}{lastSale.clientPhone ? ` (${lastSale.clientPhone})` : ""}</span></div>}
                  <div className="border-t pt-1">
                    {lastSale.items.map((item, i) => (
                      <div key={i} className="flex justify-between py-0.5">
                        <span>{item.product_name} x{item.qty}</span>
                        <span>{item.total.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                  {lastSale.discount ? <div className="flex justify-between text-red-400"><span>Remise</span><span>-{lastSale.discount.toLocaleString()} FCFA</span></div> : null}
                  <div className="flex justify-between font-bold border-t pt-1">
                    <span>Total</span>
                    <span>{lastSale.total.toLocaleString()} FCFA</span>
                  </div>
                  <p className="text-xs text-muted-foreground text-center">Paiement: {lastSale.payment} ({lastSale.paymentType === "complet" ? "Complet" : lastSale.paymentType === "pret" ? "Prêt" : "Partiel"})</p>
                  {lastSale.paymentType === "partiel" && (
                    <div className="text-center text-xs">
                      <span className="text-emerald-600">Avancé: {lastSale.paidAmount.toLocaleString()} FCFA</span>
                      <span className="text-red-400 ml-2">Reste: {lastSale.remaining.toLocaleString()} FCFA</span>
                    </div>
                  )}
                  {lastSale.paymentType === "pret" && (
                    <p className="text-xs text-red-400 text-center">Crédit: {lastSale.remaining.toLocaleString()} FCFA</p>
                  )}
                  <p className="text-center text-muted-foreground pt-1">Merci de votre confiance !</p>
                  <div className="flex gap-2 pt-1 print-hide">
                    <Button className="flex-1 h-7 text-[10px]" onClick={handlePrint}>
                      <Printer className="h-3 w-3 mr-1" /> Imprimer
                    </Button>
                    <Button variant="outline" className="flex-1 h-7 text-[10px]" onClick={() => setLastSale(null)}>Fermer</Button>
                  </div>
                </div>
              ) : (
                <div className="w-[148mm] min-h-[210mm] mx-auto bg-white text-xs leading-snug pos-a5-print">
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
                          {shop?.email && <div className="text-[9px] text-white/70 leading-tight">{shop.email}</div>}
                          {shop?.ninea && <div className="text-[9px] text-white/70 leading-tight">NINEA: {shop.ninea}</div>}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="inline-block px-2.5 py-0.5 rounded-full bg-[#F5E6D3] text-[#4A0E2E] text-[9px] font-bold tracking-wider mb-1">FACTURE</div>
                        <div className="text-[10px] font-mono text-white/90 leading-tight">{lastSale.invoice}</div>
                        <div className="text-[9px] text-white/70 leading-tight">{dtNow}</div>
                        {lastSale.paymentType === "complet" && (
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
                      {shop?.email && <div className="text-[8px] text-gray-500 leading-tight">{shop.email}</div>}
                      {shop?.ninea && <div className="text-[8px] text-gray-500 leading-tight">NINEA: {shop.ninea}</div>}
                    </div>
                    <div className="rounded-lg border border-[#F0E6D8] bg-[#FDF8F4] px-3 py-[4mm]">
                      <div className="text-[8px] font-semibold text-[#4A0E2E] tracking-wider mb-1">FACTURE À</div>
                      <div className="text-[10px] font-bold leading-tight">{lastSale.client || "Client"}</div>
                      {lastSale.clientPhone && <div className="text-[8px] text-gray-500 leading-tight">Tél: {lastSale.clientPhone}</div>}
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[8px] text-gray-500">
                        <span>Paiement: <span className="font-medium capitalize text-gray-700">{lastSale.payment}</span></span>
                        <span>Type: <span className="font-medium text-gray-700">{lastSale.paymentType === "complet" ? "Complet" : lastSale.paymentType === "pret" ? "Prêt" : "Partiel"}</span></span>
                        {lastSale.paymentType === "partiel" && (
                          <span>Avancé: <span className="font-medium text-emerald-600">{lastSale.paidAmount.toLocaleString()} FCFA</span> / Reste: <span className="font-medium text-red-400">{lastSale.remaining.toLocaleString()} FCFA</span></span>
                        )}
                        {lastSale.paymentType === "pret" && (
                          <span>Crédit: <span className="font-medium text-red-400">{lastSale.remaining.toLocaleString()} FCFA</span></span>
                        )}
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
                        {lastSale.items.map((item, i) => (
                          <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-[#FDF8F4]"}>
                            <td className="px-3 py-[2.5mm] text-[9px] font-medium">{item.product_name}</td>
                            <td className="px-2 py-[2.5mm] text-center text-[9px]">{item.qty}</td>
                            <td className="px-2 py-[2.5mm] text-right text-[9px]">{item.price.toLocaleString()}</td>
                            <td className="px-3 py-[2.5mm] text-right text-[9px] font-semibold">{item.total.toLocaleString()} FCFA</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="border-t border-[#F0E6D8] px-3 py-[2mm] flex justify-between text-[9px] bg-[#FDF8F4]">
                      <span className="text-gray-500">Sous-total HT</span>
                      <span className="font-semibold">{lastSale.total.toLocaleString()} FCFA</span>
                    </div>
                  </div>
                  <div className="mx-4 mt-[4mm] rounded-lg bg-[#4A0E2E] px-4 py-[3.5mm] flex items-center justify-between text-white" style={{ background: 'linear-gradient(135deg, #4A0E2E 0%, #6B1A44 100%)' }}>
                    <div className="text-[10px] font-medium tracking-wider">TOTAL TTC</div>
                    <div className="text-base font-bold tracking-tight">{lastSale.total.toLocaleString()} FCFA</div>
                  </div>
                  <div className="mx-4 mt-[3mm] rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-[2.5mm]">
                    <div className="text-[8px] font-semibold text-emerald-700">NOTE</div>
                    <div className="text-[8px] text-emerald-600">Merci de votre confiance !</div>
                  </div>
                  <div className="mx-4 mt-[3mm] text-center text-[8px] text-gray-400 border-t border-[#F0E6D8] pt-[2.5mm] leading-tight">
                    <div className="font-medium text-[#4A0E2E]">{shop?.name || "Boutique"} — {shop?.address || "Dakar, Sénégal"}</div>
                    <div>Tél: {shop?.phone || "+221 00 000 00 00"} | {shop?.email || "contact@boutique.sn"}</div>
                    {shop?.ninea && <div className="opacity-70">NINEA: {shop.ninea}</div>}
                    <div className="opacity-50">Facture {lastSale.invoice} du {dtNow}</div>
                  </div>
                  <div className="flex gap-2 mx-4 mt-[4mm] mb-2 print-hide">
                    <Button className="flex-1 h-8 text-xs" onClick={handlePrint}>
                      <Printer className="h-3 w-3 mr-1" /> Imprimer
                    </Button>
                    <Button variant="outline" className="flex-1 h-8 text-xs" onClick={() => setLastSale(null)}>Fermer</Button>
                  </div>
                </div>
              )}
            </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher un produit..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex rounded-lg border p-0.5 ml-2">
                <Button
                  variant={priceMode === "retail" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setPriceMode("retail")}
                >Détail</Button>
                <Button
                  variant={priceMode === "wholesale" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setPriceMode("wholesale")}
                >Gros</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-[55vh] overflow-y-auto">
              {products.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  disabled={p.stock <= 0}
                  className="text-left rounded-lg border hover:border-amber-500/50 hover:bg-amber-500/5 transition-all disabled:opacity-40 disabled:cursor-not-allowed overflow-hidden group"
                >
                  <div className="aspect-square bg-muted relative">
                    {p.photo ? (
                      <img src={p.photo} alt={p.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <Package className="h-8 w-8 text-muted-foreground/30" />
                      </div>
                    )}
                    {p.stock <= 0 && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <span className="text-white text-xs font-bold">Rupture</span>
                      </div>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="font-medium text-xs line-clamp-1">{p.name}</p>
                    <p className="text-xs text-muted-foreground">Stock: {p.stock}</p>
                    <p className="text-sm font-bold text-amber-400">
                      {(priceMode === "wholesale" ? p.wholesale : p.retail)?.toLocaleString()} FCFA
                    </p>
                  </div>
                </button>
              ))}
              {products.length === 0 && (
                <p className="col-span-full text-center text-muted-foreground py-8 text-sm">
                  {search ? "Aucun produit trouvé" : "Chargement des produits..."}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                <CardTitle className="text-base">Panier ({cart.length})</CardTitle>
              </div>
              {!registerOpen && (
                <span className="text-xs text-red-400">Caisse fermée</span>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2 max-h-[30vh] overflow-y-auto">
              {cart.map((item) => (
                <div key={item.product_id} className="flex items-center gap-2 p-2 rounded-lg border">
                  <div className="h-8 w-8 rounded bg-muted overflow-hidden shrink-0">
                    {item.photo ? (
                      <img src={item.photo} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <Package className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.product_name}</p>
                    <Input
                      type="number"
                      value={item.price || ""}
                      onChange={(e) => updatePrice(item.product_id, Number(e.target.value))}
                      className="h-6 text-xs mt-0.5 w-24"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => updateQty(item.product_id, -1)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-6 text-center text-sm font-medium">{item.qty}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => updateQty(item.product_id, 1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="text-sm font-medium w-16 text-right">{item.total.toLocaleString()}</p>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 shrink-0" onClick={() => removeFromCart(item.product_id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              {cart.length === 0 && (
                <p className="text-center text-muted-foreground py-6 text-sm">
                  Cliquez sur un produit pour ajouter
                </p>
              )}
            </div>

            <div className="space-y-2 pt-2 border-t">
              <div className="flex justify-between text-sm">
                <span>Sous-total</span>
                <span>{subtotal.toLocaleString()} FCFA</span>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  placeholder="Remise (FCFA)"
                  className="h-8 text-xs"
                  value={discountFcfa || ""}
                  onChange={(e) => setDiscountFcfa(Math.max(0, Number(e.target.value)))}
                />
              </div>
              {discountFcfa > 0 && (
                <div className="flex justify-between text-xs text-red-400">
                  <span>Remise</span>
                  <span>-{discountAmount.toLocaleString()} FCFA</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span>Total</span>
                <span className="font-bold text-lg">{total.toLocaleString()} FCFA</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Marge</span>
                <span>{profit.toLocaleString()} FCFA</span>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Client <span className="text-red-400">*</span></Label>
                <Input placeholder="Nom du client" value={client} onChange={(e) => setClient(e.target.value)} className="h-8 text-sm" />
                {(paymentType === "partiel" || paymentType === "pret") && !client && (
                  <p className="text-xs text-red-400">Client requis pour {paymentType === "partiel" ? "le paiement partiel" : "le prêt"}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Téléphone client</Label>
                <Input placeholder="Téléphone (optionnel)" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} className="h-8 text-sm" />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Type de paiement</Label>
                <div className="flex gap-2">
                  <Button type="button" variant={paymentType === "complet" ? "default" : "outline"} size="sm" className="flex-1 h-8 text-xs" onClick={() => { setPaymentType("complet"); setMontantVerse(0); }}>Complet</Button>
                  <Button type="button" variant={paymentType === "pret" ? "default" : "outline"} size="sm" className="flex-1 h-8 text-xs" onClick={() => { setPaymentType("pret"); setMontantVerse(0); }}>Prêt</Button>
                  <Button type="button" variant={paymentType === "partiel" ? "default" : "outline"} size="sm" className="flex-1 h-8 text-xs" onClick={() => { setPaymentType("partiel"); }}>Partiel</Button>
                </div>
              </div>

              {paymentType === "partiel" && (
                <div className="space-y-1">
                  <Label className="text-xs">Montant versé</Label>
                  <Input type="number" placeholder="Montant reçu du client" value={montantVerse || ""} onChange={(e) => setMontantVerse(Math.max(0, Number(e.target.value)))} className="h-8 text-sm" />
                  {montantVerse > 0 && total > montantVerse && (
                    <p className="text-xs text-amber-400">Reste à payer: <strong>{(total - montantVerse).toLocaleString()} FCFA</strong> (sera enregistré comme crédit)</p>
                  )}
                </div>
              )}
              {paymentType === "pret" && (
                <div className="space-y-1">
                  <p className="text-xs text-amber-400">Ce montant sera enregistré comme crédit: <strong>{total.toLocaleString()} FCFA</strong></p>
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-xs">Paiement</Label>
                <Select value={payment} onValueChange={(v) => v && setPayment(v)}>
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="especes">Espèces</SelectItem>
                    <SelectItem value="orange_money">Orange Money</SelectItem>
                    <SelectItem value="wave">Wave</SelectItem>
                    <SelectItem value="free_money">Free Money</SelectItem>
                    <SelectItem value="carte">Carte bancaire</SelectItem>
                    <SelectItem value="transfert">Virement</SelectItem>
                    <SelectItem value="mixte">Mixte</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                className="w-full"
                size="lg"
                onClick={handleCheckout}
                disabled={cart.length === 0 || loading || !registerOpen || ((paymentType === "partiel" || paymentType === "pret") && !client)}
              >
                {loading ? "Validation..." : `Valider (${total.toLocaleString()} FCFA)`}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
