import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import {
  currentPeriodLabel,
  defaultReference,
  ensureSeed,
  shiftLabel,
  type Period,
} from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Meses — Central de Remessa" },
      {
        name: "description",
        content: "Histórico mensal de vendas, remessas e industrialização das suas lojas.",
      },
      { property: "og:title", content: "Meses — Central de Remessa" },
      { property: "og:description", content: "Histórico mensal de vendas e remessas." },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <AppShell>
      <Periods />
    </AppShell>
  );
}

function Periods() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [label, setLabel] = useState(currentPeriodLabel());

  const { data: periods = [], isLoading } = useQuery({
    queryKey: ["periods"],
    queryFn: async () => {
      await ensureSeed();
      const { data, error } = await supabase
        .from("periods")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Period[];
    },
  });

  const existing = periods.find((p) => p.label === label.trim());

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("periods")
        .insert({ label: label.trim(), reference_label: defaultReference(label.trim()) })
        .select()
        .single();
      if (error) throw error;
      return data as Period;
    },
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["periods"] });
      navigate({ to: "/periodo/$id", params: { id: p.id } });
    },
    onError: (e: Error) => toast.error(e.message.includes("duplicate") ? "Esse mês já existe" : e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("periods").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Mês excluído");
      qc.invalidateQueries({ queryKey: ["periods"] });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">Meses de trabalho</h1>
          <p className="text-sm text-muted-foreground">
            O <strong>mês ativo</strong> é quando você emite as notas; o <strong>mês de referência</strong>{" "}
            (anterior) é de onde vêm as planilhas de vendas.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
          <label className="text-xs font-semibold uppercase text-muted-foreground">Mês ativo</label>
          <div className="mt-1 flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setLabel((l) => shiftLabel(l, -1))}>
              –
            </Button>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="08/2026"
              className="num w-28 text-center"
            />
            <Button variant="outline" size="icon" onClick={() => setLabel((l) => shiftLabel(l, 1))}>
              +
            </Button>
            {existing ? (
              <Button onClick={() => navigate({ to: "/periodo/$id", params: { id: existing.id } })}>
                Abrir
              </Button>
            ) : (
              <Button onClick={() => create.mutate()} disabled={!label.trim() || create.isPending}>
                <Plus className="size-4" /> Criar
              </Button>
            )}
          </div>
          <p className="num mt-2 text-xs text-muted-foreground">
            fechamento com as planilhas de {defaultReference(label.trim() || currentPeriodLabel())}
          </p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : periods.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Nenhum mês criado ainda. Crie o primeiro para importar as planilhas.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {periods.map((p) => (
            <div
              key={p.id}
              className="group flex items-center justify-between rounded-lg border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              <Link to="/periodo/$id" params={{ id: p.id }} className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded bg-secondary">
                  <CalendarDays className="size-5 text-accent" />
                </span>
                <span>
                  <span className="num block text-lg font-bold">
                    {p.label}{" "}
                    <span className="ml-1 align-middle text-xs font-normal text-muted-foreground">
                      {p.closed_at ? "· fechado" : "· em aberto"}
                    </span>
                  </span>
                  <span className="num block text-xs text-muted-foreground">
                    ref. {p.reference_label || defaultReference(p.label)} · tecido{" "}
                    {p.fabric_price_per_kg.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/kg
                  </span>
                </span>
              </Link>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100">
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir o mês {p.label}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Todas as vendas importadas e remessas desse mês serão apagadas.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => remove.mutate(p.id)}>Excluir</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
