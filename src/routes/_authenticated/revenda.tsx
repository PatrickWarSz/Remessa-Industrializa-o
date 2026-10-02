import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Plus, RotateCcw, Trash2, Wand2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { int, shiftLabel, type Company, type Period } from "@/lib/domain";
import {
  ALL_SIZES,
  fetchAllocations,
  fetchCodeMap,
  fetchCycles,
  fetchModels,
  fetchNoteItems,
  fetchNotes,
  fetchResaleSales,
  guessModel,
  guessSize,
  norm,
  monthOf,
  refKey,
  resaleCoverage,
  resaleReference,
  type CounterNote,
  type CounterNoteItem,
  type CoverageRow,
  type ResaleAllocation,
  type ResaleCycle,
  type ResaleModel,
} from "@/lib/resale";
import { friendlyError } from "@/lib/dbError";


export const Route = createFileRoute("/_authenticated/revenda")({
  head: () => ({
    meta: [
      { title: "Revenda — notas de balcão e rateio entre empresas" },
      {
        name: "description",
        content:
          "Lance as notas de balcão, distribua as peças entre as empresas usando as vendas como referência e gere a mensagem para o fornecedor.",
      },
      { property: "og:title", content: "Revenda — notas de balcão e rateio" },
      {
        property: "og:description",
        content: "Notas de balcão, rateio por modelo e tamanho e mensagem pronta para o fornecedor.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <Revenda />
    </AppShell>
  ),
});

const labelValue = (label: string) => {
  const [m, y] = label.split("/").map((n) => Number(n));
  return (y || 0) * 100 + (m || 0);
};

function Revenda() {
  const qc = useQueryClient();

  const { data: companies = [] } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*").order("sort_order");
      if (error) throw error;
      return data as Company[];
    },
  });
  const { data: periods = [] } = useQuery({
    queryKey: ["periods"],
    queryFn: async () => {
      const { data, error } = await supabase.from("periods").select("*");
      if (error) throw error;
      return data as Period[];
    },
  });
  const { data: models = [] } = useQuery({ queryKey: ["resale_models"], queryFn: fetchModels });
  const { data: ownGroups = [] } = useQuery({
    queryKey: ["product_groups"],
    queryFn: async () => {
      const { data, error } = await supabase.from("product_groups").select("*").order("sort_order");
      if (error) throw error;
      return (data ?? []).filter((g) => g.kind === "propria").map((g) => g.name as string);
    },
  });
  const { data: codeMap = [] } = useQuery({ queryKey: ["resale_code_map"], queryFn: fetchCodeMap });
  const { data: sales = [] } = useQuery({ queryKey: ["resale_sales"], queryFn: fetchResaleSales });
  const { data: notes = [] } = useQuery({ queryKey: ["counter_notes"], queryFn: fetchNotes });
  const { data: noteItems = [] } = useQuery({ queryKey: ["counter_note_items"], queryFn: fetchNoteItems });
  const { data: cycles = [] } = useQuery({ queryKey: ["resale_cycles"], queryFn: fetchCycles });
  const { data: allocations = [] } = useQuery({
    queryKey: ["resale_allocations"],
    queryFn: fetchAllocations,
  });

  const refresh = (keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  /**
   * Todas as empresas ficam disponíveis para escolha; as que já venderam revenda
   * (ou já receberam rateio) aparecem primeiro, as demais entram como "sem histórico".
   */
  const resaleCompanies = useMemo(() => {
    const ids = new Set(sales.map((s) => s.company_id));
    for (const a of allocations) if (a.company_id) ids.add(a.company_id);
    return [...companies].sort(
      (a, b) => Number(ids.has(b.id)) - Number(ids.has(a.id)),
    );
  }, [companies, sales, allocations]);


  /** Período de referência: mês fechado mais recente com planilha importada. */
  const referencePeriod = useMemo(() => {
    const withSales = periods.filter((p) => sales.some((s) => s.period_id === p.id));
    const period = withSales.sort((a, b) => labelValue(b.label) - labelValue(a.label))[0] ?? null;
    if (!period) return null;
    // As vendas do período foram importadas do mês anterior (mês fechado).
    const label = period.reference_label || shiftLabel(period.label, -1);
    return { ...period, label };
  }, [periods, sales]);

  const reference = useMemo(
    () => resaleReference(sales, codeMap, referencePeriod?.id ?? null, models),
    [sales, codeMap, referencePeriod, models],
  );

  /** Cobertura fiscal: saldo corrido = tudo que entrou em nota − tudo que foi vendido. */
  const COVERAGE_START = 202608;
  const coverage = useMemo(
    () =>
      resaleCoverage({
        sales,
        codeMap,
        models,
        allocations,
        cycles,
        periodId: null,
        // Acumulado: todo mês importado x todos os ciclos já fechados. As notas do
        // balcão entram com atraso (compro no mês seguinte ao que vendi), então
        // recortar por mês mostrava falta onde a nota já existe.
        // Saldo corrido a partir de 08/2026: meses de venda anteriores foram cobertos
        // por notas de antes do programa e ficam fora da conta.
        periodIds: periods
          .filter((p) => sales.some((s) => s.period_id === p.id))
          .filter((p) => {
            const [m, y] = String((p as { reference_label?: string }).reference_label || p.label).split("/");
            return Number(y) * 100 + Number(m) >= COVERAGE_START;
          })
          .map((p) => p.id),
        monthLabel: null,
        companies,
      }),
    [sales, codeMap, models, allocations, cycles, periods, companies],
  );




  const pendingNotes = notes.filter((n) => n.status === "pendente");
  const pendingItems = noteItems.filter((i) => pendingNotes.some((n) => n.id === i.note_id));
  const unmapped = codeMap.filter((c) => !c.model_id && !c.is_own);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">Revenda</h1>
          <p className="text-sm text-muted-foreground">
            Notas de balcão, rateio entre as empresas e mensagem para o fornecedor.
          </p>
        </div>
        <p className="num text-sm text-muted-foreground">
          Referência de rateio:{" "}
          <strong className="text-foreground">
            {referencePeriod ? `vendas de ${referencePeriod.label}` : "sem planilha importada"}
          </strong>
        </p>
      </div>

      <Tabs defaultValue="notas">
        <TabsList>
          <TabsTrigger value="notas">Notas de balcão ({pendingNotes.length})</TabsTrigger>
          <TabsTrigger value="rateio">Rateio do ciclo</TabsTrigger>
          <TabsTrigger value="cobertura">Cobertura fiscal</TabsTrigger>
          <TabsTrigger value="codigos">
            Códigos a confirmar{unmapped.length ? ` (${unmapped.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="modelos">Modelos</TabsTrigger>
          <TabsTrigger value="historico">Histórico ({cycles.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="notas" className="pt-4">
          <Notes
            models={models}
            notes={notes}
            items={noteItems}
            onChange={() => refresh(["counter_notes", "counter_note_items"])}
          />
        </TabsContent>

        <TabsContent value="rateio" className="pt-4">
          <Rateio
            models={models}
            companies={resaleCompanies}
            pendingItems={pendingItems}
            pendingNoteIds={pendingNotes.map((n) => n.id)}
            reference={reference}
            deficit={coverage.deficit}
            referenceLabel={referencePeriod?.label ?? null}
            onClosed={() =>
              refresh(["counter_notes", "counter_note_items", "resale_cycles", "resale_allocations"])
            }
          />
        </TabsContent>

        <TabsContent value="cobertura" className="pt-4">
          <Coverage rows={coverage.rows} monthLabel={null} cycles={cycles} />
        </TabsContent>

        <TabsContent value="codigos" className="pt-4">
          <Codes
            codeMap={codeMap}
            models={models}
            companies={companies}
            sales={sales}
            ownGroups={ownGroups}
            onChange={() => refresh(["resale_code_map"])}
          />
        </TabsContent>

        <TabsContent value="modelos" className="pt-4">
          <Models models={models} onChange={() => refresh(["resale_models"])} />
        </TabsContent>

        <TabsContent value="historico" className="pt-4">
          <History
            cycles={cycles}
            allocations={allocations}
            models={models}
            onChange={() =>
              refresh(["counter_notes", "resale_cycles", "resale_allocations"])
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* --------------------------------- notas --------------------------------- */

function Notes({
  models,
  notes,
  items,
  onChange,
}: {
  models: ResaleModel[];
  notes: CounterNote[];
  items: CounterNoteItem[];
  onChange: () => void;
}) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [supplier, setSupplier] = useState("");
  const [doc, setDoc] = useState("");
  const [draft, setDraft] = useState<{ modelId: string; size: string; qty: string }[]>([
    { modelId: "", size: "", qty: "" },
  ]);

  const modelName = (id: string | null) => models.find((m) => m.id === id)?.name ?? "—";
  const sizesOf = (id: string) => models.find((m) => m.id === id)?.sizes ?? ALL_SIZES;

  const save = useMutation({
    mutationFn: async () => {
      const rows = draft.filter((d) => d.modelId && Number(d.qty) > 0);
      if (!rows.length) throw new Error("Adicione ao menos um item");
      const { data, error } = await supabase
        .from("counter_notes")
        .insert({ note_date: date, supplier, doc, status: "pendente" })
        .select("id")
        .single();
      if (error) throw error;
      const { error: itemsError } = await supabase.from("counter_note_items").insert(
        rows.map((r, i) => ({
          note_id: data.id,
          model_id: r.modelId,
          size: r.size,
          qty: Number(r.qty),
          sort_order: i,
        })),
      );
      if (itemsError) throw itemsError;
    },
    onSuccess: () => {
      toast.success("Nota lançada");
      setSupplier("");
      setDoc("");
      setDraft([{ modelId: "", size: "", qty: "" }]);
      onChange();
    },
    onError: (e: Error) =>
      toast.error(e.message.includes("duplicate") ? "Modelo já existe" : e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("counter_notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Nota removida");
      onChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalOf = (noteId: string) =>
    items.filter((i) => i.note_id === noteId).reduce((a, i) => a + i.qty, 0);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-bold">Nova nota de balcão</h2>
        <div className="flex flex-wrap gap-4">
          <Field label="Data">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="num w-40" />
          </Field>
          <Field label="Fornecedor">
            <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} className="w-56" />
          </Field>
          <Field label="Nº da nota">
            <Input value={doc} onChange={(e) => setDoc(e.target.value)} className="num w-32" />
          </Field>
        </div>

        <div className="mt-4 space-y-2">
          {draft.map((row, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Select
                value={row.modelId}
                onValueChange={(v) =>
                  setDraft((prev) => prev.map((r, j) => (j === i ? { ...r, modelId: v, size: "" } : r)))
                }
              >
                <SelectTrigger className="h-9 w-72">
                  <SelectValue placeholder="Modelo" />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={row.size}
                onValueChange={(v) => setDraft((prev) => prev.map((r, j) => (j === i ? { ...r, size: v } : r)))}
              >
                <SelectTrigger className="h-9 w-28">
                  <SelectValue placeholder="Tam." />
                </SelectTrigger>
                <SelectContent>
                  {(row.modelId ? sizesOf(row.modelId) : ALL_SIZES).map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={row.qty}
                inputMode="numeric"
                placeholder="Qtd"
                className="num w-24 text-center"
                onChange={(e) => setDraft((prev) => prev.map((r, j) => (j === i ? { ...r, qty: e.target.value } : r)))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setDraft((prev) => [...prev, { modelId: "", size: "", qty: "" }]);
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDraft((prev) => (prev.length > 1 ? prev.filter((_, j) => j !== i) : prev))}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDraft((prev) => [...prev, { modelId: "", size: "", qty: "" }])}
            >
              <Plus className="size-4" /> Item
            </Button>
            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
              Lançar nota
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-bold">Notas lançadas</h2>
        {!notes.length ? (
          <p className="text-sm text-muted-foreground">Nenhuma nota lançada ainda.</p>
        ) : (
          <div className="space-y-3">
            {notes.map((n) => (
              <div key={n.id} className="rounded border border-border p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="num text-sm font-semibold">
                    {n.note_date.split("-").reverse().join("/")}
                  </span>
                  <span className="text-sm">{n.supplier || "sem fornecedor"}</span>
                  {n.doc && <span className="num text-xs text-muted-foreground">NF {n.doc}</span>}
                  <Badge variant={n.status === "pendente" ? "secondary" : "outline"}>{n.status}</Badge>
                  <span className="num ml-auto text-sm font-bold">{int(totalOf(n.id))} peças</span>
                  {n.status === "pendente" && (
                    <Button variant="ghost" size="icon" onClick={() => remove.mutate(n.id)}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  )}
                </div>
                <p className="num mt-1 text-xs text-muted-foreground">
                  {items
                    .filter((i) => i.note_id === n.id)
                    .map((i) => `${modelName(i.model_id)} ${i.size} ${i.qty}`)
                    .join(" · ")}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* --------------------------------- rateio --------------------------------- */

function Rateio({
  models,
  companies,
  pendingItems,
  pendingNoteIds,
  reference,
  deficit,
  referenceLabel,
  onClosed,
}: {
  models: ResaleModel[];
  companies: Company[];
  pendingItems: CounterNoteItem[];
  pendingNoteIds: string[];
  deficit: Map<string, Map<string, number>>;
  reference: Map<string, Map<string, number>>;
  referenceLabel: string | null;
  onClosed: () => void;
}) {
  const [alloc, setAlloc] = useState<Record<string, string>>({});

  const rows = useMemo(() => {
    const map = new Map<string, { modelId: string; size: string; qty: number }>();
    for (const i of pendingItems) {
      if (!i.model_id) continue;
      const k = `${i.model_id}|${i.size}`;
      const cur = map.get(k);
      if (cur) cur.qty += i.qty;
      else map.set(k, { modelId: i.model_id, size: i.size, qty: i.qty });
    }
    return [...map.values()].sort((a, b) => {
      const ma = models.find((m) => m.id === a.modelId);
      const mb = models.find((m) => m.id === b.modelId);
      if (ma?.sort_order !== mb?.sort_order) return (ma?.sort_order ?? 0) - (mb?.sort_order ?? 0);
      return (ma?.sizes.indexOf(a.size) ?? 0) - (mb?.sizes.indexOf(b.size) ?? 0);
    });
  }, [pendingItems, models]);

  const key = (modelId: string, size: string, companyId: string) => `${modelId}|${size}|${companyId}`;
  const val = (k: string) => Number(alloc[k] ?? "") || 0;

  /** Referência por modelo (soma de todos os tamanhos) — usada quando o tamanho não tem histórico. */
  const modelReference = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const m of models) {
      const per = new Map<string, number>();
      for (const size of m.sizes.length ? m.sizes : [""]) {
        const r = reference.get(refKey(m.id, size));
        if (!r) continue;
        for (const [cid, q] of r) per.set(cid, (per.get(cid) ?? 0) + q);
      }
      if (per.size) map.set(m.id, per);
    }
    return map;
  }, [models, reference]);

  /** Saldo em aberto (vendido − já entrado em nota no mês) por modelo+tamanho. */
  const openBalance = (modelId: string, size: string) => deficit.get(refKey(modelId, size));

  /**
   * Cobre primeiro quem ainda está com nota atrasada (vendeu mais do que entrou)
   * e só depois distribui o que sobrar pela proporção histórica.
   */
  const buildSuggestion = () => {
    const next: Record<string, string> = {};
    for (const r of rows) {
      const result = new Map<string, number>();
      let left = r.qty;

      const need = openBalance(r.modelId, r.size);
      if (need) {
        // Menor falta primeiro: garante que a empresa pequena não fique sem nota
        // só porque a grande "engoliu" toda a nota.
        for (const [cid, qty] of [...need.entries()].sort((a, b) => a[1] - b[1])) {
          if (left <= 0) break;
          if (!companies.some((c) => c.id === cid)) continue;
          const take = Math.min(left, qty);
          result.set(cid, (result.get(cid) ?? 0) + take);
          left -= take;
        }
      }

      if (left > 0) {
        const per = reference.get(refKey(r.modelId, r.size)) ?? modelReference.get(r.modelId);
        const total = per ? [...per.values()].reduce((a, b) => a + b, 0) : 0;
        if (total) {
          const remaining = left;
          const parts = companies.map((c) => {
            const exact = ((per?.get(c.id) ?? 0) / total) * remaining;
            return { c, base: Math.floor(exact), rest: exact - Math.floor(exact) };
          });
          left = remaining - parts.reduce((a, p) => a + p.base, 0);
          for (const p of [...parts].sort((a, b) => b.rest - a.rest)) {
            if (left <= 0) break;
            p.base += 1;
            left -= 1;
          }
          for (const p of parts)
            if (p.base > 0) result.set(p.c.id, (result.get(p.c.id) ?? 0) + p.base);
        }
      }

      for (const [cid, qty] of result)
        if (qty > 0) next[key(r.modelId, r.size, cid)] = String(qty);
    }
    return next;
  };

  const suggest = () => {
    setAlloc(buildSuggestion());
    toast.success("Sugestão preenchida pelo saldo em aberto");
  };

  /** Preenche sozinho assim que houver notas pendentes e referência disponível. */
  const autoFilled = useRef("");
  useEffect(() => {
    const sig =
      rows.map((r) => `${r.modelId}|${r.size}|${r.qty}`).join(";") +
      `#${reference.size}#${deficit.size}`;
    if (!rows.length || !reference.size || autoFilled.current === sig) return;
    autoFilled.current = sig;
    setAlloc(buildSuggestion());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, reference, deficit, companies, models]);


  const close = useMutation({
    mutationFn: async () => {
      const payload = rows.flatMap((r) =>
        companies
          .map((c) => ({ c, qty: val(key(r.modelId, r.size, c.id)) }))
          .filter((x) => x.qty > 0)
          .map((x) => ({
            model_id: r.modelId,
            model_name: models.find((m) => m.id === r.modelId)?.name ?? "",
            size: r.size,
            company_id: x.c.id,
            company_name: x.c.name,
            qty: x.qty,
          })),
      );
      if (!payload.length) throw new Error("Distribua ao menos uma peça antes de fechar");
      const today = new Date();
      const { data, error } = await supabase
        .from("resale_cycles")
        .insert({
          closed_on: today.toISOString().slice(0, 10),
          label: `Ciclo ${today.toLocaleDateString("pt-BR")}`,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Primeiro "reserva" as notas pendentes: se outra aba já fechou o ciclo,
      // nada é reservado e desfazemos este ciclo em vez de duplicar o rateio.
      const { data: claimed, error: notesError } = await supabase
        .from("counter_notes")
        .update({ status: "faturada", cycle_id: data.id })
        .in("id", pendingNoteIds)
        .eq("status", "pendente")
        .select("id");
      if (notesError) {
        await supabase.from("resale_cycles").delete().eq("id", data.id);
        throw notesError;
      }
      if ((claimed?.length ?? 0) !== pendingNoteIds.length) {
        await supabase
          .from("counter_notes")
          .update({ status: "pendente", cycle_id: null })
          .eq("cycle_id", data.id);
        await supabase.from("resale_cycles").delete().eq("id", data.id);
        throw new Error("Essas notas já foram fechadas em outro ciclo. Atualize a tela.");
      }

      const { error: allocError } = await supabase
        .from("resale_cycle_allocations")
        .insert(payload.map((p) => ({ ...p, cycle_id: data.id })));
      if (allocError) {
        await supabase
          .from("counter_notes")
          .update({ status: "pendente", cycle_id: null })
          .eq("cycle_id", data.id);
        await supabase.from("resale_cycles").delete().eq("id", data.id);
        throw allocError;
      }
    },
    onSuccess: () => {
      toast.success("Ciclo fechado — mensagem disponível no histórico");
      setAlloc({});
      onClosed();
    },
    onError: (e: Error) => {
      toast.error(friendlyError(e));
      onClosed();
    },
  });


  if (!rows.length) {
    return (
      <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        Nenhuma nota de balcão pendente. Lance as notas para montar o rateio do ciclo.
      </div>
    );
  }

  const preview = buildMessage(
    rows.flatMap((r) =>
      companies
        .map((c) => ({ c, qty: val(key(r.modelId, r.size, c.id)) }))
        .filter((x) => x.qty > 0)
        .map((x) => ({
          model_name: models.find((m) => m.id === r.modelId)?.name ?? "",
          model_id: r.modelId,
          size: r.size,
          company_name: x.c.name,
          qty: x.qty,
        })),
    ),
    models,
  );

  /** Empresas que, nesta distribuição, receberiam mais nota do que venderam no mês. */
  const excess = companies
    .map((c) => ({
      name: c.name,
      qty: rows.reduce((acc, r) => {
        const falta = openBalance(r.modelId, r.size)?.get(c.id) ?? 0;
        return acc + Math.max(0, val(key(r.modelId, r.size, c.id)) - falta);
      }, 0),
    }))
    .filter((e) => e.qty > 0);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Distribuição das peças pegas no balcão</h2>
            <p className="text-sm text-muted-foreground">
              Referência:{" "}
              {referenceLabel ? `vendas de ${referenceLabel} por empresa` : "nenhuma planilha importada"}.
              Você digita o número real.
            </p>
          </div>
          <Button variant="secondary" onClick={suggest}>
            <Wand2 className="size-4" /> Sugerir pelo saldo em aberto
          </Button>
        </div>

        <div className="space-y-4">
          {rows.map((r) => {
            const per = reference.get(refKey(r.modelId, r.size));
            const total = per ? [...per.values()].reduce((a, b) => a + b, 0) : 0;
            const distributed = companies.reduce((a, c) => a + val(key(r.modelId, r.size, c.id)), 0);
            const diff = r.qty - distributed;
            return (
              <div key={`${r.modelId}|${r.size}`} className="rounded border border-border p-3">
                <div className="mb-2 flex flex-wrap items-center gap-3">
                  <span className="font-bold">
                    {models.find((m) => m.id === r.modelId)?.name} — {r.size || "único"}
                  </span>
                  <span className="num text-sm text-muted-foreground">
                    pego no balcão: <strong className="text-foreground">{int(r.qty)}</strong>
                  </span>
                  <Badge
                    className="ml-auto"
                    variant={diff === 0 ? "default" : "secondary"}
                  >
                    {diff === 0
                      ? "distribuído"
                      : diff > 0
                        ? `faltam ${int(diff)}`
                        : `sobram ${int(-diff)}`}
                  </Badge>
                </div>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {companies.map((c) => {
                    const ref = per?.get(c.id);
                    const falta = openBalance(r.modelId, r.size)?.get(c.id) ?? 0;
                    const k = key(r.modelId, r.size, c.id);
                    return (
                      <div key={c.id} className="flex items-center gap-2">
                        <span className="w-36 truncate text-sm font-medium">{c.name}</span>
                        <Input
                          value={alloc[k] ?? ""}
                          inputMode="numeric"
                          className="num h-9 w-20 text-center"
                          onChange={(e) => setAlloc((prev) => ({ ...prev, [k]: e.target.value }))}
                        />
                        <span className="num text-xs text-muted-foreground">
                          {ref
                            ? `ref.: ${int(ref)} vendidas (${Math.round((ref / (total || 1)) * 100)}%)`
                            : "sem histórico"}
                          {falta > 0 ? ` · falta ${int(falta)}` : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button onClick={() => close.mutate()} disabled={close.isPending}>
            Fechar ciclo e gerar mensagem
          </Button>
          {excess.length > 0 && (
            <span className="num text-xs text-muted-foreground">
              acima do vendido:{" "}
              {excess.map((e) => `${e.name} +${int(e.qty)}`).join(" · ")} (vira estoque)
            </span>
          )}
        </div>
      </section>

      {preview && <MessageBlock title="Prévia da mensagem" text={preview} />}
    </div>
  );
}

/* -------------------------------- mensagem -------------------------------- */

type MsgRow = { model_id: string | null; model_name: string; size: string; company_name: string; qty: number };

function buildMessage(rows: MsgRow[], models: ResaleModel[]) {
  if (!rows.length) return "";
  const byModel = new Map<string, MsgRow[]>();
  for (const r of rows) {
    const list = byModel.get(r.model_name) ?? [];
    list.push(r);
    byModel.set(r.model_name, list);
  }
  const ordered = [...byModel.entries()].sort((a, b) => {
    const ia = models.find((m) => m.name === a[0])?.sort_order ?? 999;
    const ib = models.find((m) => m.name === b[0])?.sort_order ?? 999;
    return ia - ib;
  });

  const blocks: string[] = [];
  for (const [modelName, list] of ordered) {
    const sizes = models.find((m) => m.name === modelName)?.sizes ?? [];
    const byCompany = new Map<string, MsgRow[]>();
    for (const r of list) {
      const arr = byCompany.get(r.company_name) ?? [];
      arr.push(r);
      byCompany.set(r.company_name, arr);
    }
    const lines = [modelName, "Distribuir como:"];
    for (const [company, arr] of byCompany) {
      const parts = arr
        .filter((r) => r.qty > 0)
        .sort((a, b) => sizes.indexOf(a.size) - sizes.indexOf(b.size))
        .map((r) => `${r.size || "un"} ${r.qty}`);
      if (parts.length) lines.push(`▸ ${company}: ${parts.join(" · ")}`);
    }
    if (lines.length > 2) blocks.push(lines.join("\n"));
  }
  return blocks.join("\n\n");
}

function MessageBlock({ title, text }: { title: string; text: string }) {
  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-bold">{title}</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            navigator.clipboard.writeText(text);
            toast.success("Mensagem copiada");
          }}
        >
          <Copy className="size-4" /> Copiar
        </Button>
      </div>
      <pre className="num whitespace-pre-wrap rounded border border-border bg-secondary/40 p-4 text-sm leading-6">
        {text}
      </pre>
    </section>
  );
}

/* --------------------------------- códigos -------------------------------- */

function Codes({
  codeMap,
  models,
  companies,
  sales,
  ownGroups,
  onChange,
}: {
  codeMap: ReturnType<typeof useQuery<Awaited<ReturnType<typeof fetchCodeMap>>>>["data"] extends undefined
    ? never
    : Awaited<ReturnType<typeof fetchCodeMap>>;
  models: ResaleModel[];
  companies: Company[];
  sales: Awaited<ReturnType<typeof fetchResaleSales>>;
  ownGroups: string[];
  onChange: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const list = showAll ? codeMap : codeMap.filter((c) => !c.model_id && !c.is_own);

  const save = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: { model_id?: string | null; size?: string; is_own?: boolean; own_group?: string };
    }) => {
      const { error } = await supabase.from("resale_code_map").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: onChange,
    onError: (e: Error) => toast.error(e.message),
  });

  const autoFill = useMutation({
    mutationFn: async () => {
      const pending = codeMap.filter((c) => !c.model_id && !c.is_own);
      for (const c of pending) {
        const model = guessModel(c.last_description, models);
        if (!model) continue;
        const size = guessSize(c.last_description, model.sizes.length ? model.sizes : ALL_SIZES);
        const { error } = await supabase
          .from("resale_code_map")
          .update({ model_id: model.id, size })
          .eq("id", c.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Sugestões aplicadas — confira antes de usar");
      onChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const qtyOf = (companyId: string, code: string) =>
    sales.filter((s) => s.company_id === companyId && s.code === code).reduce((a, s) => a + s.qty, 0);

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Códigos de produto</h2>
          <p className="text-sm text-muted-foreground">
            Cada código de cada empresa é ligado uma única vez a um modelo e tamanho. Depois disso a
            importação classifica sozinha.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => autoFill.mutate()} disabled={autoFill.isPending}>
            <Wand2 className="size-4" /> Sugerir pelos nomes
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Ver só pendentes" : "Ver todos"}
          </Button>
        </div>
      </div>

      {!list.length ? (
        <p className="text-sm text-muted-foreground">Nenhum código pendente.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Código</TableHead>
                <TableHead className="w-40">Empresa</TableHead>
                <TableHead>Descrição na planilha</TableHead>
                <TableHead className="w-24 text-right">Vendidas</TableHead>
                <TableHead className="w-72">Modelo</TableHead>
                <TableHead className="w-28">Tamanho</TableHead>
                <TableHead className="w-52">Fabricação própria</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((c) => {
                const model = models.find((m) => m.id === c.model_id);
                const sizes = model?.sizes.length ? model.sizes : ALL_SIZES;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="num font-semibold">{c.code}</TableCell>
                    <TableCell className="text-sm">
                      {companies.find((x) => x.id === c.company_id)?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">{c.last_description}</TableCell>
                    <TableCell className="num text-right">{int(qtyOf(c.company_id, c.code))}</TableCell>
                    <TableCell>
                      <Select
                        value={c.model_id ?? ""}
                        onValueChange={(v) => save.mutate({ id: c.id, patch: { model_id: v } })}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue
                            placeholder={guessModel(c.last_description, models)?.name ?? "Escolher modelo"}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {models.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={c.size || ""}
                        onValueChange={(v) => save.mutate({ id: c.id, patch: { size: v } })}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder={guessSize(c.last_description, sizes) || "Tam."} />
                        </SelectTrigger>
                        <SelectContent>
                          {sizes.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {c.is_own ? (
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{c.own_group || "própria"}</Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              save.mutate({ id: c.id, patch: { is_own: false, own_group: "" } })
                            }
                          >
                            <RotateCcw className="size-4" />
                          </Button>
                        </div>
                      ) : (
                        <Select
                          value=""
                          onValueChange={(v) =>
                            save.mutate({
                              id: c.id,
                              patch: { is_own: true, own_group: v, model_id: null, size: "" },
                            })
                          }
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Não é revenda…" />
                          </SelectTrigger>
                          <SelectContent>
                            {ownGroups.map((g) => (
                              <SelectItem key={g} value={g}>
                                {g}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

/* --------------------------------- modelos -------------------------------- */

function Models({ models, onChange }: { models: ResaleModel[]; onChange: () => void }) {
  const [name, setName] = useState("");

  const add = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Informe o nome do modelo");
      const { error } = await supabase.from("resale_models").insert({
        name: name.trim(),
        sizes: ["P", "M", "G", "GG"],
        sort_order: models.length + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setName("");
      onChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: { name?: string; sizes?: string[] } }) => {
      const { error } = await supabase.from("resale_models").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: onChange,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("resale_models").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: onChange,
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <h2 className="mb-3 text-lg font-bold">Modelos de revenda</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Modelo</TableHead>
            <TableHead className="w-96">Tamanhos (separados por vírgula)</TableHead>
            <TableHead className="w-16" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {models.map((m) => (
            <TableRow key={m.id}>
              <TableCell>
                <Input
                  defaultValue={m.name}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== m.name) save.mutate({ id: m.id, patch: { name: v } });
                  }}
                />
              </TableCell>
              <TableCell>
                <Input
                  defaultValue={m.sizes.join(", ")}
                  className="num"
                  onBlur={(e) => {
                    const sizes = e.target.value
                      .split(",")
                      .map((s) => norm(s))
                      .filter(Boolean);
                    if (sizes.join(",") !== m.sizes.join(","))
                      save.mutate({ id: m.id, patch: { sizes } });
                  }}
                />
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="icon" onClick={() => remove.mutate(m.id)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="mt-4 flex gap-2">
        <Input
          value={name}
          placeholder="Novo modelo"
          className="w-72"
          onChange={(e) => setName(e.target.value)}
        />
        <Button variant="secondary" disabled={!name.trim() || add.isPending} onClick={() => add.mutate()}>
          <Plus className="size-4" /> Adicionar
        </Button>
      </div>
    </section>
  );
}

/* -------------------------------- histórico ------------------------------- */

function History({
  cycles,
  allocations,
  models,
  onChange,
}: {
  cycles: Awaited<ReturnType<typeof fetchCycles>>;
  allocations: ResaleAllocation[];
  models: ResaleModel[];
  onChange: () => void;
}) {
  const reopen = useMutation({
    mutationFn: async (cycleId: string) => {
      const { error } = await supabase
        .from("counter_notes")
        .update({ status: "pendente", cycle_id: null })
        .eq("cycle_id", cycleId);
      if (error) throw error;
      const { error: delError } = await supabase.from("resale_cycles").delete().eq("id", cycleId);
      if (delError) throw delError;
    },
    onSuccess: () => {
      toast.success("Ciclo reaberto — as notas voltaram para pendentes");
      onChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!cycles.length) {
    return (
      <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        Nenhum ciclo fechado ainda.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {cycles.map((c) => {
        const rows = allocations.filter((a) => a.cycle_id === c.id);
        const total = rows.reduce((a, r) => a + r.qty, 0);
        const text = buildMessage(rows, models);
        return (
          <section key={c.id} className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h3 className="font-bold">{c.label}</h3>
              <span className="num text-sm text-muted-foreground">
                {c.closed_on.split("-").reverse().join("/")} · {int(total)} peças
              </span>
              <div className="ml-auto flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(text);
                    toast.success("Mensagem copiada");
                  }}
                >
                  <Copy className="size-4" /> Copiar
                </Button>
                <Button variant="ghost" size="sm" onClick={() => reopen.mutate(c.id)}>
                  <RotateCcw className="size-4" /> Reabrir
                </Button>
              </div>
            </div>
            <pre className="num whitespace-pre-wrap rounded border border-border bg-secondary/40 p-4 text-sm leading-6">
              {text}
            </pre>
          </section>
        );
      })}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold uppercase text-muted-foreground">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/* ----------------------------- cobertura fiscal ---------------------------- */

function Coverage({
  rows,
  monthLabel,
  cycles,
}: {
  rows: CoverageRow[];
  monthLabel: string | null;
  cycles: ResaleCycle[];
}) {
  const [onlyOff, setOnlyOff] = useState(true);

  const sold = rows.reduce((a, r) => a + r.sold, 0);
  const entered = rows.reduce((a, r) => a + r.entered, 0);
  const diff = entered - sold;
  const pct = sold ? Math.round((entered / sold) * 100) : 0;
  const cyclesInMonth = cycles.filter((c) => !monthLabel || monthOf(c.closed_on) === monthLabel);

  const byCompany = new Map<string, { name: string; sold: number; entered: number }>();
  for (const r of rows) {
    const cur = byCompany.get(r.companyId) ?? { name: r.companyName, sold: 0, entered: 0 };
    cur.sold += r.sold;
    cur.entered += r.entered;
    byCompany.set(r.companyId, cur);
  }

  const visible = onlyOff ? rows.filter((r) => r.sold !== r.entered) : rows;

  if (!rows.length) {
    return (
      <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        Nenhuma venda de revenda importada para comparar. Importe a planilha do mês fechado.
      </div>
    );
  }

  const state = (r: { sold: number; entered: number }) =>
    r.entered === r.sold ? "ok" : r.entered < r.sold ? `pedir ${int(r.sold - r.entered)}` : `estoque ${int(r.entered - r.sold)}`;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">
              Cobertura fiscal {monthLabel ? `· ${monthLabel}` : "· acumulado"}
            </h2>
            <p className="text-sm text-muted-foreground">
              Saldo corrido desde 08/2026: Entrou (notas faturadas) − Vendeu (planilhas). Sobra = estoque; falta = pedir nota. Ciclos:
              {cyclesInMonth.length}. Notas pendentes só contam depois de
              fechar o ciclo.
            </p>
          </div>
          <div className="num flex flex-wrap gap-6 text-sm">
            <span>
              vendido <strong className="text-foreground">{int(sold)}</strong>
            </span>
            <span>
              entrou em nota <strong className="text-foreground">{int(entered)}</strong>
            </span>
            <span className={diff < 0 ? "text-destructive" : "text-foreground"}>
              diferença{" "}
              <strong>
                {diff > 0 ? "+" : ""}
                {int(diff)} ({pct}%)
              </strong>
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {[...byCompany.values()]
            .filter((c) => c.sold || c.entered)
            .sort((a, b) => b.sold - a.sold)
            .map((c) => (
              <div key={c.name} className="rounded border border-border p-3">
                <p className="text-sm font-bold">{c.name}</p>
                <p className="num text-xs text-muted-foreground">
                  vendeu {int(c.sold)} · entrou {int(c.entered)}
                </p>
                <Badge className="mt-1" variant={c.sold === c.entered ? "default" : "secondary"}>
                  {state(c)}
                </Badge>
              </div>
            ))}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-bold">Por modelo e tamanho</h3>
          <Button variant="secondary" size="sm" onClick={() => setOnlyOff((v) => !v)}>
            {onlyOff ? "Mostrar tudo" : "Mostrar só o desequilibrado"}
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Modelo</TableHead>
              <TableHead>Tam.</TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead className="text-right">Vendeu</TableHead>
              <TableHead className="text-right">Entrou</TableHead>
              <TableHead className="text-right">Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((r) => (
              <TableRow key={`${r.modelId}|${r.size}|${r.companyId}`}>
                <TableCell className="font-medium">{r.modelName}</TableCell>
                <TableCell>{r.size || "único"}</TableCell>
                <TableCell>{r.companyName}</TableCell>
                <TableCell className="num text-right">{int(r.sold)}</TableCell>
                <TableCell className="num text-right">{int(r.entered)}</TableCell>
                <TableCell
                  className={`num text-right ${r.entered < r.sold ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {state(r)}
                </TableCell>
              </TableRow>
            ))}
            {!visible.length && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                  Tudo equilibrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
