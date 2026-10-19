/**
 * Cobertura fiscal da fabricação própria (industrialização), por empresa × grupo.
 * Vendeu = planilhas importadas; Entrou = peças das remessas de industrialização.
 * Colchão = SAFETY_RATIO × média de vendas dos últimos 3 meses (incluindo o atual).
 * Necessidade = max(0, vendas do mês + colchão − saldo anterior), sempre inteiro para cima.
 */
export const SAFETY_RATIO = 0.4;
export const OWN_COVERAGE_START = 202608;

export const labelKey = (label: string) => {
  const [m, y] = label.split("/").map(Number);
  return (y || 0) * 100 + (m || 0);
};

export type OwnMonth = {
  key: number; // AAAAMM do mês ativo
  sold: Record<string, number>; // `${companyId}|${group}` -> peças vendidas
  shipped: Record<string, number>; // `${companyId}|${group}` -> peças remetidas
};

export type OwnCoverageRow = {
  companyId: string;
  group: string;
  prior: number; // saldo fiscal antes deste mês
  sold: number;
  avg3: number;
  target: number;
  need: number; // peças mínimas a remeter neste mês
  shipped: number;
  after: number; // saldo após o mês
  status: "falta" | "abaixo" | "ok" | "excesso";
};

export function ownCoverage(months: OwnMonth[], currentKey: number, start = OWN_COVERAGE_START) {
  const ordered = months.filter((m) => m.key >= start && m.key <= currentKey).sort((a, b) => a.key - b.key);
  const current = ordered.find((m) => m.key === currentKey);
  const keys = new Set<string>();
  for (const m of ordered) for (const k of [...Object.keys(m.sold), ...Object.keys(m.shipped)]) keys.add(k);

  const rows: OwnCoverageRow[] = [];
  for (const k of keys) {
    const [companyId, group] = k.split("|");
    let prior = 0;
    for (const m of ordered) if (m.key < currentKey) prior += (m.shipped[k] ?? 0) - (m.sold[k] ?? 0);
    const sold = current?.sold[k] ?? 0;
    const shipped = current?.shipped[k] ?? 0;
    const last3 = months.filter((m) => m.key <= currentKey).sort((a, b) => b.key - a.key).slice(0, 3);
    const avg3 = last3.length ? last3.reduce((s, m) => s + (m.sold[k] ?? 0), 0) / last3.length : 0;
    const target = Math.ceil(avg3 * SAFETY_RATIO);
    const need = Math.max(0, Math.ceil(sold + target - prior));
    const after = prior + shipped - sold;
    const status: OwnCoverageRow["status"] =
      after < 0 ? "falta" : after < target ? "abaixo" : after > target + Math.max(avg3, 1) ? "excesso" : "ok";
    if (!sold && !shipped && !prior) continue;
    rows.push({ companyId, group, prior, sold, avg3, target, need, shipped, after, status });
  }
  return rows;
}
