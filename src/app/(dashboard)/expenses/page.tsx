"use client";

import { useRequirePermission } from "@/lib/use-permission";
import { useState, useEffect, useCallback, useMemo } from "react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { createClient } from "@/lib/supabase/client";
import { getShopId, getCurrentUser, verifyPin } from "@/lib/security";
import { isOnlineSync } from "@/lib/is-online";
import { loadExpensesOffline } from "@/lib/offline-data";
import { createExpenseOffline, updateExpenseOffline, deleteExpenseOffline } from "@/lib/sync/sync";
import { getCachedExpenses, cacheExpenses, updateCachedExpense, deleteCachedExpense } from "@/lib/sync/db";
import { Plus, Search, Pencil, Trash2, Receipt, ShieldAlert, Download } from "lucide-react";
import { exportCSV } from "@/lib/export-csv";
import type { Expense } from "@/types";

const categories = ["Achat stock", "Loyer", "Électricité", "Eau", "Internet", "Transport", "Salaire", "Marketing", "Entretien", "Frais bancaires", "Impôts", "Autre"];

export default function ExpensesPage() {
  useRequirePermission("expenses");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Partial<Expense>>({});
  const [open, setOpen] = useState(false);
  const [deletePin, setDeletePin] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [pinError, setPinError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const supabase = useMemo(() => createClient(), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadExpensesOffline() as unknown as Expense[];
      let filtered = data;
      if (search) filtered = filtered.filter((e) => (e.desc || "").toLowerCase().includes(search.toLowerCase()));
      setExpenses(filtered);
    } catch {}
    setLoading(false);
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const totalDepenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);

  const save = async () => {
    try {
      if (!isOnlineSync()) {
        const shopId = await getShopId();
        const now = new Date().toISOString();
        const payload = { ...edit, id: edit.id || crypto.randomUUID(), shop_id: shopId, date: edit.date || now.split("T")[0] };
        if (edit.id) {
          await updateExpenseOffline(edit.id, payload);
          await updateCachedExpense(edit.id, payload as any);
        } else {
          await createExpenseOffline(payload);
          const cached = await getCachedExpenses();
          await cacheExpenses([...cached, { ...payload, updatedAt: now } as any]);
        }
        setOpen(false);
        setEdit({});
        load();
        return;
      }
      const shopId = await getShopId();
      if (edit.id) {
        await supabase.from("expenses").update(edit).eq("id", edit.id);
      } else {
        await supabase.from("expenses").insert({
          ...edit, id: crypto.randomUUID(), shop_id: shopId, date: edit.date || new Date().toISOString().split("T")[0],
        });
      }
      setOpen(false);
      setEdit({});
      load();
    } catch {}
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const user = await getCurrentUser();
    if (!user) return;
    const valid = await verifyPin(user.id, deletePin);
    if (!valid) { setPinError("Code PIN incorrect"); return; }
    if (!isOnlineSync()) {
      await deleteExpenseOffline(deleteTarget);
      await deleteCachedExpense(deleteTarget);
      setDeleteTarget(null);
      setDeletePin("");
      setPinError("");
      load();
      return;
    }
    const shopId = await getShopId();
    await supabase.from("expenses").delete().eq("id", deleteTarget).eq("shop_id", shopId);
    setDeleteTarget(null);
    setDeletePin("");
    setPinError("");
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dépenses</h1>
          <p className="text-sm text-muted-foreground">{expenses.length} dépenses · {totalDepenses.toLocaleString()} FCFA total</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => exportCSV(expenses, "depenses", [
            { key: "date", label: "Date" },
            { key: "desc", label: "Description" },
            { key: "cat", label: "Catégorie" },
            { key: "amount", label: "Montant" },
            { key: "note", label: "Note" },
          ])}><Download className="h-4 w-4 mr-2" /> Export CSV</Button>
          <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button onClick={() => setEdit({ desc: "", amount: 0, cat: "Autre", date: new Date().toISOString().split("T")[0] })}><Plus className="h-4 w-4 mr-2" /> Nouvelle dépense</Button>} />
          <DialogContent>
            <DialogHeader><DialogTitle>{edit.id ? "Modifier" : "Nouvelle"} dépense</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Description *</Label><Input value={edit.desc || ""} onChange={(e) => setEdit({ ...edit, desc: e.target.value })} /></div>
              <div>
                <Label>Catégorie</Label>
                <Select value={edit.cat || "Autre"} onValueChange={(v) => setEdit({ ...edit, cat: v ?? undefined })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Montant</Label><Input type="number" value={edit.amount || 0} onChange={(e) => setEdit({ ...edit, amount: Number(e.target.value) })} /></div>
              <div><Label>Date</Label><Input type="date" value={edit.date || ""} onChange={(e) => setEdit({ ...edit, date: e.target.value })} /></div>
              <div><Label>Note</Label><Input value={edit.note || ""} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></div>
            </div>
            <Button onClick={save}>{edit.id ? "Enregistrer" : "Ajouter"}</Button>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Rechercher..." className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Catégorie</TableHead>
              <TableHead className="text-right">Montant</TableHead>
              <TableHead className="w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8">Chargement...</TableCell></TableRow>
            ) : expenses.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                <Receipt className="h-8 w-8 mx-auto mb-2 opacity-50" />
                Aucune dépense
              </TableCell></TableRow>
            ) : expenses.slice((page - 1) * pageSize, page * pageSize).map((e) => (
              <TableRow key={e.id}>
                <TableCell>{e.date}</TableCell>
                <TableCell className="font-medium">{e.desc}</TableCell>
                <TableCell>{e.cat}</TableCell>
                <TableCell className="text-right font-medium">{e.amount?.toLocaleString()} FCFA</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEdit(e); setOpen(true); }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Supprimer ?</AlertDialogTitle><AlertDialogDescription><ShieldAlert className="h-4 w-4 inline mr-1" />Entrez votre code PIN pour confirmer</AlertDialogDescription></AlertDialogHeader>
                        <div className="px-6 pb-2">
                          <Input
                            type="password"
                            placeholder="Code PIN"
                            value={deleteTarget === e.id ? deletePin : ""}
                            onChange={(v) => { setDeleteTarget(e.id); setDeletePin(v.target.value); setPinError(""); }}
                            className="text-center text-lg tracking-widest"
                            maxLength={4}
                            autoFocus
                          />
                          {pinError && <p className="text-xs text-red-400 mt-1">{pinError}</p>}
                        </div>
                        <AlertDialogFooter>
                          <AlertDialogCancel onClick={() => { setDeleteTarget(null); setDeletePin(""); setPinError(""); }}>Annuler</AlertDialogCancel>
                          <AlertDialogAction onClick={confirmDelete}>Confirmer</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {expenses.length > pageSize && (
          <div className="flex items-center justify-between pt-2 px-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Lignes:</span>
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[10, 20, 50, 100].map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page === 1} onClick={() => setPage(page - 1)}>Précédent</Button>
              <span className="text-xs text-muted-foreground">Page {page}/{Math.ceil(expenses.length / pageSize)}</span>
              <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page >= Math.ceil(expenses.length / pageSize)} onClick={() => setPage(page + 1)}>Suivant</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
