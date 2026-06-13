"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createClient } from "@/lib/supabase/client";
import {
  Key, Users, TrendingUp, ShieldAlert, CheckCircle2, Copy, Search,
} from "lucide-react";

const PLANS = [
  { value: "trial", label: "Essai 7 jours" },
  { value: "monthly", label: "Mensuel" },
  { value: "quarterly", label: "Trimestriel" },
  { value: "semi_annual", label: "Semestriel" },
  { value: "lifetime", label: "À vie" },
];

export default function AdminPage() {
  const supabase = createClient();
  const [isAdmin, setIsAdmin] = useState(false);
  const [tab, setTab] = useState("licences");
  const [licenses, setLicenses] = useState<any[]>([]);
  const [shops, setShops] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [genPlan, setGenPlan] = useState("monthly");
  const [genNotes, setGenNotes] = useState("");
  const [genResult, setGenResult] = useState<string | null>(null);
  const [genLoading, setGenLoading] = useState(false);

  const planLabel = (p: string) => PLANS.find(x => x.value === p)?.label || p;
  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString("fr-FR") : "-";

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email === "ndiayeaO8@gmail.com") setIsAdmin(true);
      else setLoading(false);
    });
  }, [supabase]);

  const loadData = useCallback(async () => {
    const [licRes, shopRes] = await Promise.all([
      fetch("/api/licenses/list"),
      fetch("/api/admin/clients"),
    ]);
    if (licRes.ok) setLicenses(await licRes.json());
    if (shopRes.ok) setShops(await shopRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { if (isAdmin) loadData(); }, [isAdmin, loadData]);

  const handleGenerate = async () => {
    setGenLoading(true);
    setGenResult(null);
    try {
      const res = await fetch("/api/licenses/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: genPlan, notes: genNotes }),
      });
      const data = await res.json();
      if (data.code) setGenResult(data.code);
      else alert(data.error || "Erreur");
      loadData();
    } catch { alert("Erreur réseau"); }
    setGenLoading(false);
  };

  const handleBlock = async (shopId: string, blocked: boolean) => {
    if (!confirm(blocked ? "Débloquer cette boutique ?" : "Bloquer cette boutique ?")) return;
    await supabase.from("shops").update({
      license_status: blocked ? "active" : "cancelled",
    }).eq("id", shopId);
    loadData();
  };

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
  };

  const stats = {
    total: shops.length,
    active: shops.filter((s: any) => s.license_status === "active" || s.license_status === "trial").length,
    expired: shops.filter((s: any) => s.license_status === "expired" || s.license_status === "cancelled").length,
  };

  if (!isAdmin) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <p className="text-muted-foreground">Accès réservé à l'administrateur</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Administration</h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="licences"><Key className="h-4 w-4 mr-1" /> Licences</TabsTrigger>
          <TabsTrigger value="clients"><Users className="h-4 w-4 mr-1" /> Clients</TabsTrigger>
          <TabsTrigger value="stats"><TrendingUp className="h-4 w-4 mr-1" /> Statistiques</TabsTrigger>
        </TabsList>

        <TabsContent value="licences" className="space-y-4">
          <Card>
            <CardContent className="pt-4 space-y-3">
              <h3 className="font-medium">Générer un code de licence</h3>
              <div className="flex flex-wrap gap-2 items-end">
                <div className="w-40">
                  <Label className="text-xs">Plan</Label>
                  <Select value={genPlan} onValueChange={(v: any) => setGenPlan(v || "monthly")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PLANS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 min-w-[200px]">
                  <Label className="text-xs">Notes (optionnel)</Label>
                  <Input placeholder="Nom du client, WhatsApp..." value={genNotes} onChange={(e) => setGenNotes(e.target.value)} />
                </div>
                <Button onClick={handleGenerate} disabled={genLoading}>
                  {genLoading ? "Génération..." : "Générer le code"}
                </Button>
              </div>
              {genResult && (
                <Alert className="border-emerald-500/50">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <AlertDescription className="flex items-center gap-2">
                    <span className="font-mono font-bold text-lg tracking-wider">{genResult}</span>
                    <Button variant="ghost" size="sm" className="h-7" onClick={() => handleCopy(genResult)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Utilisé par</TableHead>
                  <TableHead>Date création</TableHead>
                  <TableHead>Expire le</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {licenses.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Aucune licence</TableCell></TableRow>
                ) : licenses.map((l: any) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono text-xs">{l.code}</TableCell>
                    <TableCell>{planLabel(l.plan)}</TableCell>
                    <TableCell>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${l.status === "active" ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"}`}>
                        {l.status === "active" ? "Active" : l.status}
                      </span>
                    </TableCell>
                    <TableCell>{l.used_by_email || "-"}</TableCell>
                    <TableCell className="text-xs">{formatDate(l.created_at)}</TableCell>
                    <TableCell className="text-xs">{l.expires_at ? formatDate(l.expires_at) : "Illimité"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{l.notes || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="clients" className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Rechercher une boutique..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Boutique</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Statut licence</TableHead>
                  <TableHead>Inscrit le</TableHead>
                  <TableHead>Expire le</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shops
                  .filter((s: any) => !search || s.name?.toLowerCase().includes(search.toLowerCase()) || s.phone?.includes(search))
                  .map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-xs">{s.phone || s.email || "-"}</TableCell>
                    <TableCell>{s.licenses ? planLabel(s.licenses.plan) : "-"}</TableCell>
                    <TableCell>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                        s.license_status === "active" ? "bg-emerald-500/10 text-emerald-500" :
                        s.license_status === "trial" ? "bg-amber-500/10 text-amber-500" :
                        "bg-red-500/10 text-red-500"
                      }`}>
                        {s.license_status === "active" ? "Actif" :
                         s.license_status === "trial" ? "Essai" : "Bloqué"}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">{formatDate(s.created_at)}</TableCell>
                    <TableCell className="text-xs">{s.licenses?.expires_at ? formatDate(s.licenses.expires_at) : "Illimité"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-red-400" onClick={() => handleBlock(s.id, s.license_status === "cancelled")}>
                        <ShieldAlert className="h-3 w-3 mr-1" />
                        {s.license_status === "cancelled" ? "Débloquer" : "Bloquer"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="stats">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{stats.total}</p><p className="text-xs text-muted-foreground">Total boutiques</p></CardContent></Card>
            <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold text-emerald-500">{stats.active}</p><p className="text-xs text-muted-foreground">Actives</p></CardContent></Card>
            <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold text-red-500">{stats.expired}</p><p className="text-xs text-muted-foreground">Bloquées</p></CardContent></Card>
            <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{licenses.filter((l: any) => l.status === "active").length}</p><p className="text-xs text-muted-foreground">Licences actives</p></CardContent></Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
