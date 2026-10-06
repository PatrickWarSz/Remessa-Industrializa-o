import { supabase } from "@/integrations/supabase/client";

export type Company = {
  id: string;
  name: string;
  match_key: string;
  sort_order: number;
};

export type ProductGroup = {
  id: string;
  name: string;
  kind: "propria" | "revenda";
  yield_per_kg: number | null;
  unit_price: number | null;
  sort_order: number;
};

export type Factory = { id: string; name: string; monthly_limit: number; sort_order: number };

export type Period = {
  id: string;
  label: string;
  reference_label: string;
  fabric_price_per_kg: number;
  created_at: string;
  closed_at?: string | null;
  reopened_at?: string | null;
};

export type FabricMove = {
  id: string;
  company_id: string;
  period_id: string | null;
  shipment_id: string | null;
  kind: "entrada" | "saida";
  kg: number;
  doc: string;
  note: string;
  moved_on: string;
};

export type SalesTotal = {
  id: string;
  period_id: string;
  company_id: string;
  group_name: string;
  qty_sheet: number;
  qty_from_sets: number;
  qty_adjusted: number | null;
};

export type Shipment = {
  id: string;
  period_id: string;
  company_id: string | null;
  factory_id: string | null;
  title: string;
  is_extra: boolean;
  sort_order: number;
};

export type ShipmentItem = {
  id: string;
  shipment_id: string;
  group_name: string;
  qty: number;
  yield_per_kg: number | null;
  unit_price: number | null;
  sort_order: number;
};

export const DEFAULT_COMPANIES = [
  { name: "CR FITNESS", match_key: "CR" },
  { name: "RC FITNESS", match_key: "RC" },
  { name: "COSTA FITNESS", match_key: "COSTA" },
  { name: "REZENDE FITNESS", match_key: "REZENDE" },
];

export const DEFAULT_GROUPS: Array<Omit<ProductGroup, "id">> = [
  { name: "LEGGING", kind: "propria", yield_per_kg: 20, unit_price: 0.5, sort_order: 1 },
  { name: "SHORT", kind: "propria", yield_per_kg: 30, unit_price: 0.25, sort_order: 2 },
  { name: "TOP", kind: "propria", yield_per_kg: 60, unit_price: 0.1, sort_order: 3 },
  { name: "MACAQUINHO", kind: "propria", yield_per_kg: null, unit_price: null, sort_order: 4 },
  { name: "MACACAO", kind: "propria", yield_per_kg: null, unit_price: null, sort_order: 5 },
  { name: "BIQUINI", kind: "propria", yield_per_kg: null, unit_price: null, sort_order: 6 },
  { name: "CAMISA TERMICA", kind: "propria", yield_per_kg: 30, unit_price: 0.5, sort_order: 7 },
  { name: "CALCINHA", kind: "revenda", yield_per_kg: 80, unit_price: 0.05, sort_order: 8 },
  { name: "CUECA", kind: "revenda", yield_per_kg: null, unit_price: null, sort_order: 9 },
  { name: "SAMBA CANCAO", kind: "revenda", yield_per_kg: null, unit_price: null, sort_order: 10 },
];

export const DEFAULT_FACTORIES = [
  { name: "HELLEM", monthly_limit: 5000 },
  { name: "RAFAEL", monthly_limit: 3000 },
];

let seedInFlight: Promise<void> | null = null;

/** Cria os cadastros iniciais caso o usuário ainda não tenha nenhum. */
export async function ensureSeed() {
  // evita que duas chamadas simultâneas (StrictMode, navegação rápida, etc.)
  // vejam a tabela "vazia" ao mesmo tempo e insiram os padrões em dobro
  if (seedInFlight) return seedInFlight;

  seedInFlight = (async () => {
    const [{ data: companies }, { count: groups }, { data: factories }] = await Promise.all([
      supabase.from("companies").select("name"),
      supabase.from("product_groups").select("id", { count: "exact", head: true }),
      supabase.from("factories").select("name"),
    ]);

    if (!companies || companies.length === 0) {
      await supabase
        .from("companies")
        .insert(DEFAULT_COMPANIES.map((c, i) => ({ ...c, sort_order: i + 1 })));
    }
    if (!groups) {
      await supabase.from("product_groups").insert(DEFAULT_GROUPS);
    }
    if (!factories || factories.length === 0) {
      await supabase
        .from("factories")
        .insert(DEFAULT_FACTORIES.map((f, i) => ({ ...f, sort_order: i + 1 })));
    }
  })();

  try {
    await seedInFlight;
  } finally {
    seedInFlight = null;
  }
}

export const effectiveQty = (row: SalesTotal) => row.qty_adjusted ?? row.qty_sheet;

export const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const kg = (value: number) =>
  `${value.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`;

export const int = (value: number) => value.toLocaleString("pt-BR");

export function currentPeriodLabel() {
  const now = new Date();
  return `${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
}

/** Desloca um rótulo MM/AAAA em N meses (-1 = mês anterior). */
export function shiftLabel(label: string, delta: number) {
  const [m, y] = label.split("/").map((n) => Number(n));
  if (!m || !y) return label;
  const d = new Date(y, m - 1 + delta, 1);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** Mês de referência padrão: o mês anterior ao mês ativo. */
export const defaultReference = (label: string) => shiftLabel(label, -1);

export const kgNum = (value: number) =>
  value.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
