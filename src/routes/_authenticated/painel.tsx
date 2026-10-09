import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { computeItem, totals as sumTotals } from "@/lib/calc";
import { useShipments } from "@/lib/useShipments";
import {
  brl,
  effectiveQty,
  ensureSeed,
  int,
  kgNum,
  type Company,
  type FabricMove,
  type Factory,
  type Period,
  type ProductGroup,
  type SalesTotal,
} from "@/lib/domain";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [
      { title: "Painel — Central de Remessa" },
      {
        name: "description",
        content:
          "Visão geral do mês: peças vendidas, tecido em remessa, industrialização, teto dos MEIs, estoque fiscal e revenda.",
      },
      { property: "og:title", content: "Painel da operação" },
      {
        property: "og:description",
        content: "Peças, tecido, industrialização, teto dos MEIs e estoque fiscal em uma tela.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <Dashboard />
    </AppShell>
  ),
});

function Card({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "accent" | "destructive" | undefined;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`num mt-1 text-2xl font-extrabold ${
          tone === "accent" ? "text-accent" : tone === "destructive" ? "text-destructive" : ""
        }`}
      >
        {value}
      </p>
      {hint && <p className="num mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Dashboard() {
  const { data: periods = [] } = useQuery({
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

  const [periodId, setPeriodId] = useState<string>("");
  const period = periods.find((p) => p.id === periodId) ?? periods[0] ?? null;

  const { data: companies = [] } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*").order("sort_order");
      if (error) throw error;
      return data as Company[];
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

  const { data: groups = [] } = useQuery({
    queryKey: ["product_groups"],
    queryFn: async () => {
      const { data, error } = await supabase.from("product_groups").select("*").order("sort_order");
      if (error) throw error;
      return data as ProductGroup[];
    },
  });

  const { data: sales = [] } = useQuery({
    queryKey: ["sales_totals", period?.id],
    enabled: !!period,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_totals")
        .select("*")
        .eq("period_id", period!.id);
      if (error) throw error;
      return data as SalesTotal[];
    },
  });

  const { data: moves = [] } = useQuery({
    queryKey: ["fabric_moves"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fabric_moves").select("*");
      if (error) throw error;
      return data as FabricMove[];
    },
  });

  const { data: resale } = useQuery({
    queryKey: ["dashboard_resale"],
    queryFn: async () => {
      const [notes, items, cycles] = await Promise.all([
        supabase.from("counter_notes").select("id,status,note_date"),
        supabase.from("counter_note_items").select("note_id,qty"),
        supabase.from("resale_cycles").select("id,label,closed_on").order("closed_on", { ascending: false }).limit(1),
      ]);
      if (notes.error) throw notes.error;
      if (items.error) throw items.error;
      if (cycles.error) throw cycles.error;
      const pending = new Set(
        (notes.data as { id: string; status: string }[])
          .filter((n) => n.status === "pendente")
          .map((n) => n.id),
      );
      const pendingPieces = (items.data as { note_id: string; qty: number }[])
        .filter((i) => pending.has(i.note_id))
        .reduce((a, i) => a + i.qty, 0);
      return {
        pendingNotes: pending.size,
        pendingPieces,
        lastCycle: (cycles.data as { label: string; closed_on: string }[] | null)?.[0] ?? null,
      };
    },
  });

  const { shipments, items } = useShipments(period?.id ?? "");

  const perShipment = useMemo(
    () =>
      shipments.map((s) => {
        const computed = items.filter((i) => i.shipment_id === s.id).map((i) => computeItem(i, groups));
        const t = sumTotals(computed);
        const pieces = computed.reduce((a, c) => a + c.qty, 0);
        return { shipment: s, pieces, kg: t.kg, value: t.value };
      }),
    [shipments, items, groups],
  );

  const totalKg = perShipment.reduce((a, s) => a + s.kg, 0);
  const totalValue = perShipment.reduce((a, s) => a + s.value, 0);
  const totalPieces = perShipment.reduce((a, s) => a + s.pieces, 0);
  const fabricCost = totalKg * (period?.fabric_price_per_kg ?? 0);

  const ownGroups = new Set(groups.filter((g) => g.kind === "propria").map((g) => g.name));
  const soldOwn = sales
    .filter((s) => ownGroups.has(s.group_name))
    .reduce((a, s) => a + effectiveQty(s), 0);
  const soldResale = sales
    .filter((s) => !ownGroups.has(s.group_name))
    .reduce((a, s) => a + effectiveQty(s), 0);

  const coverage = soldOwn > 0 ? (totalPieces / soldOwn) * 100 : 0;

  const byGroup = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sales) {
      if (!ownGroups.has(s.group_name)) continue;
      map.set(s.group_name, (map.get(s.group_name) ?? 0) + effectiveQty(s));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sales, groups]);

  const balance = (companyId: string) =>
    moves
      .filter((m) => m.company_id === companyId)
      .reduce((a, m) => a + (m.kind === "entrada" ? m.kg : -m.kg), 0);

  const factoryUse = factories.map((f) => {
    const used = perShipment
      .filter((s) => s.shipment.factory_id === f.id)
      .reduce((a, s) => a + s.value, 0);
    return { factory: f, used, pct: f.monthly_limit ? (used / f.monthly_limit) * 100 : 0 };
  });

  const unassigned = perShipment.filter((s) => !s.shipment.factory_id).length;

  if (!period) {
    return (
      <p className="text-sm text-muted-foreground">
        Crie um mês em <Link to="/" className="underline">Meses</Link> para ver o painel.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">Painel da operação</h1>
          <p className="text-sm text-muted-foreground">
            Mês ativo <strong>{period.label}</strong> · vendas do mês de referência{" "}
            <strong>{period.reference_label || "—"}</strong>
          </p>
        </div>
        <Select value={period.id} onValueChange={setPeriodId}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {periods.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          label="Peças vendidas (própria)"
          value={int(soldOwn)}
          hint={`revenda ${int(soldResale)} pç`}
        />
        <Card
          label="Peças em industrialização"
          value={int(totalPieces)}
          hint={
            soldOwn
              ? `${coverage.toFixed(0)}% do vendido${coverage < 100 ? " — abaixo das vendas" : ""}`
              : "sem vendas importadas"
          }
          tone={soldOwn && coverage < 100 ? "destructive" : undefined}
        />
        <Card
          label="Tecido em remessa"
          value={`${kgNum(totalKg)} kg`}
          hint={`${brl(fabricCost)} em nota de remessa`}
        />
        <Card label="Industrialização do mês" value={brl(totalValue)} tone="accent" hint={`${shipments.length} remessa(s)`} />
      </div>

      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <h2 className="text-lg font-bold">Teto dos MEIs — {period.label}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {factoryUse.map(({ factory, used, pct }) => (
            <div key={factory.id} className="rounded-lg border border-border p-4">
              <div className="flex items-center justify-between">
                <p className="font-bold">{factory.name}</p>
                <Badge variant={pct > 100 ? "destructive" : pct > 80 ? "default" : "outline"}>
                  {pct.toFixed(0)}% do teto
                </Badge>
              </div>
              <p className="num mt-1 text-2xl font-extrabold">{brl(used)}</p>
              <p className="num text-xs text-muted-foreground">
                limite {brl(factory.monthly_limit)} · resta {brl(Math.max(0, factory.monthly_limit - used))}
              </p>
              <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
                <div
                  className={`h-1.5 rounded-full ${pct > 100 ? "bg-destructive" : "bg-accent"}`}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        {unassigned > 0 && (
          <p className="mt-3 text-xs text-destructive">
            {unassigned} remessa(s) sem facção definida — não entram na conta do teto.
          </p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-bold">Remessas por empresa</h2>
          <Table className="mt-2">
            <TableHeader>
              <TableRow>
                <TableHead>Remessa</TableHead>
                <TableHead className="text-right">Peças</TableHead>
                <TableHead className="text-right">Tecido</TableHead>
                <TableHead className="text-right">Industrialização</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {perShipment.map(({ shipment, pieces, kg, value }) => (
                <TableRow key={shipment.id}>
                  <TableCell className="font-semibold">
                    {shipment.title}
                    {!shipment.factory_id && (
                      <span className="ml-2 text-xs font-normal text-destructive">sem facção</span>
                    )}
                  </TableCell>
                  <TableCell className="num text-right">{int(pieces)}</TableCell>
                  <TableCell className="num text-right">{kgNum(kg)} kg</TableCell>
                  <TableCell className="num text-right font-semibold">{brl(value)}</TableCell>
                </TableRow>
              ))}
              {!perShipment.length && (
                <TableRow>
                  <TableCell colSpan={4} className="text-sm text-muted-foreground">
                    Nenhuma remessa gerada neste mês.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>

        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-bold">Vendas por grupo (fabricação própria)</h2>
          <Table className="mt-2">
            <TableHeader>
              <TableRow>
                <TableHead>Grupo</TableHead>
                <TableHead className="text-right">Peças</TableHead>
                <TableHead className="text-right">Participação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byGroup.map(([name, qty]) => (
                <TableRow key={name}>
                  <TableCell className="font-semibold">{name}</TableCell>
                  <TableCell className="num text-right">{int(qty)}</TableCell>
                  <TableCell className="num text-right text-muted-foreground">
                    {soldOwn ? ((qty / soldOwn) * 100).toFixed(1) : "0"}%
                  </TableCell>
                </TableRow>
              ))}
              {!byGroup.length && (
                <TableRow>
                  <TableCell colSpan={3} className="text-sm text-muted-foreground">
                    Importe a planilha do mês para ver as vendas.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Estoque fiscal de tecido</h2>
            <Link to="/estoque" className="text-xs underline text-muted-foreground hover:text-foreground">
              abrir
            </Link>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {companies.map((c) => {
              const saldo = balance(c.id);
              return (
                <div key={c.id} className="rounded-lg border border-border p-3">
                  <p className="text-sm font-bold">{c.name}</p>
                  <p className={`num text-xl font-extrabold ${saldo < 0 ? "text-destructive" : ""}`}>
                    {kgNum(saldo)} kg
                  </p>
                  {saldo < 0 && <p className="text-xs text-destructive">saldo negativo — falta entrada</p>}
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Revenda</h2>
            <Link to="/revenda" className="text-xs underline text-muted-foreground hover:text-foreground">
              abrir
            </Link>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Card label="Notas pendentes" value={int(resale?.pendingNotes ?? 0)} hint="aguardando rateio" />
            <Card label="Peças a distribuir" value={int(resale?.pendingPieces ?? 0)} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Último ciclo fechado:{" "}
            {resale?.lastCycle
              ? `${resale.lastCycle.label || "—"} em ${new Date(resale.lastCycle.closed_on).toLocaleDateString("pt-BR")}`
              : "nenhum"}
          </p>
        </section>
      </div>
    </div>
  );
}
