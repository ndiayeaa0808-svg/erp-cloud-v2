"use client";

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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { getShopId } from "@/lib/security";
import { useRequirePermission } from "@/lib/use-permission";
import { Plus, Search, Pencil, Trash2, Users } from "lucide-react";
import { isOnlineSync } from "@/lib/is-online";
import { loadEmployeesOffline } from "@/lib/offline-data";
import { createEmployeeOffline, updateEmployeeOffline, deleteEmployeeOffline } from "@/lib/sync/sync";
import { getCachedEmployees, cacheEmployees, updateCachedEmployee, deleteCachedEmployee } from "@/lib/sync/db";
import type { Employee } from "@/types";

export default function EmployeesPage() {
  useRequirePermission("employees");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Partial<Employee>>({});
  const [open, setOpen] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadEmployeesOffline() as unknown as Employee[];
      let filtered = data;
      if (search) filtered = filtered.filter((e) => e.name?.toLowerCase().includes(search.toLowerCase()));
      setEmployees(filtered);
    } catch {
      try {
        const shopId = await getShopId();
        let q = supabase.from("employees").select("*").eq("shop_id", shopId).order("name");
        if (search) q = q.ilike("name", `%${search}%`);
        const { data } = await q;
        if (data) setEmployees(data as Employee[]);
      } catch {}
    }
    setLoading(false);
  }, [search, supabase]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    try {
      if (!isOnlineSync()) {
        const shopId = await getShopId();
        const now = new Date().toISOString();
        const payload = { ...edit, shop_id: shopId, status: edit.status ?? "active" };
        if (edit.id) {
          await updateEmployeeOffline(edit.id, payload);
          await updateCachedEmployee(edit.id, { ...payload, updatedAt: now } as any);
        } else {
          const newId = crypto.randomUUID();
          await createEmployeeOffline({ ...payload, id: newId });
          const cached = await getCachedEmployees();
          await cacheEmployees([...cached, { ...payload, id: newId, updatedAt: now } as any]);
        }
        setOpen(false);
        setEdit({});
        load();
        return;
      }
      const shopId = await getShopId();
      if (edit.id) {
        await supabase.from("employees").update(edit).eq("id", edit.id).eq("shop_id", shopId);
      } else {
        await supabase.from("employees").insert({ ...edit, id: crypto.randomUUID(), shop_id: shopId });
      }
      setOpen(false);
      setEdit({});
      load();
    } catch {}
  };

  const remove = async (id: string) => {
    if (!isOnlineSync()) {
      await deleteEmployeeOffline(id);
      await deleteCachedEmployee(id);
      load();
      return;
    }
    const shopId = await getShopId();
    await supabase.from("employees").delete().eq("id", id).eq("shop_id", shopId);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Employés</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button onClick={() => setEdit({ name: "", salary: 0 })}><Plus className="h-4 w-4 mr-2" /> Nouvel employé</Button>} />
          <DialogContent>
            <DialogHeader><DialogTitle>{edit.id ? "Modifier" : "Nouvel"} employé</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Nom *</Label><Input value={edit.name || ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
              <div><Label>Rôle</Label><Input value={edit.role || "vendeur"} onChange={(e) => setEdit({ ...edit, role: e.target.value })} /></div>
              <div><Label>Salaire</Label><Input type="number" value={edit.salary || 0} onChange={(e) => setEdit({ ...edit, salary: Number(e.target.value) })} /></div>
              <div><Label>Téléphone</Label><Input value={edit.phone || ""} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></div>
              <div><Label>Email</Label><Input type="email" value={edit.email || ""} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></div>
              <div className="col-span-2"><Label>Date embauche</Label><Input type="date" value={edit.hire_date || ""} onChange={(e) => setEdit({ ...edit, hire_date: e.target.value })} /></div>
              <div className="col-span-2"><Label>Note</Label><Input value={edit.note || ""} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></div>
            </div>
            <Button onClick={save}>{edit.id ? "Enregistrer" : "Créer"}</Button>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Rechercher..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Rôle</TableHead>
              <TableHead>Téléphone</TableHead>
              <TableHead className="text-right">Salaire</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8">Chargement...</TableCell></TableRow>
            ) : employees.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                Aucun employé
              </TableCell></TableRow>
            ) : employees.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">{e.name}</TableCell>
                <TableCell className="capitalize">{e.role}</TableCell>
                <TableCell>{e.phone || "-"}</TableCell>
                <TableCell className="text-right">{e.salary?.toLocaleString()} FCFA</TableCell>
                <TableCell>
                  <Badge variant={e.status === "active" ? "default" : "secondary"}>
                    {e.status === "active" ? "Actif" : e.status}
                  </Badge>
                </TableCell>
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
                        <AlertDialogHeader><AlertDialogTitle>Supprimer ?</AlertDialogTitle><AlertDialogDescription>Action irréversible.</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuler</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove(e.id)}>Supprimer</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
