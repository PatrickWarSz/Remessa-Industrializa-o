import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, FileSpreadsheet, Lock, Plus, Trash2, Upload, Zap } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Messages } from "@/components/Messages";
import { FabricStock } from "@/components/FabricStock";
import {
  brl,
  defaultReference,
  effectiveQty,
  int,
  kg as kgFmt,
  type Company,
  type Factory,
  type Period,
  type ProductGroup,
  type SalesTotal,
  type Shipment,
  type ShipmentItem,
} from "@/lib/domain";
import { computeItem, roundShipment, totals as sumTotals } from "@/lib/calc";
import { friendlyError, isDuplicate } from "@/lib/dbError";

import { guessCompany, parseSalesFile, type ParsedSheet } from "@/lib/xls";
import { RESALE_GROUPS, norm } from "@/lib/resale";

import { NumberCell } from "@/routes/_authenticated/config";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/_authenticated/periodo/$id")({
  head: () => ({
    meta: [
      { title: "Mês — Vendas, Remessa e Industrialização" },
      {
        name: "description",
        content: "Importe as planilhas do mês, confira os totais por grupo e gere remessas por facção.",
      },
      { property: "og:title", content: "Mês — Vendas e Remessa" },
      { property: "og:description", content: "Totais por grupo e remessas por facção." },
    ],
  }),
  component: () => (
    <AppShell>
      <PeriodPage />
    </AppShell>
  ),
});

function PeriodPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();

  const { data: period } = useQuery({
    queryKey: ["period", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("periods").select("*").eq("id", id).single();
      if (error) throw error;
      return data as Period;
    },
  });
  const { data: companies = [] } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*").order("sort_order");
      if (error) throw error;
      return data as Company[];
    },
  });
  const { data: groups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: async () => {
      const { data, error } = await supabase.from("product_groups").select("*").order("sort_order");
      if (error) throw error;
      return data as ProductGroup[];
    },
  });
  const { data: factories = [] } = useQuery({
    queryKey: ["factories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("factories").select("*").order("sort_order");
      if (error) throw error;
      return data as Factory[];
    },
  });
  const { data: sales = [] } = useQuery({
    queryKey: ["sales", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("sales_totals").select("*").eq("period_id", id);
      if (error) throw error;
      return data as SalesTotal[];
    },
  });

  const savePeriod = useMutation({
    mutationFn: async (patch: Partial<Period>) => {
      const { error } = await supabase.from("periods").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["period", id] }),
  });

  if (!period) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  const reference = period.reference_label || defaultReference(period.label);
  const closed = !!period.closed_at;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mês ativo</p>
          <h1 className="num text-3xl font-extrabold">{period.label}</h1>
          <p className="num mt-1 text-sm text-muted-foreground">
            fechamento com as planilhas de <strong className="text-foreground">{reference}</strong>
          </p>
        </div>
        <fieldset disabled={closed} className="flex flex-wrap items-end gap-4">
          <div>
            <label className="text-xs font-semibold uppercase text-muted-foreground">Mês de referência</label>
            <Input
              defaultValue={reference}
              className="num w-28 text-center"
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== reference) savePeriod.mutate({ reference_label: v });
              }}
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase text-muted-foreground">Tecido (R$/kg)</label>
            <NumberCell
              value={period.fabric_price_per_kg}
              step="0.01"
              className="w-32"
              onCommit={(v) => savePeriod.mutate({ fabric_price_per_kg: v ?? 0 })}
            />
          </div>
          <div className="flex flex-col items-end gap-1">
            {closed ? (
              <>
                <Badge variant="secondary" className="num">
                  <Lock className="mr-1 size-3" /> Fechado em {new Date(period.closed_at!).toLocaleDateString("pt-BR")}
                </Badge>
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline hover:text-foreground"
                  onClick={() => {
                    if (confirm(`Reabrir o mês ${period.label}? As edições voltam a ficar liberadas.`))
                      savePeriod.mutate(
                        { closed_at: null, reopened_at: new Date().toISOString() } as Partial<Period>,
                        { onSuccess: () => toast.success("Mês reaberto") },
                      );
                  }}
                >
                  reabrir mês
                </button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    const warn = sales.length === 0 ? "\n\nAtenção: nenhuma venda importada neste mês." : "";
                    if (confirm(`Fechar o mês ${period.label}? Vendas, remessas e valores ficam travados.${warn}`))
                      savePeriod.mutate({ closed_at: new Date().toISOString() } as Partial<Period>, {
                        onSuccess: () => toast.success("Mês fechado"),
                      });
                  }}
                >
                  <Lock className="size-4" /> Fechar mês
                </Button>
                {period.reopened_at && (
                  <span className="num text-xs text-muted-foreground">
                    reaberto em {new Date(period.reopened_at).toLocaleDateString("pt-BR")}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {closed && (
        <p className="rounded-md border border-border bg-secondary px-3 py-2 text-sm text-muted-foreground">
          Mês fechado: tudo está só para consulta. Para alterar, use “reabrir mês”.
        </p>
      )}

      <Tabs defaultValue="vendas">
        <TabsList>
          <TabsTrigger value="vendas">Fechamento ({reference})</TabsTrigger>
          <TabsTrigger value="remessa">Remessa e industrialização</TabsTrigger>
          <TabsTrigger value="mensagem">Mensagem</TabsTrigger>
          <TabsTrigger value="estoque">Estoque fiscal</TabsTrigger>
        </TabsList>
        <fieldset disabled={closed} className="min-w-0 disabled:[&_input]:opacity-70">
          <TabsContent value="vendas" className="space-y-6 pt-4">
            <Importer periodId={id} companies={companies} groups={groups} reference={reference} />
            <SalesTable periodId={id} companies={companies} groups={groups} sales={sales} />
          </TabsContent>
          <TabsContent value="remessa" className="pt-4">
            <Shipments
              period={period}
              companies={companies}
              groups={groups}
              factories={factories}
              sales={sales}
            />
          </TabsContent>
        </fieldset>
        <TabsContent value="mensagem" className="pt-4">
          <Messages period={period} companies={companies} groups={groups} factories={factories} />
        </TabsContent>
        <TabsContent value="estoque" className="pt-4">
          <FabricStock period={period} companies={companies} groups={groups} compact />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------------------------- import --------------------------------- */

type Staged = ParsedSheet & { companyId: string | null };

function Importer({
  periodId,
  companies,
  groups,
  reference,
}: {
  periodId: string;
  companies: Company[];
  groups: ProductGroup[];
  reference: string;
}) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [staged, setStaged] = useState<Staged[]>([]);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const parsed: Staged[] = [];
    for (const file of Array.from(files)) {
      try {
        const buf = await file.arrayBuffer();
        const sheet = parseSalesFile(file.name, buf);
        parsed.push({ ...sheet, companyId: guessCompany(file.name, companies)?.id ?? null });
      } catch {
        toast.error(`Não consegui ler ${file.name}`);
      }
    }
    setStaged((prev) => [...prev, ...parsed]);
    if (inputRef.current) inputRef.current.value = "";
  }

  const resaleNames = useMemo(() => {
    const set = new Set(RESALE_GROUPS);
    for (const g of groups) if (g.kind === "revenda") set.add(norm(g.name));
    return set;
  }, [groups]);

  const importAll = useMutation({
    mutationFn: async () => {
      for (const sheet of staged) {
        if (!sheet.companyId) continue;

        // Códigos já marcados como fabricação própria saem da revenda e vão
        // para o grupo próprio escolhido (ex.: KIT CALCINHA SECRET).
        const { data: ownRows } = await supabase
          .from("resale_code_map")
          .select("code, own_group")
          .eq("company_id", sheet.companyId)
          .eq("is_own", true);
        const ownByCode = new Map(
          (ownRows ?? []).map((r) => [String(r.code), String(r.own_group || "")]),
        );
        const totals = { ...sheet.totals };
        for (const line of sheet.lines) {
          const target = ownByCode.get(line.code);
          if (!target) continue;
          const from = totals[line.group];
          if (from) {
            const qty = from.qty - line.qty;
            if (qty > 0) totals[line.group] = { qty, fromSets: from.fromSets };
            else delete totals[line.group];
          }
          const to = (totals[target] ??= { qty: 0, fromSets: 0 });
          to.qty += line.qty;
        }

        await supabase
          .from("sales_totals")
          .delete()
          .eq("period_id", periodId)
          .eq("company_id", sheet.companyId);
        const rows = Object.entries(totals).map(([group_name, t]) => ({
          period_id: periodId,
          company_id: sheet.companyId!,
          group_name,
          qty_sheet: t.qty,
          qty_from_sets: t.fromSets,
        }));
        if (rows.length) {
          const { error } = await supabase.from("sales_totals").insert(rows);
          if (error) throw error;
        }

        // linhas de revenda (por código) para o módulo de Revenda
        const resaleLines = sheet.lines.filter(
          (l) => resaleNames.has(norm(l.group)) && !ownByCode.has(l.code),
        );
        await supabase
          .from("resale_sales")
          .delete()
          .eq("period_id", periodId)
          .eq("company_id", sheet.companyId);
        if (resaleLines.length) {
          const { error } = await supabase.from("resale_sales").insert(
            resaleLines.map((l) => ({
              period_id: periodId,
              company_id: sheet.companyId!,
              code: l.code,
              description: l.description,
              group_name: l.group,
              qty: l.qty,
            })),
          );
          if (error) throw error;
          const { error: mapError } = await supabase.from("resale_code_map").upsert(
            resaleLines.map((l) => ({
              company_id: sheet.companyId!,
              code: l.code,
              last_description: l.description,
            })),
            { onConflict: "company_id,code", ignoreDuplicates: true },
          );
          if (mapError) throw mapError;
        }
      }
    },
    onSuccess: () => {
      toast.success("Planilhas importadas");
      setStaged([]);
      qc.invalidateQueries({ queryKey: ["sales", periodId] });
      qc.invalidateQueries({ queryKey: ["resale_sales"] });
      qc.invalidateQueries({ queryKey: ["resale_code_map"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <h2 className="text-lg font-bold">
        Importar planilhas de vendas · <span className="num">{reference}</span>
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Use os relatórios do mês de referência ({reference}). Aceita .xls e .xlsx; os conjuntos são
        destrinchados automaticamente em TOP + LEGGING/SHORT.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".xls,.xlsx,.csv"
        multiple
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />
      <Button variant="secondary" onClick={() => inputRef.current?.click()}>
        <Upload className="size-4" /> Escolher arquivos
      </Button>

      {staged.length > 0 && (
        <div className="mt-4 space-y-2">
          {staged.map((s, i) => (
            <div key={s.fileName + i} className="flex flex-wrap items-center gap-3 rounded border border-border p-3">
              <FileSpreadsheet className="size-4 text-accent" />
              <span className="flex-1 truncate text-sm font-medium">{s.fileName}</span>
              <span className="num text-xs text-muted-foreground">
                {Object.keys(s.totals).length} grupos · {int(s.rows)} linhas
              </span>
              <Select
                value={s.companyId ?? ""}
                onValueChange={(v) =>
                  setStaged((prev) => prev.map((x, j) => (j === i ? { ...x, companyId: v } : x)))
                }
              >
                <SelectTrigger className="h-8 w-52">
                  <SelectValue placeholder="Escolher empresa" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setStaged((prev) => prev.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          ))}
          <Button
            onClick={() => importAll.mutate()}
            disabled={importAll.isPending || staged.some((s) => !s.companyId)}
          >
            Importar {staged.length} planilha{staged.length > 1 ? "s" : ""}
          </Button>
        </div>
      )}
    </section>
  );
}

/* ---------------------------------- vendas --------------------------------- */

function SalesTable({
  periodId,
  companies,
  groups,
  sales,
}: {
  periodId: string;
  companies: Company[];
  groups: ProductGroup[];
  sales: SalesTotal[];
}) {
  const qc = useQueryClient();

  const groupNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const group of groups) names.set(group.name.trim().toUpperCase(), group.name);
    for (const row of sales) {
      const key = row.group_name.trim().toUpperCase();
      if (!names.has(key)) names.set(key, row.group_name);
    }
    return [...names.values()];
  }, [groups, sales]);

  const kindOf = (name: string) => groups.find((g) => g.name === name)?.kind ?? "propria";
  const cell = (companyId: string, group: string) =>
    sales.find((s) => s.company_id === companyId && s.group_name === group);

  const setQty = useMutation({
    mutationFn: async ({ companyId, group, value }: { companyId: string; group: string; value: number | null }) => {
      const existing = cell(companyId, group);
      if (existing) {
        const { error } = await supabase
          .from("sales_totals")
          .update({ qty_adjusted: value })
          .eq("id", existing.id);
        if (error) throw error;
      } else if (value != null) {
        const { error } = await supabase.from("sales_totals").insert({
          period_id: periodId,
          company_id: companyId,
          group_name: group,
          qty_sheet: 0,
          qty_from_sets: 0,
          qty_adjusted: value,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sales", periodId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const rowTotal = (group: string) =>
    companies.reduce((acc, c) => {
      const r = cell(c.id, group);
      return acc + (r ? effectiveQty(r) : 0);
    }, 0);

  const render = (kind: "propria" | "revenda") => {
    const names = groupNames.filter((n) => kindOf(n) === kind);
    if (!names.length) return null;
    return (
      <div className="mt-5">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {kind === "propria" ? "Fabricação própria" : "Revenda"}
        </h3>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-36">Grupo</TableHead>
                {companies.map((c) => (
                  <TableHead key={c.id} className="w-32 text-center">
                    {c.name}
                  </TableHead>
                ))}
                <TableHead className="w-28 text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {names.map((name) => (
                <TableRow key={name}>
                  <TableCell className="font-semibold">{name}</TableCell>
                  {companies.map((c) => {
                    const row = cell(c.id, name);
                    return (
                      <TableCell key={c.id}>
                        <NumberCell
                          value={row ? effectiveQty(row) : null}
                          className="text-center"
                          onCommit={(v) =>
                            setQty.mutate({
                              companyId: c.id,
                              group: name,
                              value: row && v === row.qty_sheet ? null : v,
                            })
                          }
                        />
                        {row && row.qty_from_sets > 0 && (
                          <p className="num mt-1 text-[10px] text-muted-foreground">
                            inclui {int(row.qty_from_sets)} de conjunto
                          </p>
                        )}
                      </TableCell>
                    );
                  })}
                  <TableCell className="num text-right text-base font-bold">{int(rowTotal(name))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  };

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <h2 className="text-lg font-bold">Totais por grupo</h2>
      <p className="text-sm text-muted-foreground">
        Os números vêm da planilha; edite qualquer célula para ajustar antes de gerar a remessa.
      </p>
      {render("propria")}
      {render("revenda")}
    </section>
  );
}

/* --------------------------------- remessa --------------------------------- */

function Shipments({
  period,
  companies,
  groups,
  factories,
  sales,
}: {
  period: Period;
  companies: Company[];
  groups: ProductGroup[];
  factories: Factory[];
  sales: SalesTotal[];
}) {
  const qc = useQueryClient();

  const { data: shipments = [] } = useQuery({
    queryKey: ["shipments", period.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shipments")
        .select("*")
        .eq("period_id", period.id)
        .order("sort_order");
      if (error) throw error;
      return data as Shipment[];
    },
  });
  const { data: items = [] } = useQuery({
    queryKey: ["shipment_items", period.id],
    enabled: shipments.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shipment_items")
        .select("*")
        .in("shipment_id", shipments.map((s) => s.id))
        .order("sort_order");
      if (error) throw error;
      return data as ShipmentItem[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["shipments", period.id] });
    qc.invalidateQueries({ queryKey: ["shipment_items", period.id] });
  };

  const propriaNames = groups.filter((g) => g.kind === "propria").map((g) => g.name);

  const generate = useMutation({
    mutationFn: async () => {
      const existing = new Set(shipments.filter((s) => !s.is_extra).map((s) => s.company_id));
      let order = shipments.length;
      let created = 0;
      for (const company of companies) {
        if (existing.has(company.id)) continue;
        const rows = sales.filter(
          (s) => s.company_id === company.id && propriaNames.includes(s.group_name) && effectiveQty(s) > 0,
        );
        if (!rows.length) continue;
        const { data, error } = await supabase
          .from("shipments")
          .insert({
            period_id: period.id,
            company_id: company.id,
            title: `${company.name} — ${period.label}`,
            sort_order: ++order,
          })
          .select()
          .single();
        // Outra aba (ou um clique duplo) já criou a remessa dessa empresa: apenas ignora.
        if (error && isDuplicate(error)) continue;
        if (error) throw error;
        const shipment = data as Shipment;
        const payload = rows
          .sort((a, b) => propriaNames.indexOf(a.group_name) - propriaNames.indexOf(b.group_name))
          .map((r, i) => {
            const g = groups.find((x) => x.name === r.group_name);
            return {
              shipment_id: shipment.id,
              group_name: r.group_name,
              qty: effectiveQty(r),
              yield_per_kg: g?.yield_per_kg ?? null,
              unit_price: g?.unit_price ?? null,
              sort_order: i + 1,
            };
          });
        const { error: itemsError } = await supabase.from("shipment_items").insert(payload);
        if (itemsError && !isDuplicate(itemsError)) throw itemsError;
        created++;
      }
      return created;
    },
    onSuccess: (created) => {
      toast.success(created ? `${created} remessa(s) gerada(s)` : "Nada novo para gerar");
      refresh();
    },
    onError: (e: Error) => {
      toast.error(friendlyError(e));
      refresh();
    },
  });


  const addExtra = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("shipments").insert({
        period_id: period.id,
        title: "Remessa avulsa",
        is_extra: true,
        sort_order: shipments.length + 1,
      });
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const valueOf = (shipmentId: string) =>
    sumTotals(items.filter((i) => i.shipment_id === shipmentId).map((i) => computeItem(i, groups)));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
          <Zap className="size-4" /> Gerar remessas do mês
        </Button>
        <Button variant="secondary" onClick={() => addExtra.mutate()}>
          <Plus className="size-4" /> Remessa avulsa
        </Button>
      </div>

      <FactorySummary
        factories={factories}
        shipments={shipments}
        valueOf={(id) => valueOf(id).value}
      />

      {shipments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Nenhuma remessa ainda. Gere a partir dos totais de vendas ou crie uma avulsa.
        </div>
      ) : (
        shipments.map((s) => (
          <ShipmentCard
            key={s.id}
            shipment={s}
            items={items.filter((i) => i.shipment_id === s.id)}
            groups={groups}
            companies={companies}
            factories={factories}
            period={period}
            onChange={refresh}
          />
        ))
      )}
    </div>
  );
}

function FactorySummary({
  factories,
  shipments,
  valueOf,
}: {
  factories: Factory[];
  shipments: Shipment[];
  valueOf: (id: string) => number;
}) {
  if (!factories.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {factories.map((f) => {
        const used = shipments.filter((s) => s.factory_id === f.id).reduce((a, s) => a + valueOf(s.id), 0);
        const pct = f.monthly_limit ? (used / f.monthly_limit) * 100 : 0;
        const over = f.monthly_limit > 0 && used > f.monthly_limit;
        return (
          <div key={f.id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="font-bold">{f.name}</span>
              <Badge variant={over ? "destructive" : "secondary"}>
                {over ? "estourou o limite" : `${Math.round(pct)}% do teto`}
              </Badge>
            </div>
            <p className="num mt-2 text-xl font-extrabold">{brl(used)}</p>
            <p className="num text-xs text-muted-foreground">
              limite {brl(f.monthly_limit)} · resta {brl(Math.max(f.monthly_limit - used, 0))}
            </p>
            <Progress value={Math.min(pct, 100)} className="mt-3" />
          </div>
        );
      })}
    </div>
  );
}

function ShipmentCard({
  shipment,
  items,
  groups,
  companies,
  factories,
  period,
  onChange,
}: {
  shipment: Shipment;
  items: ShipmentItem[];
  groups: ProductGroup[];
  companies: Company[];
  factories: Factory[];
  period: Period;
  onChange: () => void;
}) {
  const [newGroup, setNewGroup] = useState("");
  const [rounding, setRounding] = useState(false);
  const [lastRound, setLastRound] = useState<{ id: string; from: number; to: number }[] | null>(null);
  const computed = items.map((i) => computeItem(i, groups));
  const total = sumTotals(computed);
  const fabricValue = total.kg * period.fabric_price_per_kg;

  const run = async (fn: () => PromiseLike<{ error: unknown }>) => {
    const { error } = await fn();
    if (error) toast.error((error as { message?: string }).message ?? "Erro ao salvar");
    onChange();
  };

  const roundAll = async () => {
    const rows = roundShipment(items, groups);
    const changed = rows.filter((r) => r.to !== r.from);
    if (!changed.length) {
      toast.info("Já está arredondado em kg cheios");
      return;
    }
    setRounding(true);
    const done: { id: string; from: number; to: number }[] = [];
    for (const r of changed) {
      const { error } = await supabase.from("shipment_items").update({ qty: r.to }).eq("id", r.id);
      if (error) {
        toast.error(error.message);
        break;
      }
      done.push({ id: r.id, from: r.from, to: r.to });
    }
    setRounding(false);
    if (done.length) setLastRound(done);
    onChange();
  };

  const undoRound = async () => {
    if (!lastRound) return;
    setRounding(true);
    for (const r of lastRound) {
      const { error } = await supabase.from("shipment_items").update({ qty: r.from }).eq("id", r.id);
      if (error) {
        toast.error(error.message);
        break;
      }
    }
    setRounding(false);
    setLastRound(null);
    onChange();
  };

  const roundAdded = lastRound?.reduce((a, r) => a + (r.to - r.from), 0) ?? 0;



  const copy = () => {
    const lines = [
      `${shipment.title}`,
      `REMESSA: ${total.kg.toFixed(3)} kg de tecido — ${brl(fabricValue)}`,
      "INDUSTRIALIZAÇÃO:",
      ...computed.map(
        (i) =>
          `  ${i.group_name}: ${int(i.qty)} pç · ${i.kg.toFixed(3)} kg · ${brl(i.value)}`,
      ),
      `TOTAL INDUSTRIALIZAÇÃO: ${brl(total.value)}`,
    ];
    navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Resumo copiado");
  };

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="flex-1 text-lg font-bold">{shipment.title}</h3>
        {shipment.is_extra && <Badge variant="outline">avulsa</Badge>}
        <Select
          value={shipment.company_id ?? ""}
          onValueChange={(v) =>
            run(() => supabase.from("shipments").update({ company_id: v }).eq("id", shipment.id))
          }
        >
          <SelectTrigger className="h-9 w-48">
            <SelectValue placeholder="Empresa" />
          </SelectTrigger>
          <SelectContent>
            {companies.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={shipment.factory_id ?? ""}
          onValueChange={(v) =>
            run(() => supabase.from("shipments").update({ factory_id: v }).eq("id", shipment.id))
          }
        >
          <SelectTrigger className="h-9 w-44">
            <SelectValue placeholder="Facção (MEI)" />
          </SelectTrigger>
          <SelectContent>
            {factories.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="secondary" size="sm" onClick={roundAll} disabled={rounding}>
          Arredondar
        </Button>
        {lastRound && (
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="num">
              {roundAdded > 0 ? `+${int(roundAdded)} pç no arredondamento` : "sem acréscimo de peças"}
            </span>
            <button
              type="button"
              onClick={undoRound}
              disabled={rounding}
              className="underline underline-offset-2 hover:text-foreground"
            >
              reverter
            </button>
          </span>
        )}

        <Button variant="ghost" size="icon" onClick={copy}>
          <Copy className="size-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => run(() => supabase.from("shipments").delete().eq("id", shipment.id))}
        >
          <Trash2 className="size-4 text-destructive" />
        </Button>
      </div>

      <div className="mt-4 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-36">Grupo</TableHead>
              <TableHead className="w-28">Peças</TableHead>
              <TableHead className="w-28">Rend. pç/kg</TableHead>
              <TableHead className="w-28">Valor un.</TableHead>
              <TableHead className="w-28 text-right">Tecido</TableHead>
              <TableHead className="w-32 text-right">Industrialização</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {computed.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-semibold">{c.group_name}</TableCell>
                <TableCell>
                  <NumberCell
                    value={c.qty}
                    onCommit={(v) =>
                      run(() => supabase.from("shipment_items").update({ qty: v ?? 0 }).eq("id", c.id))
                    }
                  />
                </TableCell>
                <TableCell>
                  <NumberCell
                    value={c.yield_per_kg}
                    onCommit={(v) =>
                      run(() => supabase.from("shipment_items").update({ yield_per_kg: v }).eq("id", c.id))
                    }
                  />
                </TableCell>
                <TableCell>
                  <NumberCell
                    value={c.unit_price}
                    step="0.01"
                    onCommit={(v) =>
                      run(() => supabase.from("shipment_items").update({ unit_price: v }).eq("id", c.id))
                    }
                  />
                </TableCell>
                <TableCell className="num text-right">{kgFmt(c.kg)}</TableCell>
                <TableCell className="num text-right font-semibold">{brl(c.value)}</TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => run(() => supabase.from("shipment_items").delete().eq("id", c.id))}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Select value={newGroup} onValueChange={setNewGroup}>
          <SelectTrigger className="h-9 w-52">
            <SelectValue placeholder="Adicionar grupo" />
          </SelectTrigger>
          <SelectContent>
            {groups.map((g) => (
              <SelectItem key={g.id} value={g.name}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="secondary"
          disabled={!newGroup}
          onClick={() => {
            const g = groups.find((x) => x.name === newGroup);
            run(() =>
              supabase.from("shipment_items").insert({
                shipment_id: shipment.id,
                group_name: newGroup,
                qty: 0,
                yield_per_kg: g?.yield_per_kg ?? null,
                unit_price: g?.unit_price ?? null,
                sort_order: items.length + 1,
              }),
            );
            setNewGroup("");
          }}
        >
          <Plus className="size-4" /> Incluir
        </Button>
        <div className="ml-auto flex flex-wrap gap-6 text-right">
          <div>
            <p className="text-xs uppercase text-muted-foreground">Remessa de tecido</p>
            <p className="num text-lg font-extrabold">
              {kgFmt(total.kg)} · {brl(fabricValue)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">Industrialização</p>
            <p className="num text-lg font-extrabold text-accent">{brl(total.value)}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
