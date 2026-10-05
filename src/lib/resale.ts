import { supabase } from "@/integrations/supabase/client";

export type ResaleModel = {
  id: string;
  name: string;
  sizes: string[];
  sort_order: number;
};

export type ResaleCodeMap = {
  id: string;
  company_id: string;
  code: string;
  model_id: string | null;
  size: string;
  last_description: string;
  /** Código que na verdade é produto de fabricação própria (não entra na revenda). */
  is_own: boolean;
  /** Grupo de fabricação própria para onde a quantidade desse código deve ir. */
  own_group: string;
};

export type ResaleSale = {
  id: string;
  period_id: string;
  company_id: string;
  code: string;
  description: string;
  group_name: string;
  qty: number;
};

export type CounterNote = {
  id: string;
  note_date: string;
  supplier: string;
  doc: string;
  status: "pendente" | "faturada";
  cycle_id: string | null;
};

export type CounterNoteItem = {
  id: string;
  note_id: string;
  model_id: string | null;
  size: string;
  qty: number;
  sort_order: number;
};

export type ResaleCycle = { id: string; label: string; closed_on: string; created_at: string };

export type ResaleAllocation = {
  id: string;
  cycle_id: string;
  model_id: string | null;
  model_name: string;
  size: string;
  company_id: string | null;
  company_name: string;
  qty: number;
};

export const RESALE_GROUPS = ["CUECA", "CALCINHA", "SAMBA CANCAO"];

export const norm = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();

/** Tenta deduzir o tamanho pelo final da descrição ("... MICROFIBRA G" -> "G"). */
export function guessSize(description: string, sizes: string[]): string {
  const d = norm(description);
  const candidates = [...sizes].sort((a, b) => b.length - a.length);
  for (const s of candidates) {
    const n = norm(s);
    if (d.endsWith(` ${n}`) || d === n) return s;
  }
  return "";
}

/**
 * Escolhe o modelo cujo nome tem mais palavras em comum com a descrição da planilha.
 * Se houver empate (ex.: descrição genérica que serve para Dryfit e Algodão), devolve
 * null de propósito — melhor deixar em branco do que sugerir o modelo errado.
 */
export function guessModel(description: string, models: ResaleModel[]): ResaleModel | null {
  const words = new Set(norm(description).split(/\s+/).filter(Boolean));
  let best: { model: ResaleModel; score: number; tied: boolean } | null = null;
  for (const m of models) {
    const tokens = norm(m.name).split(/\s+/).filter(Boolean);
    const score = tokens.reduce((acc, t) => acc + (words.has(t) ? 1 : 0), 0);
    if (score <= 0) continue;
    if (!best || score > best.score) best = { model: m, score, tied: false };
    else if (score === best.score) best.tied = true;
  }
  if (!best || best.tied) return null;
  return best.model;
}


export const ALL_SIZES = ["P", "M", "G", "GG", "G1", "G2", "G3", "XG", "U"];

/* -------------------------------- queries -------------------------------- */

export async function fetchModels() {
  const { data, error } = await supabase.from("resale_models").select("*").order("sort_order");
  if (error) throw error;
  return (data ?? []) as ResaleModel[];
}

export async function fetchCodeMap() {
  const { data, error } = await supabase.from("resale_code_map").select("*").order("code");
  if (error) throw error;
  return (data ?? []) as ResaleCodeMap[];
}

export async function fetchResaleSales() {
  const { data, error } = await supabase.from("resale_sales").select("*");
  if (error) throw error;
  return (data ?? []) as ResaleSale[];
}

export async function fetchNotes() {
  const { data, error } = await supabase
    .from("counter_notes")
    .select("*")
    .order("note_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CounterNote[];
}

export async function fetchNoteItems() {
  const { data, error } = await supabase.from("counter_note_items").select("*").order("sort_order");
  if (error) throw error;
  return (data ?? []) as CounterNoteItem[];
}

export async function fetchCycles() {
  const { data, error } = await supabase
    .from("resale_cycles")
    .select("*")
    .order("closed_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ResaleCycle[];
}

export async function fetchAllocations() {
  const { data, error } = await supabase.from("resale_cycle_allocations").select("*");
  if (error) throw error;
  return (data ?? []) as ResaleAllocation[];
}

/* ------------------------------- referência ------------------------------- */

export type ReferenceRow = { companyId: string; qty: number };

/**
 * Referência de rateio: vendas por empresa do modelo+tamanho no período de referência
 * (hoje, o mês calendário mais recente importado). Isolado aqui para depois trocar
 * por "últimos 15–30 dias" sem mexer nas telas.
 */
export function resaleReference(
  sales: ResaleSale[],
  codeMap: ResaleCodeMap[],
  referencePeriodId: string | null,
  models: ResaleModel[] = [],
) {
  const key = (modelId: string, size: string) => `${modelId}|${norm(size)}`;
  const map = new Map<string, Map<string, number>>();
  if (!referencePeriodId) return map;

  for (const s of sales) {
    if (s.period_id !== referencePeriodId) continue;
    const m = codeMap.find((c) => c.company_id === s.company_id && c.code === s.code);
    if (!m?.model_id) continue;
    // Se o tamanho ainda não foi confirmado, deduz pela descrição da planilha.
    const model = models.find((x) => x.id === m.model_id);
    const size =
      m.size || guessSize(m.last_description || s.description, model?.sizes ?? ALL_SIZES);
    const k = key(m.model_id, size);
    const per = map.get(k) ?? new Map<string, number>();
    per.set(s.company_id, (per.get(s.company_id) ?? 0) + s.qty);
    map.set(k, per);
  }
  return map;
}

export const refKey = (modelId: string, size: string) => `${modelId}|${norm(size)}`;


/* ---------------------------- cobertura fiscal ---------------------------- */

export type CoverageRow = {
  modelId: string;
  modelName: string;
  size: string;
  companyId: string;
  companyName: string;
  sold: number;
  entered: number;
};

/** "2026-08-19" -> "08/2026" */
export const monthOf = (isoDate: string) => {
  const [y, m] = String(isoDate).split("-");
  return m && y ? `${m}/${y}` : "";
};

/**
 * Compara, por empresa · modelo · tamanho, quanto foi VENDIDO no período de
 * referência com quanto ENTROU em nota (rateios dos ciclos fechados no mês).
 * O saldo (vendido − entrado) é o que ainda falta cobrir fiscalmente.
 */
export function resaleCoverage(args: {
  sales: ResaleSale[];
  codeMap: ResaleCodeMap[];
  models: ResaleModel[];
  allocations: ResaleAllocation[];
  cycles: ResaleCycle[];
  /** Um período específico; se `periodIds` vier preenchido, soma todos eles. */
  periodId: string | null;
  periodIds?: string[] | null;
  /** Se nulo, considera TODOS os ciclos (visão acumulada). */
  monthLabel: string | null;
  companies: Array<{ id: string; name: string }>;
}) {
  const { sales, codeMap, models, allocations, cycles, periodId, periodIds, monthLabel, companies } =
    args;

  const ids = periodIds?.length ? periodIds : periodId ? [periodId] : [];
  const sold = new Map<string, Map<string, number>>();
  for (const pid of ids) {
    for (const [k, per] of resaleReference(sales, codeMap, pid, models)) {
      const acc = sold.get(k) ?? new Map<string, number>();
      for (const [cid, qty] of per) acc.set(cid, (acc.get(cid) ?? 0) + qty);
      sold.set(k, acc);
    }
  }

  const cycleIds = new Set(
    cycles.filter((c) => !monthLabel || monthOf(c.closed_on) === monthLabel).map((c) => c.id),
  );
  const entered = new Map<string, Map<string, number>>();
  for (const a of allocations) {
    // Se o vínculo com empresa/modelo se perdeu, recupera pelo nome gravado no rateio.
    const companyId =
      a.company_id ?? companies.find((c) => norm(c.name) === norm(a.company_name))?.id ?? null;
    const modelId = a.model_id ?? models.find((m) => norm(m.name) === norm(a.model_name))?.id ?? null;
    if (!modelId || !companyId || !cycleIds.has(a.cycle_id)) continue;
    const k = refKey(modelId, a.size);
    const per = entered.get(k) ?? new Map<string, number>();
    per.set(companyId, (per.get(companyId) ?? 0) + a.qty);
    entered.set(k, per);
  }

  const keys = new Set([...sold.keys(), ...entered.keys()]);
  const rows: CoverageRow[] = [];
  const deficit = new Map<string, Map<string, number>>();
  /** Sobra (entrou − vendeu > 0): estoque fiscal parado por empresa. */
  const stock = new Map<string, Map<string, number>>();

  for (const k of keys) {
    const [modelId = "", size = ""] = k.split("|");
    const model = models.find((m) => m.id === modelId);
    const soldPer = sold.get(k);
    const enteredPer = entered.get(k);
    const per = new Map<string, number>();
    const st = new Map<string, number>();
    const ids = new Set([...(soldPer?.keys() ?? []), ...(enteredPer?.keys() ?? [])]);
    for (const cid of ids) {
      const s = soldPer?.get(cid) ?? 0;
      const e = enteredPer?.get(cid) ?? 0;
      if (!s && !e) continue;
      rows.push({
        modelId,
        modelName: model?.name ?? "—",
        size,
        companyId: cid,
        companyName: companies.find((c) => c.id === cid)?.name ?? "—",
        sold: s,
        entered: e,
      });
      if (s - e > 0) per.set(cid, s - e);
      if (e - s > 0) st.set(cid, e - s);
    }
    if (per.size) deficit.set(k, per);
    if (st.size) stock.set(k, st);
  }

  rows.sort((a, b) => {
    const ma = models.find((m) => m.id === a.modelId);
    const mb = models.find((m) => m.id === b.modelId);
    if ((ma?.sort_order ?? 999) !== (mb?.sort_order ?? 999))
      return (ma?.sort_order ?? 999) - (mb?.sort_order ?? 999);
    const sa = ma?.sizes.indexOf(a.size) ?? -1;
    const sb = mb?.sizes.indexOf(b.size) ?? -1;
    if (sa !== sb) return sa - sb;
    return b.sold - a.sold;
  });

  return { rows, deficit, stock };
}
