"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShoppingCart,
  Package,
  DollarSign,
  Users,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Receipt,
  CreditCard,
  BarChart3,
  Store,
  AlertTriangle,
  Calendar,
  LineChart,
  PieChart,
  Activity,
  RefreshCw,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getShopId } from "@/lib/security";
import {
  Line,
  Bar,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { isOnlineSync } from "@/lib/is-online";
import { getCachedProducts, getCachedClients, getCachedSales, getCachedExpenses, getCachedCredits } from "@/lib/sync/db";

type Period = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

export default function DashboardPage() {
  const [data, setData] = useState({
    todaySales: 0,
    todaySalesCount: 0,
    productsCount: 0,
    lowStock: 0,
    clientsCount: 0,
    newClients: 0,
    totalRevenue: 0,
    totalProfit: 0,
    totalExpenses: 0,
    netProfit: 0,
      stockValue: 0,
      potentialSaleValue: 0,
      stockMargin: 0,
      creditCollections: 0,
    recentSales: [] as { id: string; client: string; total: number; profit: number; created_at: string; vendor: string }[],
    lowStockProducts: [] as { id: string; name: string; stock: number; threshold: number; photo?: string }[],
    pendingCredits: 0,
    todayExpenses: 0,
    topProducts: [] as { name: string; total: number; count: number }[],
    revenueByPeriod: [] as { label: string; revenue: number; profit: number; expenses: number }[],
    paymentBreakdown: [] as { name: string; value: number }[],
  });
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("daily");
  const supabase = useMemo(() => createClient(), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (!isOnlineSync()) {
        const [products, clients, sales, expenses, credits] = await Promise.all([
          getCachedProducts(), getCachedClients(), getCachedSales(), getCachedExpenses(), getCachedCredits(),
        ]);
        const today = new Date().toISOString().split("T")[0];
        const todaySales = sales.filter((s) => (s.created_at || "").startsWith(today));
        const todaySalesTotal = todaySales.reduce((s, r) => s + (r.total || 0), 0);
        const todaySalesProfit = todaySales.reduce((s, r) => s + (r.profit || 0), 0);
        const todayExpensesTotal = expenses.filter((e) => (e.date || "").startsWith(today)).reduce((s, r) => s + (r.amount || 0), 0);
        const lowStockData = products.filter((p) => (p.stock || 0) < (p.threshold || 10));
        const recentSales = sales.slice(0, 10);
        const topProductsMap = new Map<string, { name: string; total: number; count: number }>();
        for (const sale of sales) {
          if (sale.items && Array.isArray(sale.items)) for (const item of sale.items as any[]) {
            const existing = topProductsMap.get(item.product_name) || { name: item.product_name, total: 0, count: 0 };
            existing.total += item.total || 0;
            existing.count += item.qty || 0;
            topProductsMap.set(item.product_name, existing);
          }
        }
        const topProducts = Array.from(topProductsMap.values()).sort((a, b) => b.total - a.total).slice(0, 5);
        const stockValue = products.reduce((s, p) => s + ((p.cost || 0) * (p.stock || 0)), 0);
        const potentialSaleValue = products.reduce((s, p) => s + ((p.retail || 0) * (p.stock || 0)), 0);
        const pendingCredits = credits.reduce((s, c) => s + ((c.total || 0) - (c.paid || 0)), 0);
        const creditCollections = credits.reduce((s, c) => s + (c.paid || 0), 0);
        const totalRevenue = sales.reduce((s, r) => s + (r.total || 0), 0);
        const totalProfit = sales.reduce((s, r) => s + (r.profit || 0), 0);
        const totalExpenses = expenses.reduce((s, r) => s + (r.amount || 0), 0);
        setData({
          todaySales: todaySalesTotal,
          todaySalesCount: todaySales.length,
          productsCount: products.length,
          lowStock: lowStockData.length,
          clientsCount: clients.length,
          newClients: 0,
          totalRevenue,
          totalProfit,
          totalExpenses,
          netProfit: totalProfit - totalExpenses,
          stockValue,
          potentialSaleValue,
          stockMargin: potentialSaleValue - stockValue,
          creditCollections,
          recentSales: recentSales as any,
          lowStockProducts: lowStockData as any,
          pendingCredits,
          todayExpenses: todayExpensesTotal,
          topProducts,
          revenueByPeriod: [],
          paymentBreakdown: [],
        });
        setLoading(false);
        return;
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString();
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
      const shopId = await getShopId();

      const now = new Date();
      let startDate: Date;

      switch (period) {
        case "daily":
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
          break;
        case "weekly":
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 28);
          break;
        case "monthly":
          startDate = new Date(now.getFullYear() - 1, now.getMonth(), 1);
          break;
        case "quarterly":
          startDate = new Date(now.getFullYear() - 2, 0, 1);
          break;
        case "yearly":
          startDate = new Date(now.getFullYear() - 4, 0, 1);
          break;
      }

      const [todaySalesRes, productsRes, clientsRes, allSalesRes, recentSalesRes, lowStockRes, creditsRes, todayExpensesRes, newClientsRes, salesPeriodRes, expensesPeriodRes, creditCollectionsRes] = await Promise.all([
        supabase.from("sales").select("total, profit").is("deleted_at", null).eq("shop_id", shopId).gte("created_at", todayStr),
        supabase.from("products").select("id, retail, cost, stock", { count: "exact" }).is("deleted_at", null).eq("shop_id", shopId),
        supabase.from("clients").select("id", { count: "exact", head: true }).eq("shop_id", shopId),
        supabase.from("sales").select("total, profit, items, payment").is("deleted_at", null).eq("shop_id", shopId),
        supabase.from("sales").select("id,client,total,profit,created_at,vendor").is("deleted_at", null).eq("shop_id", shopId).order("created_at", { ascending: false }).limit(10),
        supabase.from("products").select("id,name,stock,threshold,photo").is("deleted_at", null).eq("shop_id", shopId),
        supabase.from("credits").select("total,paid,status").eq("shop_id", shopId).neq("status", "paid"),
        supabase.from("expenses").select("amount, date").eq("shop_id", shopId).gte("date", todayStr.split("T")[0]),
        supabase.from("clients").select("id").eq("shop_id", shopId).gte("created_at", monthStart),
        supabase.from("sales").select("total, profit, date, created_at").is("deleted_at", null).eq("shop_id", shopId).gte("created_at", startDate.toISOString()),
        supabase.from("expenses").select("amount, date").eq("shop_id", shopId).gte("date", startDate.toISOString().split("T")[0]),
        supabase.from("credits").select("paid").eq("shop_id", shopId),
      ]);
    
    const periodLabel: string[] = [];
    const todaySales = todaySalesRes.data || [];
    const todaySalesTotal = todaySales.reduce((s: number, r: { total?: number }) => s + (r.total || 0), 0);
    const todaySalesProfit = todaySales.reduce((s: number, r: { profit?: number }) => s + (r.profit || 0), 0);
    const todayExpensesTotal = (todayExpensesRes.data || []).reduce((s: number, r: { amount?: number }) => s + (r.amount || 0), 0);

    const allProducts = lowStockRes.data || [];
    const lowStockData = allProducts.filter((p: { stock: number; threshold: number }) => (p.stock || 0) < (p.threshold || 10));

    const allSales = allSalesRes.data || [];
    const topProductsMap = new Map<string, { name: string; total: number; count: number }>();
    for (const sale of allSales) {
      if (sale.items && Array.isArray(sale.items)) for (const item of sale.items) {
        const existing = topProductsMap.get(item.product_name) || { name: item.product_name, total: 0, count: 0 };
        existing.total += item.total || 0;
        existing.count += item.qty || 0;
        topProductsMap.set(item.product_name, existing);
      }
    }
    const topProducts = Array.from(topProductsMap.values()).sort((a, b) => b.total - a.total).slice(0, 5);

    const stockValue = (productsRes.data || []).reduce((s: number, p: { cost?: number; stock?: number }) => s + ((p.cost || 0) * (p.stock || 0)), 0);
    const potentialSaleValue = (productsRes.data || []).reduce((s: number, p: { retail?: number; stock?: number }) => s + ((p.retail || 0) * (p.stock || 0)), 0);
    const stockMargin = potentialSaleValue - stockValue;

    const paymentBreakdown = Object.entries(
      allSales.reduce((acc: Record<string, { count: number; total: number }>, sale: { payment?: string; total?: number }) => {
        const method = sale.payment || "especes";
        if (!acc[method]) acc[method] = { count: 0, total: 0 };
        acc[method].count++;
        acc[method].total += sale.total || 0;
        return acc;
      }, {})
    ).map(([name, val]) => ({ name, value: val.total }));

    const salesPeriod = salesPeriodRes.data || [];
    const expensesPeriod = expensesPeriodRes.data || [];
    const revenueByPeriod = buildPeriodData(salesPeriod, expensesPeriod, period, startDate, periodLabel);

    const isToday = period === "daily";
    const totalRevenue = isToday ? todaySalesTotal : salesPeriod.reduce((s: number, r: { total?: number }) => s + (r.total || 0), 0);
    const totalProfit = isToday ? todaySalesProfit : salesPeriod.reduce((s: number, r: { profit?: number }) => s + (r.profit || 0), 0);
    const totalExpenses = isToday ? todayExpensesTotal : expensesPeriod.reduce((s: number, r: { amount?: number }) => s + (r.amount || 0), 0);
    const periodSalesCount = isToday ? todaySales.length : salesPeriod.length;

    setData({
      todaySales: todaySalesTotal,
      todaySalesCount: periodSalesCount,
      productsCount: productsRes.count || 0,
      lowStock: lowStockData.length,
      clientsCount: clientsRes.count || 0,
      newClients: (newClientsRes.data || []).length,
      totalRevenue,
      totalProfit,
      totalExpenses,
      netProfit: totalProfit - totalExpenses,
      stockValue,
      potentialSaleValue,
      stockMargin,
      creditCollections: (creditCollectionsRes.data || []).reduce((s: number, c: { paid?: number }) => s + (c.paid || 0), 0),
      recentSales: (recentSalesRes.data || []) as typeof data.recentSales,
      lowStockProducts: lowStockData as typeof data.lowStockProducts,
      pendingCredits: (creditsRes.data || []).reduce((s: number, c: { total?: number; paid?: number }) => s + ((c.total || 0) - (c.paid || 0)), 0),
      todayExpenses: todayExpensesTotal,
      topProducts,
      revenueByPeriod,
      paymentBreakdown,
    });
    } catch (err) {
      console.error("Dashboard load error:", err);
    }
    setLoading(false);
  }, [period, supabase]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const refresh = () => load();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refresh(); });
    const interval = setInterval(refresh, 30000);
    return () => {
      window.removeEventListener("focus", refresh);
      clearInterval(interval);
    };
  }, [load]);

  function buildPeriodData(
    sales: { total?: number; profit?: number; date?: string; created_at?: string }[],
    expenses: { amount?: number; date?: string }[],
    p: Period,
    start: Date,
    labels: string[]
  ) {
    const refDate = new Date();
    const map = new Map<string, { revenue: number; profit: number; expenses: number }>();

    if (p === "daily") {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        const key = d.toISOString().split("T")[0];
        map.set(key, { revenue: 0, profit: 0, expenses: 0 });
      }
      for (const s of sales) {
        const date = (s.created_at || "").split("T")[0];
        if (map.has(date)) {
          const d = map.get(date)!;
          d.revenue += s.total || 0;
          d.profit += s.profit || 0;
        }
      }
      for (const e of expenses) {
        const date = e.date || "";
        if (map.has(date)) {
          map.get(date)!.expenses += e.amount || 0;
        }
      }
      const dayNames = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
      return Array.from(map.entries()).map(([k, v]) => ({
        label: dayNames[new Date(k).getDay()],
        ...v,
      }));
    }

    if (p === "weekly") {
      const byMonth: Record<string, { revenue: number; profit: number; expenses: number }> = {};
      for (const s of sales) {
        const m = (s.created_at || "").substring(0, 7);
        if (!byMonth[m]) byMonth[m] = { revenue: 0, profit: 0, expenses: 0 };
        byMonth[m].revenue += s.total || 0;
        byMonth[m].profit += s.profit || 0;
      }
      for (const e of expenses) {
        const m = (e.date || "").substring(0, 7);
        if (!byMonth[m]) byMonth[m] = { revenue: 0, profit: 0, expenses: 0 };
        byMonth[m].expenses += e.amount || 0;
      }
      return Object.entries(byMonth).slice(-4).map(([k, v]) => ({
        label: k.substring(5),
        ...v,
      }));
    }

    if (p === "monthly") {
      for (let i = 11; i >= 0; i--) {
        const d = new Date(refDate.getFullYear(), refDate.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        map.set(key, { revenue: 0, profit: 0, expenses: 0 });
      }
      for (const s of sales) {
        const key = (s.created_at || "").substring(0, 7);
        if (map.has(key)) {
          const d = map.get(key)!;
          d.revenue += s.total || 0;
          d.profit += s.profit || 0;
        }
      }
      for (const e of expenses) {
        const key = (e.date || "").substring(0, 7);
        if (map.has(key)) {
          map.get(key)!.expenses += e.amount || 0;
        }
      }
      const monthNames = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
      return Array.from(map.entries()).map(([k, v]) => ({
        label: monthNames[parseInt(k.substring(5)) - 1] || k,
        ...v,
      }));
    }

    if (p === "quarterly") {
      const quarters = ["T1", "T2", "T3", "T4"];
      const byQuarter: Record<string, { revenue: number; profit: number; expenses: number }> = {};
      for (let i = 7; i >= 0; i--) {
        const qIdx = Math.floor(i) % 4;
        const yearOffset = Math.floor(i / 4);
        const y = refDate.getFullYear() - yearOffset;
        const q = quarters[qIdx];
        byQuarter[`${y}-${q}`] = { revenue: 0, profit: 0, expenses: 0 };
      }
      for (const s of sales) {
        const date = s.created_at || "";
        const m = parseInt(date.substring(5, 7));
        const q = quarters[Math.ceil(m / 3) - 1];
        const key = `${date.substring(0, 4)}-${q}`;
        if (byQuarter[key]) {
          byQuarter[key].revenue += s.total || 0;
          byQuarter[key].profit += s.profit || 0;
        }
      }
      for (const e of expenses) {
        const date = e.date || "";
        const m = parseInt(date.substring(5, 7));
        const q = quarters[Math.ceil(m / 3) - 1];
        const key = `${date.substring(0, 4)}-${q}`;
        if (byQuarter[key]) {
          byQuarter[key].expenses += e.amount || 0;
        }
      }
      return Object.entries(byQuarter).map(([k, v]) => ({ label: k, ...v }));
    }

    if (p === "yearly") {
      const byYear: Record<string, { revenue: number; profit: number; expenses: number }> = {};
      for (let i = 4; i >= 0; i--) {
        byYear[String(refDate.getFullYear() - i)] = { revenue: 0, profit: 0, expenses: 0 };
      }
      for (const s of sales) {
        const key = (s.created_at || "").substring(0, 4);
        if (byYear[key]) {
          byYear[key].revenue += s.total || 0;
          byYear[key].profit += s.profit || 0;
        }
      }
      for (const e of expenses) {
        const key = (e.date || "").substring(0, 4);
        if (byYear[key]) {
          byYear[key].expenses += e.amount || 0;
        }
      }
      return Object.entries(byYear).map(([k, v]) => ({ label: k, ...v }));
    }

    return [];
  }

  const today = new Date();

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Chargement...</div>;

  const periodLabel = period === "daily" ? "aujourd'hui" : period === "weekly" ? "cette semaine" : period === "monthly" ? "ce mois" : period === "quarterly" ? "ce trimestre" : "cette année";
  const stockLabel = "Stock (coût)";
  const stats = [
    { label: stockLabel, value: `${data.stockValue.toLocaleString()} FCFA`, change: `${data.productsCount} produits`, trend: data.stockValue > 0 ? "up" : "neutral", icon: Package },
    { label: `Ventes ${periodLabel}`, value: `${data.totalRevenue.toLocaleString()} FCFA`, change: `${data.todaySalesCount} vente(s)`, trend: data.totalRevenue > 0 ? "up" : "neutral", icon: ShoppingCart },
    { label: `Bénéfices ${periodLabel}`, value: `${data.totalProfit.toLocaleString()} FCFA`, change: `Marge: ${data.totalRevenue > 0 ? ((data.totalProfit / data.totalRevenue) * 100).toFixed(1) : 0}%`, trend: data.totalProfit > 0 ? "up" : "down", icon: TrendingUp },
    { label: `Dépenses ${periodLabel}`, value: `${data.totalExpenses.toLocaleString()} FCFA`, change: `Net: ${data.netProfit.toLocaleString()} FCFA`, trend: data.totalExpenses > 0 ? data.netProfit >= 0 ? "up" : "down" : "neutral", icon: Receipt },
  ];

  return (
    <div className="space-y-6 page-enter">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tableau de bord</h1>
          <p className="text-sm text-muted-foreground">
            {today.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border p-0.5">
            {(["daily", "weekly", "monthly", "quarterly", "yearly"] as Period[]).map((p) => (
              <Button
                key={p}
                variant={period === p ? "secondary" : "ghost"}
                size="sm"
                className="h-7 text-xs capitalize"
                onClick={() => setPeriod(p)}
              >
                {p === "daily" ? "Jour" : p === "weekly" ? "Semaine" : p === "monthly" ? "Mois" : p === "quarterly" ? "Trimestre" : "Année"}
              </Button>
            ))}
          </div>
          <Button variant="outline" size="sm" className="h-7" onClick={() => load()} title="Rafraîchir">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 stagger-children">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="hover-lift hover:border-amber-500/30">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.label}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <div className="flex items-center gap-1 mt-1">
                  {stat.trend === "up" ? (
                    <ArrowUpRight className="h-3 w-3 text-emerald-500" />
                  ) : stat.trend === "down" ? (
                    <ArrowDownRight className="h-3 w-3 text-red-500" />
                  ) : (
                    <Activity className="h-3 w-3 text-muted-foreground" />
                  )}
                  <span className={`text-xs ${stat.trend === "up" ? "text-emerald-500" : stat.trend === "down" ? "text-red-500" : "text-muted-foreground"}`}>
                    {stat.change}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <LineChart className="h-4 w-4 text-amber-400" />
                Évolution {period === "daily" ? "journalière" : period === "weekly" ? "hebdomadaire" : period === "monthly" ? "mensuelle" : period === "quarterly" ? "trimestrielle" : "annuelle"}
              </CardTitle>
              <CardDescription>Revenus, bénéfices et dépenses</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {data.revenueByPeriod.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Aucune donnée pour cette période</div>
            ) : (
              <>
                <div className="flex flex-wrap gap-4 mb-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-amber-500" />
                    <span className="text-muted-foreground">Revenus</span>
                    <span className="font-bold">{data.revenueByPeriod.reduce((s, r) => s + r.revenue, 0).toLocaleString()} FCFA</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-emerald-500" />
                    <span className="text-muted-foreground">Bénéfices</span>
                    <span className="font-bold">{data.revenueByPeriod.reduce((s, r) => s + r.profit, 0).toLocaleString()} FCFA</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-red-500" />
                    <span className="text-muted-foreground">Dépenses</span>
                    <span className="font-bold">{data.revenueByPeriod.reduce((s, r) => s + r.expenses, 0).toLocaleString()} FCFA</span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={data.revenueByPeriod} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.08} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }}
                      formatter={(value, name) => [
                        `${Number(value).toLocaleString()} FCFA`,
                        name === "revenue" ? "Revenus" : name === "profit" ? "Bénéfices" : "Dépenses"
                      ]}
                      labelFormatter={(label) => `Période: ${label}`}
                    />
                    <Bar dataKey="expenses" fill="#ef4444" radius={[3, 3, 0, 0]} name="expenses" maxBarSize={20} opacity={0.7} />
                    <Bar dataKey="profit" fill="#10b981" radius={[3, 3, 0, 0]} name="profit" maxBarSize={20} opacity={0.8} />
                    <Bar dataKey="revenue" fill="#f59e0b" radius={[3, 3, 0, 0]} name="revenue" maxBarSize={20} opacity={0.9} />
                    <Line type="monotone" dataKey="revenue" stroke="#f59e0b" strokeWidth={2.5} name="revenue" dot={{ r: 3, fill: "#f59e0b", strokeWidth: 0 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <PieChart className="h-4 w-4 text-amber-400" />
                Répartition paiements
              </CardTitle>
              <CardDescription>Par méthode</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {data.paymentBreakdown.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Aucune donnée</div>
            ) : (
              <div className="space-y-3">
                {data.paymentBreakdown.sort((a, b) => b.value - a.value).slice(0, 5).map((p) => {
                  const total = data.paymentBreakdown.reduce((s, x) => s + x.value, 0);
                  const pct = total > 0 ? ((p.value / total) * 100).toFixed(1) : "0";
                  const colors: Record<string, string> = {
                    especes: "bg-emerald-500",
                    orange_money: "bg-orange-500",
                    wave: "bg-blue-500",
                    free_money: "bg-purple-500",
                    carte: "bg-amber-500",
                    transfert: "bg-cyan-500",
                    mixte: "bg-pink-500",
                  };
                  return (
                    <div key={p.name} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="capitalize">{p.name.replace(/_/g, " ")}</span>
                        <span className="font-medium">{p.value.toLocaleString()} FCFA ({pct}%)</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${colors[p.name] || "bg-amber-500"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 stagger-children">
        <Card className="hover-lift hover:border-amber-500/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Vente potentielle</CardTitle>
            <Store className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.potentialSaleValue.toLocaleString()} FCFA</div>
            <p className="text-xs text-muted-foreground mt-1">Valeur stock au prix détail</p>
          </CardContent>
        </Card>
        <Card className="hover-lift hover:border-emerald-500/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Marge potentielle</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">{data.stockMargin.toLocaleString()} FCFA</div>
            <p className="text-xs text-muted-foreground mt-1">{data.potentialSaleValue > 0 ? `Taux: ${((data.stockMargin / data.potentialSaleValue) * 100).toFixed(1)}%` : ""}</p>
          </CardContent>
        </Card>
        <Card className="hover-lift hover:border-yellow-500/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Crédits en attente</CardTitle>
            <CreditCard className="h-4 w-4 text-yellow-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500">{data.pendingCredits.toLocaleString()} FCFA</div>
            <p className="text-xs text-muted-foreground mt-1">À recouvrer</p>
          </CardContent>
        </Card>
        <Card className="hover-lift hover:border-blue-500/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Crédits recouvrés</CardTitle>
            <CreditCard className="h-4 w-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">{data.creditCollections.toLocaleString()} FCFA</div>
            <p className="text-xs text-muted-foreground mt-1">Total encaissé</p>
          </CardContent>
        </Card>
        <Card className="hover-lift hover:border-purple-500/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Top produits</CardTitle>
            <BarChart3 className="h-4 w-4 text-purple-400" />
          </CardHeader>
          <CardContent>
            {data.topProducts.length === 0 ? (
              <div className="text-sm text-muted-foreground">Aucune donnée</div>
            ) : (
              <div className="space-y-1">
                {data.topProducts.slice(0, 4).map((p) => (
                  <div key={p.name} className="flex justify-between text-xs">
                    <span className="truncate max-w-[120px]">{p.name}</span>
                    <span className="font-medium">{p.count} ventes</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Dernières ventes</CardTitle>
              <CardDescription>10 dernières transactions</CardDescription>
            </div>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {data.recentSales.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Aucune vente aujourd'hui</div>
            ) : (
              <div className="space-y-3">
                {data.recentSales.map((sale) => (
                  <div key={sale.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-amber-500/10 flex items-center justify-center">
                        <Store className="h-4 w-4 text-amber-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{sale.client || "Client"} <span className="text-xs text-muted-foreground">par {sale.vendor || "-"}</span></p>
                        <p className="text-xs text-muted-foreground">{new Date(sale.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-sm">{sale.total.toLocaleString()} FCFA</p>
                      <p className="text-xs text-emerald-500">+{sale.profit?.toLocaleString()} FCFA</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Produits en alerte</CardTitle>
              <CardDescription>Stock bas</CardDescription>
            </div>
            <AlertTriangle className="h-4 w-4 text-red-400" />
          </CardHeader>
          <CardContent>
            {data.lowStockProducts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Aucun produit en alerte</div>
            ) : (
              <div className="space-y-3">
                {data.lowStockProducts.slice(0, 5).map((p) => (
                  <div key={p.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {p.photo ? (
                        <img src={p.photo} alt="" className="h-8 w-8 rounded object-cover" />
                      ) : (
                        <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                          <Package className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <p className="text-sm font-medium">{p.name}</p>
                    </div>
                    <span className="text-xs text-red-500 font-bold">{p.stock} / {p.threshold || 10}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
