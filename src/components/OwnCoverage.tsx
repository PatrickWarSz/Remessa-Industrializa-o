import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { effectiveQty, int, kgNum, type Company, type Period, type ProductGroup, type SalesTotal } from "@/lib/domain";
import { labelKey, ownCoverage, OWN_COVERAGE_START, SAFETY_RATIO, type OwnMonth } from "@/lib/ownCoverage";
import { RESALE_GROUPS, norm } from "@/lib/resale";

const STATUS = {
  falta: { label: "falta", cls: "bg-destructive text-destructive-foreground" },
  abaixo: { label: "abaixo do colchão", cls: "bg-accent text-accent-foreground" },
  ok: { label: "coberto", cls: "bg-primary text-primary-foreground" },
  excesso: { label: "estoque alto", cls: "bg-secondary text-secondary-foreground" },
};

export function OwnCoverage({
  period,
  companies,
  groups,
}: {
  period: Period;
  companies: Company[];
  groups: ProductGroup[];
}) {
  const { data } = useQuery({
    queryKey: ["own_coverage"],
    queryFn: async () => {
      const [p, s, sh, it] = await Promise.all([
        supabase.from("periods").select("id,label"),
        supabase.from("sales_totals").select("*"),
        supabase.from("shipments").select("id,period_id,company_id"),
        supabase.from("shipment_items").select("shipment_id,group_name,qty"),
      ]);
      for (const r of [p, s, sh, it]) if (r.error) throw r.error;
      return {
        periods: p.data as { id: string; label: string }[],
        sales: s.data as SalesTotal[],
        shipments: sh.data as { id: string; period_id: string; company_id: string | null }[],
        items: it.data as { shipment_id: string; group_name: string; qty: number }[],
      };
    },
  });

  const resale = new Set([...RESALE_GROUPS.map(norm), ...groups.filter((g) => g.kind === "revenda").map((g) => norm(g.name))]);
  const isOwn = (g: string) => !resale.has(norm(g)) && !RESALE_GROUPS.some((r) => norm(g).includes(norm(r)));

  const rows = useMemo(() => {
    if (!data) return [];
    const months = new Map<string, OwnMonth>();
    for (const p of data.periods) months.set(p.id, { key: labelKey(p.label), sold: {}, shipped: {} });
    for (const s of data.sales) {
      const m = months.get(s.period_id);
      if (!m || !isOwn(s.group_name)) continue;
      const k = `${s.company_id}|${norm(s.group_name)}`;
      m.sold[k] = (m.sold[k] ?? 0) + effectiveQty(s);
    }
    const shipById = new Map(data.shipments.map((x) => [x.id, x]));
    for (const i of data.items) {
      const sh = shipById.get(i.shipment_id);
      const m = sh && months.get(sh.period_id);
      if (!m || !sh?.company_id || !isOwn(i.group_name)) continue;
      const k = `${sh.company_id}|${norm(i.group_name)}`;
      m.shipped[k] = (m.shipped[k] ?? 0) + (i.qty || 0);
    }
    return ownCoverage([...months.values()], labelKey(period.label));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, period.label, groups]);

  const groupBy = (g: string) => groups.find((x) => norm(x.name) === g);
  const companyName = (id: string) => companies.find((c) => c.id === id)?.name ?? "—";
  const sorted = [...rows].sort(
    (a, b) => companyName(a.companyId).localeCompare(companyName(b.companyId)) || a.group.localeCompare(b.group),
  );
  const faltas = rows.filter((r) => r.after < 0);
  const totalSold = rows.reduce((s, r) => s + r.sold, 0);
  const totalShip = rows.reduce((s, r) => s + r.shipped, 0);

  if (!data) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card title="Vendas a cobrir" value={`${int(totalSold)} pç`} />
        <Card title="Remetido no mês" value={`${int(totalShip)} pç`} />
        <Card
          title="Situação fiscal"
          value={faltas.length ? `${faltas.length} item(ns) faltando` : "100% coberto"}
          danger={faltas.length > 0}
        />
      </div>
      {faltas.length > 0 && (
        <p className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm">
          Faltam peças: {faltas.map((f) => `${companyName(f.companyId)} ${groupBy(f.group)?.name ?? f.group} (${int(-f.after)})`).join(" · ")}.
          Sem remessa suficiente, essas vendas ficam sem nota de industrialização.
        </p>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Empresa · Grupo</TableHead>
            <TableHead className="text-right">Vendeu</TableHead>
            <TableHead className="text-right">Remetido</TableHead>
            <TableHead className="text-right">Saldo</TableHead>
            <TableHead>Situação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((r) => {
            const falta = r.after < 0;
            const extra = Math.max(0, r.target - r.after);
            return (
              <TableRow key={`${r.companyId}|${r.group}`}>
                <TableCell>
                  {companyName(r.companyId)} · {groupBy(r.group)?.name ?? r.group}
                </TableCell>
                <TableCell className="num text-right">{int(r.sold)}</TableCell>
                <TableCell className="num text-right">{int(r.shipped)}</TableCell>
                <TableCell className={`num text-right font-semibold ${falta ? "text-destructive" : ""}`}>{int(r.after)}</TableCell>
                <TableCell>
                  {falta ? (
                    <Badge className="bg-destructive text-destructive-foreground">faltam {int(-r.after)}</Badge>
                  ) : (
                    <Badge className="bg-primary text-primary-foreground">coberto</Badge>
                  )}
                  {!falta && extra > 0 && (
                    <span className="ml-2 text-xs text-muted-foreground">reserva sugerida +{int(extra)}</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <p className="text-xs text-muted-foreground">
        Saldo = saldo anterior + remetido − vendido. Só fica vermelho se faltar peça para cobrir venda real. A reserva
        sugerida ({Math.round(SAFETY_RATIO * 100)}% da média de 3 meses) é opcional. Conta a partir de{" "}
        {String(OWN_COVERAGE_START).slice(4)}/{String(OWN_COVERAGE_START).slice(0, 4)}.
      </p>
    </div>
  );
}

function Card({ title, value, danger }: { title: string; value: string; danger?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${danger ? "border-destructive" : ""}`}>
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="num text-xl font-bold">{value}</p>
    </div>
  );
}
