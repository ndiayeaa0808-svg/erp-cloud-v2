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
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createClient } from "@/lib/supabase/client";
import { getShopId, getCurrentUser, requirePinAction } from "@/lib/security";
import {
  Calculator,
  Play,
  Square,
  DollarSign,
  Smartphone,
  Check,
  X,
  Lock,
  TrendingUp,
  History,
  FileDown,
} from "lucide-react";
import type { CashRegister } from "@/types";
import { isOnlineSync } from "@/lib/is-online";
import { loadCashRegistersOffline } from "@/lib/offline-data";
import { createCashRegisterOffline, updateCashRegisterOffline } from "@/lib/sync/sync";
import { getCachedCashRegisters, cacheCashRegisters, updateCachedCashRegister } from "@/lib/sync/db";
import type { CachedCashRegister } from "@/lib/sync/db";

export default function CashRegisterPage() {
  useRequirePermission("cash_register");
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentRegister, setCurrentRegister] = useState<CashRegister | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [initialAmount, setInitialAmount] = useState(0);
  const [actualAmount, setActualAmount] = useState(0);
  const [note, setNote] = useState("");
  const [vendor, setVendor] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [userId, setUserId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [tab, setTab] = useState("active");
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    getCurrentUser().then((u) => {
      if (u) {
        setVendor(u.name || u.login);
        setVendorId(u.id);
        setUserId(u.id);
      }
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadCashRegistersOffline() as unknown as CashRegister[];
      setRegisters(data);
      const openReg = data.find((r) => r.status === "open");
      setCurrentRegister(openReg || null);
    } catch {
      try {
        const shopId = await getShopId();
        if (!shopId) { setLoading(false); return; }
        const { data } = await supabase.from("cash_registers").select("*").eq("shop_id", shopId).order("opened_at", { ascending: false }).limit(50);
        if (data) {
          setRegisters(data as CashRegister[]);
          const openReg = data.find((r) => r.status === "open");
          setCurrentRegister(openReg || null);
        }
      } catch {}
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const handleOpenRegister = async () => {
    if (!isOnlineSync()) {
      const shopId = await getShopId();
      if (!shopId) return;
      const now = new Date().toISOString();
      const regData = {
        id: crypto.randomUUID(),
        shop_id: shopId,
        initial_amount: initialAmount,
        current_amount: initialAmount,
        status: "open",
        opened_at: now,
        vendor: vendor,
        vendor_id: vendorId,
        note: note,
      };
      await createCashRegisterOffline(regData);
      const cached = await getCachedCashRegisters();
      await cacheCashRegisters([{ ...regData, updatedAt: now } as CachedCashRegister, ...cached]);
      setOpenDialog(false);
      setInitialAmount(0);
      setNote("");
      load();
      return;
    }
    const shopId = await getShopId();
    if (!shopId) return;
    const { data, error: err } = await supabase.from("cash_registers").insert({
      shop_id: shopId,
      user_id: vendorId,
      user_name: vendor,
      opened_at: new Date().toISOString(),
      initial_amount: initialAmount,
      status: "open",
      device: navigator.userAgent.substring(0, 100),
    }).select().single();
    if (err) setError(err.message);
    if (data) {
      setCurrentRegister(data as CashRegister);
      setSuccess(true);
      setOpenDialog(false);
      setTimeout(() => setSuccess(false), 3000);
    }
    load();
  };

  const handleCloseRegister = async () => {
    if (!currentRegister) return;
    if (!isOnlineSync()) {
      const now = new Date().toISOString();
      await updateCashRegisterOffline(currentRegister.id, {
        status: "closed",
        closed_at: now,
        actual_amount: actualAmount,
      });
      await updateCachedCashRegister(currentRegister.id, {
        status: "closed",
        closed_at: now,
        actual_amount: actualAmount,
        updatedAt: now,
      });
      setCloseDialog(false);
      setActualAmount(0);
      load();
      return;
    }
    const shopId = await getShopId();
    const diff = actualAmount - (currentRegister.expected_amount || currentRegister.total_sales || 0) - currentRegister.initial_amount;
    const { error: err } = await supabase.from("cash_registers").update({
      closed_at: new Date().toISOString(),
      actual_amount: actualAmount,
      difference: diff,
      status: "closed",
      note,
    }).eq("id", currentRegister.id).eq("shop_id", shopId);
    if (err) setError(err.message);
    setCurrentRegister(null);
    setCloseDialog(false);
    setPinInput("");
    setPinError(false);
    load();
  };

  const openRegisters = registers.filter((r) => r.status === "open");
  const closedRegisters = registers.filter((r) => r.status === "closed");
  const totalTodaySales = registers
    .filter((r) => r.created_at && new Date(r.created_at).toDateString() === new Date().toDateString())
    .reduce((s, r) => s + (r.total_sales || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gestion de caisse</h1>
          <p className="text-sm text-muted-foreground">Vendeur: {vendor}</p>
        </div>
        <div className="flex items-center gap-2">
          {currentRegister ? (
            <Button variant="destructive" onClick={() => setCloseDialog(true)}>
              <Square className="h-4 w-4 mr-2" /> Fermer la caisse
            </Button>
          ) : (
            <Button onClick={() => setOpenDialog(true)}>
              <Play className="h-4 w-4 mr-2" /> Ouvrir la caisse
            </Button>
          )}
        </div>
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {success && (
        <Alert className="border-emerald-500/50">
          <Check className="h-4 w-4 text-emerald-500" />
          <AlertDescription className="text-emerald-500">Caisse ouverte avec succès</AlertDescription>
        </Alert>
      )}

      {currentRegister && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Caisse ouverte depuis {new Date(currentRegister.opened_at).toLocaleTimeString("fr-FR")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Fond de caisse</p>
                <p className="text-lg font-bold">{currentRegister.initial_amount.toLocaleString()} FCFA</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Ventes</p>
                <p className="text-lg font-bold text-emerald-400">{(currentRegister.total_sales || 0).toLocaleString()} FCFA</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Espèces</p>
                <p className="text-lg font-bold">{(currentRegister.total_cash || 0).toLocaleString()} FCFA</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Mobile Money</p>
                <p className="text-lg font-bold">{(currentRegister.total_mobile || 0).toLocaleString()} FCFA</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="active">Caisses ouvertes ({openRegisters.length})</TabsTrigger>
          <TabsTrigger value="closed">Historique</TabsTrigger>
          <TabsTrigger value="summary">Résumé du jour</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4 mt-4">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendeur</TableHead>
                  <TableHead>Ouverture</TableHead>
                  <TableHead>Fond</TableHead>
                  <TableHead className="text-right">Ventes</TableHead>
                  <TableHead className="text-right">Espèces</TableHead>
                  <TableHead className="text-right">Mobile</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {openRegisters.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    <Calculator className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    Aucune caisse ouverte
                  </TableCell></TableRow>
                ) : openRegisters.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.user_name}</TableCell>
                    <TableCell>{new Date(r.opened_at).toLocaleString("fr-FR")}</TableCell>
                    <TableCell>{r.initial_amount.toLocaleString()} FCFA</TableCell>
                    <TableCell className="text-right">{(r.total_sales || 0).toLocaleString()} FCFA</TableCell>
                    <TableCell className="text-right">{(r.total_cash || 0).toLocaleString()} FCFA</TableCell>
                    <TableCell className="text-right">{(r.total_mobile || 0).toLocaleString()} FCFA</TableCell>
                    <TableCell><Badge className="bg-emerald-500">Ouverte</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="closed" className="space-y-4 mt-4">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendeur</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Fond</TableHead>
                  <TableHead className="text-right">Ventes</TableHead>
                  <TableHead className="text-right">Réel</TableHead>
                  <TableHead className="text-right">Écart</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {closedRegisters.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    Aucun historique
                  </TableCell></TableRow>
                ) : closedRegisters.slice(0, 50).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.user_name}</TableCell>
                    <TableCell className="text-xs">{new Date(r.closed_at || r.updated_at || "").toLocaleString("fr-FR")}</TableCell>
                    <TableCell className="text-right">{r.initial_amount.toLocaleString()} FCFA</TableCell>
                    <TableCell className="text-right">{(r.total_sales || 0).toLocaleString()} FCFA</TableCell>
                    <TableCell className="text-right">{(r.actual_amount || 0).toLocaleString()} FCFA</TableCell>
                    <TableCell className={`text-right font-bold ${(r.difference || 0) !== 0 ? "text-red-500" : "text-emerald-500"}`}>
                      {(r.difference || 0) > 0 ? "+" : ""}{r.difference?.toLocaleString()} FCFA
                    </TableCell>
                    <TableCell className="text-xs max-w-[150px] truncate">{r.note || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="summary" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-emerald-500" /> Ventes du jour
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalTodaySales.toLocaleString()} FCFA</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-500" /> Caisses ouvertes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{openRegisters.length}</div>
                <p className="text-xs text-muted-foreground">{closedRegisters.length} fermées aujourd'hui</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-amber-500" /> Mobile Money
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {registers.filter((r) => r.created_at && new Date(r.created_at).toDateString() === new Date().toDateString())
                    .reduce((s, r) => s + (r.total_mobile || 0), 0).toLocaleString()} FCFA
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <FileDown className="h-4 w-4 text-purple-500" /> Export
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Button variant="outline" size="sm" className="w-full" onClick={() => window.print()}>Export PDF</Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Ouverture de caisse</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Fond de caisse initial</Label>
              <Input type="number" value={initialAmount || ""} onChange={(e) => setInitialAmount(Number(e.target.value))} />
            </div>
            <Button onClick={handleOpenRegister} className="w-full">
              <Play className="h-4 w-4 mr-2" /> Ouvrir la caisse
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={closeDialog} onOpenChange={(v) => { setCloseDialog(v); setPinError(false); setPinInput(""); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Fermeture de caisse</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-muted-foreground">Fond de caisse</span>
              <span className="text-right font-bold">{(currentRegister?.initial_amount || 0).toLocaleString()} FCFA</span>
              <span className="text-muted-foreground">Total ventes</span>
              <span className="text-right font-bold">{(currentRegister?.total_sales || 0).toLocaleString()} FCFA</span>
              <span className="text-muted-foreground">Espèces attendues</span>
              <span className="text-right font-bold">{((currentRegister?.total_cash || 0) + (currentRegister?.initial_amount || 0)).toLocaleString()} FCFA</span>
              <span className="text-muted-foreground">Mobile Money</span>
              <span className="text-right font-bold">{(currentRegister?.total_mobile || 0).toLocaleString()} FCFA</span>
            </div>
            <div>
              <Label>Montant réel en caisse</Label>
              <Input type="number" value={actualAmount || ""} onChange={(e) => setActualAmount(Number(e.target.value))} />
            </div>
            <div>
              <Label>Note (optionnel)</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="border-t pt-2">
              <Label className="flex items-center gap-2"><Lock className="h-3 w-3" /> Code secret</Label>
              <Input type="password" placeholder="Code secret" value={pinInput} onChange={(e) => { setPinInput(e.target.value); setPinError(false); }} maxLength={6} className="text-center tracking-widest" />
              {pinError && <p className="text-sm text-red-500">Code incorrect</p>}
            </div>
            <Button onClick={handleCloseRegister} className="w-full">
              <Square className="h-4 w-4 mr-2" /> Fermer la caisse
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
