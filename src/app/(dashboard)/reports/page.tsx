"use client";

import { useRequirePermission } from "@/lib/use-permission";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { getShopId } from "@/lib/security";
import { isOnlineSync } from "@/lib/is-online";
import { getCachedProducts, getCachedSales, getCachedExpenses, getCachedCredits } from "@/lib/sync/db";
import {
  BarChart,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  CreditCard,
  Building,
  CalendarDays,
  FileDown,
  Printer,
  Package,
  Users,
  Receipt,
} from "lucide-react";

export default function ReportsPage() {
  useRequirePermission("reports");
  const now = new Date();
  const [filterMonth, setFilterMonth] = useState(now.getMonth());
  const [filterYear, setFilterYear] = useState(now.getFullYear());
  const [data, setData] = useState({
    period: { sales: 0, profit: 0, count: 0, expenses: 0 },
    total: { sales: 0, expenses: 0, profit: 0 },
    credits: { total: 0, pending: 0, paid: 0 },
    today: { sales: 0, cash: 0, mobile: 0, expenses: 0 },
    byVendor: [] as { vendor: string; total: number; profit: number; count: number; days: Record<number, number> }[],
    topProducts: [] as { name: string; total: number; count: number }[],
    paymentBreakdown: [] as { name: string; total: number }[],
    stockProducts: [] as { id: string; name: string; stock: number; cost: number; retail: number; threshold: number }[],
  });
  const supabase = useMemo(() => createClient(), []);

  const load = useCallback(async () => {
    if (!isOnlineSync()) {
      const [products, sales, expenses, credits] = await Promise.all([
        getCachedProducts(), getCachedSales(), getCachedExpenses(), getCachedCredits(),
      ]);
      const periodStart = new Date(filterYear, filterMonth, 1);
      const periodEnd = new Date(filterYear, filterMonth + 1, 0, 23, 59, 59);
      const periodSales = sales.filter((s) => {
        const d = new Date(s.created_at || s.date);
        return d >= periodStart && d <= periodEnd;
      });
      const periodExpenses = expenses.filter((e) => {
        const d = new Date(e.date);
        return d >= periodStart && d <= periodEnd;
      });
      const todayStr = new Date().toISOString().split("T")[0];
      const todaySales = sales.filter((s) => (s.created_at || "").startsWith(todayStr));
      const todayExpenses = expenses.filter((e) => (e.date || "").startsWith(todayStr));
      const creditsAll = credits;
      const productsAll = products;
      const daysInMonth = new Date(filterYear, filterMonth + 1, 0).getDate();
      const vendorMap = new Map<string, { total: number; profit: number; count: number; days: Record<number, number> }>();
      const productMap = new Map<string, { total: number; count: number }>();
      const paymentMap = new Map<string, number>();
      for (const s of sales) {
        const v = s.vendor || "Inconnu";
        const existing = vendorMap.get(v) || { total: 0, profit: 0, count: 0, days: {} };
        existing.total += s.total || 0;
        existing.profit += s.profit || 0;
        existing.count += 1;
        const day = s.created_at ? new Date(s.created_at).getDate() : 0;
        if (day >= 1 && day <= daysInMonth) existing.days[day] = (existing.days[day] || 0) + (s.total || 0);
        vendorMap.set(v, existing);
        const pm = s.payment || "especes";
        paymentMap.set(pm, (paymentMap.get(pm) || 0) + (s.total || 0));
        if (s.items && Array.isArray(s.items)) {
          for (const item of s.items as any[]) {
            const p = productMap.get(item.product_name) || { total: 0, count: 0 };
            p.total += item.total || 0;
            p.count += item.qty || 0;
            productMap.set(item.product_name, p);
          }
        }
      }
      setData({
        period: {
          sales: periodSales.reduce((s, r) => s + (r.total || 0), 0),
          profit: periodSales.reduce((s, r) => s + (r.profit || 0), 0),
          count: periodSales.length,
          expenses: periodExpenses.reduce((s, r) => s + (r.amount || 0), 0),
        },
        total: {
          sales: sales.reduce((s, r) => s + (r.total || 0), 0),
          expenses: expenses.reduce((s, r) => s + (r.amount || 0), 0),
          profit: sales.reduce((s, r) => s + (r.profit || 0), 0),
        },
        credits: {
          total: creditsAll.reduce((s, c) => s + (c.total || 0), 0),
          pending: creditsAll.filter((c) => c.status !== "paid").reduce((s, c) => s + ((c.total || 0) - (c.paid || 0)), 0),
          paid: creditsAll.filter((c) => c.status === "paid").reduce((s, c) => s + (c.total || 0), 0),
        },
        today: {
          sales: todaySales.reduce((s, r) => s + (r.total || 0), 0),
          cash: todaySales.filter((r) => r.payment === "especes").reduce((s, r) => s + (r.total || 0), 0),
          mobile: todaySales.filter((r) => ["orange_money", "wave", "free_money"].includes(r.payment)).reduce((s, r) => s + (r.total || 0), 0),
          expenses: todayExpenses.reduce((s, r) => s + (r.amount || 0), 0),
        },
        byVendor: Array.from(vendorMap.entries()).map(([vendor, v]) => ({ vendor, ...v })).sort((a, b) => b.total - a.total),
        topProducts: Array.from(productMap.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total).slice(0, 10),
        paymentBreakdown: Array.from(paymentMap.entries()).map(([name, total]) => ({ name, total })),
        stockProducts: productsAll as { id: string; name: string; stock: number; cost: number; retail: number; threshold: number }[],
      });
      return;
    }

    const shopId = await getShopId();
    const todayStr = new Date().toISOString().split("T")[0];
    const monthStart = new Date(filterYear, filterMonth, 1).toISOString();
    const monthEnd = new Date(filterYear, filterMonth + 1, 0, 23, 59, 59).toISOString();

    const baseSales = () => supabase.from("sales").select("*").is("deleted_at", null).eq("shop_id", shopId);
    const baseExpenses = () => supabase.from("expenses").select("*").eq("shop_id", shopId);

    const [periodSalesRes, periodExpensesRes, allSalesRes, allExpensesRes, creditsRes, todaySalesRes, todayExpensesRes, productsRes] = await Promise.all([
      baseSales().select("total,profit").gte("created_at", monthStart).lte("created_at", monthEnd),
      baseExpenses().select("amount").gte("date", monthStart.split("T")[0]).lte("date", monthEnd.split("T")[0]),
      baseSales().select("total,profit,vendor,items,payment,created_at"),
      baseExpenses().select("amount"),
      supabase.from("credits").select("total,paid,status").eq("shop_id", shopId),
      baseSales().select("total,payment").gte("created_at", todayStr),
      baseExpenses().select("amount").gte("date", todayStr),
      supabase.from("products").select("id,retail,cost,stock,name,threshold").is("deleted_at", null).eq("shop_id", shopId),
    ]);

    const periodSales = periodSalesRes.data || [];
    const periodExpenses = periodExpensesRes.data || [];
    const allSales = allSalesRes.data || [];
    const allExp = allExpensesRes.data || [];
    const credits = creditsRes.data || [];
    const todaySales = todaySalesRes.data || [];
    const todayExp = todayExpensesRes.data || [];
    const products = productsRes.data || [];

    const daysInMonth = new Date(filterYear, filterMonth + 1, 0).getDate();
    const vendorMap = new Map<string, { total: number; profit: number; count: number; days: Record<number, number> }>();
    const productMap = new Map<string, { total: number; count: number }>();
    const paymentMap = new Map<string, number>();

    for (const s of allSales) {
      const v = s.vendor || "Inconnu";
      const existing = vendorMap.get(v) || { total: 0, profit: 0, count: 0, days: {} };
      existing.total += s.total || 0;
      existing.profit += s.profit || 0;
      existing.count += 1;
      const day = s.created_at ? new Date(s.created_at).getDate() : 0;
      if (day >= 1 && day <= daysInMonth) existing.days[day] = (existing.days[day] || 0) + (s.total || 0);
      vendorMap.set(v, existing);

      const pm = s.payment || "especes";
      paymentMap.set(pm, (paymentMap.get(pm) || 0) + (s.total || 0));

      if (s.items && Array.isArray(s.items)) {
        for (const item of s.items) {
          const p = productMap.get(item.product_name) || { total: 0, count: 0 };
          p.total += item.total || 0;
          p.count += item.qty || 0;
          productMap.set(item.product_name, p);
        }
      }
    }

    setData({
      period: {
        sales: periodSales.reduce((s, r) => s + (r.total || 0), 0),
        profit: periodSales.reduce((s, r) => s + (r.profit || 0), 0),
        count: periodSales.length,
        expenses: periodExpenses.reduce((s, r) => s + (r.amount || 0), 0),
      },
      total: {
        sales: allSales.reduce((s, r) => s + (r.total || 0), 0),
        expenses: allExp.reduce((s, r) => s + (r.amount || 0), 0),
        profit: allSales.reduce((s, r) => s + (r.profit || 0), 0),
      },
      credits: {
        total: credits.reduce((s, c) => s + (c.total || 0), 0),
        pending: credits.filter((c) => c.status !== "paid").reduce((s, c) => s + ((c.total || 0) - (c.paid || 0)), 0),
        paid: credits.filter((c) => c.status === "paid").reduce((s, c) => s + (c.total || 0), 0),
      },
      today: {
        sales: todaySales.reduce((s, r) => s + (r.total || 0), 0),
        cash: todaySales.filter((r) => r.payment === "especes").reduce((s, r) => s + (r.total || 0), 0),
        mobile: todaySales.filter((r) => ["orange_money", "wave", "free_money"].includes(r.payment)).reduce((s, r) => s + (r.total || 0), 0),
        expenses: todayExp.reduce((s, r) => s + (r.amount || 0), 0),
      },
      byVendor: Array.from(vendorMap.entries()).map(([vendor, v]) => ({ vendor, ...v })).sort((a, b) => b.total - a.total),
      topProducts: Array.from(productMap.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total).slice(0, 10),
      paymentBreakdown: Array.from(paymentMap.entries()).map(([name, total]) => ({ name, total })),
      stockProducts: products as { id: string; name: string; stock: number; cost: number; retail: number; threshold: number }[],
    });
  }, [supabase, filterMonth, filterYear]);

  useEffect(() => { load(); }, [load]);

  const months = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

  const statCards = [
    { title: `Ventes ${months[filterMonth]}`, value: `${data.period.sales.toLocaleString()} FCFA`, sub: `${data.period.count} vente(s)`, icon: TrendingUp, color: "text-emerald-500" },
    { title: `Bénéfices ${months[filterMonth]}`, value: `${data.period.profit.toLocaleString()} FCFA`, sub: data.period.sales > 0 ? `Marge: ${((data.period.profit / data.period.sales) * 100).toFixed(1)}%` : "", icon: DollarSign, color: data.period.profit >= 0 ? "text-emerald-500" : "text-red-500" },
    { title: `Dépenses ${months[filterMonth]}`, value: `${data.period.expenses.toLocaleString()} FCFA`, sub: `Net: ${(data.period.profit - data.period.expenses).toLocaleString()} FCFA`, icon: TrendingDown, color: "text-red-500" },
    { title: "Total global ventes", value: `${data.total.sales.toLocaleString()} FCFA`, sub: `${data.total.profit.toLocaleString()} FCFA de bénéfice`, icon: ShoppingCart, color: "text-blue-500" },
  ];

  const periodNet = data.period.profit - data.period.expenses;
  const avgBasket = data.period.count > 0 ? data.period.sales / data.period.count : 0;
  const paymentLabels: Record<string, string> = { especes: "Espèces", orange_money: "Orange Money", wave: "Wave", free_money: "Free Money", carte: "Carte bancaire" };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Rapports & Comptabilité</h1>
          <p className="text-sm text-muted-foreground">Analyse financière complète</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Select value={String(filterMonth)} onValueChange={(v) => setFilterMonth(Number(v))}>
              <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {months.map((m, i) => <SelectItem key={m} value={String(i)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              type="number"
              value={filterYear}
              onChange={(e) => setFilterYear(Number(e.target.value))}
              className="w-[80px]"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" /> Imprimer
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Aperçu</TabsTrigger>
          <TabsTrigger value="accounting">Comptabilité</TabsTrigger>
          <TabsTrigger value="vendors">Par vendeur</TabsTrigger>
          <TabsTrigger value="products">Meilleurs produits</TabsTrigger>
          <TabsTrigger value="stock">Stock</TabsTrigger>
          <TabsTrigger value="credits">Crédits</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {statCards.map((card) => (
              <Card key={card.title}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                  <card.icon className={`h-4 w-4 ${card.color}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{card.value}</div>
                  {card.sub && <p className="text-xs text-muted-foreground">{card.sub}</p>}
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Synthèse de la période</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between"><span className="text-muted-foreground">Chiffre d&apos;affaires</span><span className="font-bold">{data.period.sales.toLocaleString()} FCFA</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Coût des ventes (bénéfice brut)</span><span className="font-bold">{data.period.profit.toLocaleString()} FCFA</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Dépenses</span><span className="font-bold text-red-500">-{data.period.expenses.toLocaleString()} FCFA</span></div>
                <div className="flex justify-between border-t pt-2"><span className="text-muted-foreground">Résultat net</span><span className={`font-bold text-lg ${periodNet >= 0 ? "text-emerald-500" : "text-red-500"}`}>{periodNet.toLocaleString()} FCFA</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Panier moyen</span><span className="font-bold">{avgBasket.toLocaleString()} FCFA</span></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Résumé du jour</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between"><span className="text-muted-foreground">Ventes</span><span className="font-bold">{data.today.sales.toLocaleString()} FCFA</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Espèces</span><span className="font-bold">{data.today.cash.toLocaleString()} FCFA</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Mobile Money</span><span className="font-bold">{data.today.mobile.toLocaleString()} FCFA</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Dépenses</span><span className="font-bold text-red-500">-{data.today.expenses.toLocaleString()} FCFA</span></div>
                </div>
              </CardContent>
            </Card>
          </div>

          {data.paymentBreakdown.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Répartition des paiements</CardTitle></CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  {data.paymentBreakdown.map((p) => (
                    <div key={p.name} className="flex items-center justify-between">
                      <span>{paymentLabels[p.name] || p.name}</span>
                      <div className="flex items-center gap-4">
                        <div className="w-40 bg-muted rounded-full h-2">
                          <div className="bg-primary h-2 rounded-full" style={{ width: `${(p.total / data.total.sales) * 100}%` }} />
                        </div>
                        <span className="font-bold w-32 text-right">{p.total.toLocaleString()} FCFA</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="accounting" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Building className="h-4 w-4 text-amber-500" /> Ventes {months[filterMonth]}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-500">{data.period.sales.toLocaleString()} FCFA</div>
                <p className="text-xs text-muted-foreground">{data.period.count} transaction(s)</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-red-500" /> Dépenses du mois
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-500">{data.period.expenses.toLocaleString()} FCFA</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-emerald-500" /> Marge brute
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.period.profit.toLocaleString()} FCFA</div>
                <p className="text-xs text-muted-foreground">{data.period.sales > 0 ? `Taux: ${((data.period.profit / data.period.sales) * 100).toFixed(1)}%` : ""}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-purple-500" /> Résultat net
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${periodNet >= 0 ? "text-emerald-500" : "text-red-500"}`}>{periodNet.toLocaleString()} FCFA</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Bilans cumulés</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Ventes totales</p>
                  <p className="text-lg font-bold">{data.total.sales.toLocaleString()} FCFA</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Bénéfice total</p>
                  <p className="text-lg font-bold">{data.total.profit.toLocaleString()} FCFA</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Dépenses totales</p>
                  <p className="text-lg font-bold text-red-500">{data.total.expenses.toLocaleString()} FCFA</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Résultat total</p>
                  <p className={`text-lg font-bold ${(data.total.profit - data.total.expenses) >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                    {(data.total.profit - data.total.expenses).toLocaleString()} FCFA
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Projection annuelle (basée sur {months[filterMonth]})</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Ventes projetées</p>
                  <p className="text-lg font-bold">{(data.period.sales * 12).toLocaleString()} FCFA</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Bénéfice projeté</p>
                  <p className="text-lg font-bold">{(data.period.profit * 12).toLocaleString()} FCFA</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Dépenses projetées</p>
                  <p className="text-lg font-bold text-red-500">{(data.period.expenses * 12).toLocaleString()} FCFA</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Résultat net projeté</p>
                  <p className={`text-lg font-bold ${periodNet >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                    {(periodNet * 12).toLocaleString()} FCFA
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Récapitulatif du jour</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between"><span className="text-muted-foreground">Ventes du jour</span><span className="font-bold">{data.today.sales.toLocaleString()} FCFA</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Dépenses du jour</span><span className="font-bold text-red-500">{data.today.expenses.toLocaleString()} FCFA</span></div>
                  <div className="flex justify-between border-t pt-2"><span className="text-muted-foreground">Bilan du jour</span><span className={`font-bold ${(data.today.sales - data.today.expenses) >= 0 ? "text-emerald-500" : "text-red-500"}`}>{(data.today.sales - data.today.expenses).toLocaleString()} FCFA</span></div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Crédits en cours</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between"><span className="text-muted-foreground">Total crédits</span><span className="font-bold">{data.credits.total.toLocaleString()} FCFA</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Remboursés</span><span className="font-bold text-emerald-500">{data.credits.paid.toLocaleString()} FCFA</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Impayés</span><span className="font-bold text-yellow-500">{data.credits.pending.toLocaleString()} FCFA</span></div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="vendors" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                État journalier des vendeurs — {months[filterMonth]} {filterYear}
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {data.byVendor.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">Aucune donnée</p>
              ) : (
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left font-medium text-muted-foreground sticky left-0 bg-card px-1 py-1 border-b">Vendeur</th>
                      {Array.from({ length: new Date(filterYear, filterMonth + 1, 0).getDate() }, (_, i) => (
                        <th key={i} className="text-right font-medium text-muted-foreground px-1 py-1 border-b min-w-[48px]">{i + 1}</th>
                      ))}
                      <th className="text-right font-bold px-1 py-1 border-b">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byVendor.map((v) => (
                      <tr key={v.vendor}>
                        <td className="sticky left-0 bg-card px-1 py-1 border-b font-medium">{v.vendor}</td>
                        {Array.from({ length: new Date(filterYear, filterMonth + 1, 0).getDate() }, (_, i) => {
                          const dayVal = v.days[i + 1] || 0;
                          return (
                            <td key={i} className={`text-right px-1 py-1 border-b ${dayVal > 0 ? "text-emerald-500 font-medium" : "text-muted-foreground"}`}>
                              {dayVal > 0 ? dayVal.toLocaleString() : "-"}
                            </td>
                          );
                        })}
                        <td className="text-right px-1 py-1 border-b font-bold">{v.total.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle>Top 10 des produits les plus vendus</CardTitle></CardHeader>
            <CardContent>
              {data.topProducts.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">Aucune donnée</p>
              ) : (
                <div className="space-y-3">
                  {data.topProducts.map((p, i) => (
                    <div key={p.name} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-muted-foreground w-6">#{i + 1}</span>
                        <div>
                          <p className="font-medium">{p.name}</p>
                          <p className="text-xs text-muted-foreground">{p.count} unité(s)</p>
                        </div>
                      </div>
                      <p className="font-bold">{p.total.toLocaleString()} FCFA</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stock" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Package className="h-4 w-4 text-amber-500" /> Stock total (coût)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.stockProducts.reduce((s, p) => s + ((p.cost || 0) * (p.stock || 0)), 0).toLocaleString()} FCFA</div>
                <p className="text-xs text-muted-foreground">Basé sur le prix de revient</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4 text-emerald-500" /> Vente potentielle
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.stockProducts.reduce((s, p) => s + ((p.retail || 0) * (p.stock || 0)), 0).toLocaleString()} FCFA</div>
                <p className="text-xs text-muted-foreground">Si tout le stock est vendu</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-500" /> Marge potentielle
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-500">{(data.stockProducts.reduce((s, p) => s + ((p.retail || 0) * (p.stock || 0)), 0) - data.stockProducts.reduce((s, p) => s + ((p.cost || 0) * (p.stock || 0)), 0)).toLocaleString()} FCFA</div>
                <p className="text-xs text-muted-foreground">{data.stockProducts.filter(p => (p.retail || 0) > 0).length > 0 ? `Taux: ${(((data.stockProducts.reduce((s, p) => s + ((p.retail || 0) * (p.stock || 0)), 0) - data.stockProducts.reduce((s, p) => s + ((p.cost || 0) * (p.stock || 0)), 0)) / data.stockProducts.reduce((s, p) => s + ((p.retail || 0) * (p.stock || 0)), 0)) * 100).toFixed(1)}%` : ""}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Package className="h-4 w-4 text-purple-500" /> Total produits
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.stockProducts.length}</div>
                <p className="text-xs text-muted-foreground">{data.stockProducts.filter(p => (p.stock || 0) <= (p.threshold || 10)).length} en alerte stock bas</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Détail des produits en stock</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="text-left font-medium text-muted-foreground px-2 py-1 border-b">Produit</th>
                    <th className="text-right font-medium text-muted-foreground px-2 py-1 border-b">Stock</th>
                    <th className="text-right font-medium text-muted-foreground px-2 py-1 border-b">Prix revient</th>
                    <th className="text-right font-medium text-muted-foreground px-2 py-1 border-b">Prix vente</th>
                    <th className="text-right font-medium text-muted-foreground px-2 py-1 border-b">Marge unitaire</th>
                    <th className="text-right font-medium text-muted-foreground px-2 py-1 border-b">Coût total</th>
                    <th className="text-right font-medium text-muted-foreground px-2 py-1 border-b">Vente potentielle</th>
                    <th className="text-right font-medium text-muted-foreground px-2 py-1 border-b">Marge totale</th>
                  </tr>
                </thead>
                <tbody>
                  {data.stockProducts.map((p) => {
                    const costTotal = (p.stock || 0) * (p.cost || 0);
                    const salePotential = (p.stock || 0) * (p.retail || 0);
                    const unitMargin = (p.retail || 0) - (p.cost || 0);
                    const totalMargin = salePotential - costTotal;
                    return (
                      <tr key={p.id}>
                        <td className="px-2 py-1 border-b font-medium">{p.name}</td>
                        <td className="text-right px-2 py-1 border-b">{p.stock}</td>
                        <td className="text-right px-2 py-1 border-b">{p.cost?.toLocaleString()} FCFA</td>
                        <td className="text-right px-2 py-1 border-b">{p.retail?.toLocaleString()} FCFA</td>
                        <td className={`text-right px-2 py-1 border-b ${unitMargin > 0 ? "text-emerald-500" : "text-red-500"}`}>{unitMargin.toLocaleString()} FCFA</td>
                        <td className="text-right px-2 py-1 border-b">{costTotal.toLocaleString()} FCFA</td>
                        <td className="text-right px-2 py-1 border-b">{salePotential.toLocaleString()} FCFA</td>
                        <td className={`text-right px-2 py-1 border-b font-medium ${totalMargin > 0 ? "text-emerald-500" : "text-red-500"}`}>{totalMargin.toLocaleString()} FCFA</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="credits" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader><CardTitle>Crédits accordés</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{data.credits.total.toLocaleString()} FCFA</div></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Reste à percevoir</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold text-yellow-500">{data.credits.pending.toLocaleString()} FCFA</div></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Crédits remboursés</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold text-emerald-500">{data.credits.paid.toLocaleString()} FCFA</div></CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
