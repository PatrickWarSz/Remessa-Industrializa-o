import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { FileText, Printer, Trash2, Upload } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import type { ProductGroup } from "@/lib/domain";
import { int } from "@/lib/domain";
import { parseCutText, readPdfText } from "@/lib/cutSheet";

export const Route = createFileRoute("/_authenticated/cortes")({
  head: () => ({
    meta: [
      { title: "Cortes — Central de Remessa" },
      { name: "description", content: "Lançamento dos cortes com a ficha original do cortador anexada e pronta para imprimir." },
      { property: "og:title", content: "Cortes — Central de Remessa" },
      { property: "og:description", content: "Cortes lançados com a ficha do cortador anexada." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <Cortes />
    </AppShell>
  ),
});

type Cut = {
  id: string;
  cut_number: string;
  cut_on: string;
  group_name: string;
  model_label: string;
  fabric: string;
  color: string;
  qty_p: number;
  qty_m: number;
  qty_g: number;
  qty_gg: number;
  note: string;
  file_path: string | null;
  file_name: string;
};

const SIZES = [
  ["qty_p", "P"],
  ["qty_m", "M"],
  ["qty_g", "G"],
  ["qty_gg", "GG"],
] as const;

const empty = () => ({
  cut_number: "",
  cut_on: new Date().toISOString().slice(0, 10),
  group_name: "",
  model_label: "",
  fabric: "",
  color: "",
  qty_p: "",
  qty_m: "",
  qty_g: "",
  qty_gg: "",
  note: "",
});

const total = (c: Pick<Cut, "qty_p" | "qty_m" | "qty_g" | "qty_gg">) => c.qty_p + c.qty_m + c.qty_g + c.qty_gg;
const brDate = (d: string) => d.split("-").reverse().join("/");

async function signedUrl(path: string) {
  const { data, error } = await supabase.storage.from("cut-sheets").createSignedUrl(path, 600);
  if (error) throw error;
  return data.signedUrl;
}

function printMirror(c: Cut) {
  const w = window.open("", "_blank");
  if (!w) { toast.error("Libere as janelas pop-up para imprimir."); return; }
  const cells = SIZES.map(([k, l]) => `<td><b>${l}</b><br>${c[k]}</td>`).join("");
  w.document.write(`<html><head><title>Espelho do corte ${c.cut_number}</title><style>
    body{font-family:Arial,sans-serif;padding:32px;color:#222}h1{margin:0 0 4px}
    table{border-collapse:collapse;width:100%;margin-top:16px}td,th{border:1px solid #999;padding:8px;text-align:center}
    .info td{text-align:left}</style></head><body>
    <h1>Espelho de corte nº ${c.cut_number}</h1><div>Central de Remessa — industrialização</div>
    <table class="info"><tr><td><b>Data</b> ${brDate(c.cut_on)}</td><td><b>Produto</b> ${c.group_name || "-"}</td></tr>
    <tr><td><b>Modelo do cortador</b> ${c.model_label || "-"}</td><td><b>Tecido / cor</b> ${[c.fabric, c.color].filter(Boolean).join(" / ") || "-"}</td></tr></table>
    <table><tr>${cells}<td><b>TOTAL</b><br>${total(c)}</td></tr></table>
    ${c.note ? `<p><b>Obs.:</b> ${c.note}</p>` : ""}
    <script>window.onload=()=>{window.print()}</script></body></html>`);
  w.document.close();
}

function Cortes() {
  const qc = useQueryClient();
  const [form, setForm] = useState(empty());
  const [file, setFile] = useState<File | null>(null);
  const [reading, setReading] = useState(false);

  const { data: groups = [] } = useQuery({
    queryKey: ["product_groups"],
    queryFn: async () => {
      const { data, error } = await supabase.from("product_groups").select("*").order("sort_order");
      if (error) throw error;
      return data as ProductGroup[];
    },
  });
  const { data: cuts = [] } = useQuery({
    queryKey: ["cuts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cuts").select("*").order("cut_on", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return data as Cut[];
    },
  });

  async function onFile(f: File | null) {
    setFile(f);
    if (!f) return;
    setReading(true);
    try {
      const p = parseCutText(await readPdfText(f));
      setForm((s) => ({
        ...s,
        ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)])),
      }));
      toast.success("Ficha lida. Confira os campos e escolha o produto.");
    } catch {
      toast.message("Não consegui ler a ficha automaticamente. Preencha à mão.");
    } finally {
      setReading(false);
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!form.group_name) throw new Error("Escolha o produto.");
      let file_path: string | null = null;
      if (file) {
        file_path = `${crypto.randomUUID()}.pdf`;
        const { error } = await supabase.storage.from("cut-sheets").upload(file_path, file, { contentType: file.type || "application/pdf" });
        if (error) throw error;
      }
      const n = (v: string) => Math.max(0, Math.round(Number(v) || 0));
      const { error } = await supabase.from("cuts").insert({
        ...form,
        qty_p: n(form.qty_p),
        qty_m: n(form.qty_m),
        qty_g: n(form.qty_g),
        qty_gg: n(form.qty_gg),
        file_path,
        file_name: file?.name ?? "",
      });
      if (error) {
        if (file_path) await supabase.storage.from("cut-sheets").remove([file_path]);
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Corte lançado.");
      setForm(empty());
      setFile(null);
      qc.invalidateQueries({ queryKey: ["cuts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (c: Cut) => {
      const { error } = await supabase.from("cuts").delete().eq("id", c.id);
      if (error) throw error;
      if (c.file_path) await supabase.storage.from("cut-sheets").remove([c.file_path]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cuts"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  async function openOriginal(c: Cut) {
    const w = window.open("", "_blank");
    try {
      const url = await signedUrl(c.file_path!);
      if (w) w.location.href = url;
    } catch (e) {
      w?.close();
      toast.error((e as Error).message);
    }
  }

  const formTotal = SIZES.reduce((a, [k]) => a + (Number(form[k]) || 0), 0);
  const input = "w-full rounded border border-input bg-background px-2 py-1.5 text-sm";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Cortes</h1>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-4 font-semibold">Novo corte</h2>
        <label className="mb-4 flex cursor-pointer items-center gap-3 rounded border border-dashed border-border p-4 text-sm hover:bg-muted">
          <Upload className="size-5 text-accent" />
          <span>{reading ? "Lendo a ficha..." : file ? file.name : "Anexar ficha do cortador (PDF) — os campos são preenchidos sozinhos"}</span>
          <input type="file" accept="application/pdf" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
        </label>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Nº do corte"><input className={input} value={form.cut_number} onChange={(e) => setForm({ ...form, cut_number: e.target.value })} /></Field>
          <Field label="Data"><input type="date" className={input} value={form.cut_on} onChange={(e) => setForm({ ...form, cut_on: e.target.value })} /></Field>
          <Field label="Produto">
            <select className={input} value={form.group_name} onChange={(e) => setForm({ ...form, group_name: e.target.value })}>
              <option value="">Escolha...</option>
              {groups.filter((g) => g.kind === "propria").map((g) => <option key={g.id}>{g.name}</option>)}
            </select>
          </Field>
          <Field label="Modelo (como o cortador escreveu)"><input className={input} value={form.model_label} onChange={(e) => setForm({ ...form, model_label: e.target.value })} /></Field>
          <Field label="Tecido"><input className={input} value={form.fabric} onChange={(e) => setForm({ ...form, fabric: e.target.value })} /></Field>
          <Field label="Cor"><input className={input} value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></Field>
          <Field label="Observação"><input className={input} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          {SIZES.map(([k, l]) => (
            <Field key={k} label={l}>
              <input inputMode="numeric" className={`${input} w-24`} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            </Field>
          ))}
          <div className="pb-2 text-sm">Total: <b>{int(formTotal)}</b> pç</div>
          <button
            type="button"
            disabled={save.isPending || reading}
            onClick={() => save.mutate()}
            className="ml-auto rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {save.isPending ? "Salvando..." : "Lançar corte"}
          </button>
        </div>
      </section>

      <section className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="p-2">Nº</th><th className="p-2">Data</th><th className="p-2">Produto</th><th className="p-2">Modelo</th>
              {SIZES.map(([, l]) => <th key={l} className="p-2 text-right">{l}</th>)}
              <th className="p-2 text-right">Total</th><th className="p-2">Imprimir</th><th />
            </tr>
          </thead>
          <tbody>
            {cuts.length === 0 && <tr><td colSpan={11} className="p-4 text-center text-muted-foreground">Nenhum corte lançado ainda.</td></tr>}
            {cuts.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="p-2 font-semibold">{c.cut_number}</td>
                <td className="p-2">{brDate(c.cut_on)}</td>
                <td className="p-2">{c.group_name}</td>
                <td className="p-2 text-muted-foreground">{c.model_label}</td>
                {SIZES.map(([k]) => <td key={k} className="p-2 text-right">{int(c[k])}</td>)}
                <td className="p-2 text-right font-semibold">{int(total(c))}</td>
                <td className="p-2">
                  <div className="flex gap-1">
                    {c.file_path && (
                      <button type="button" onClick={() => openOriginal(c)} className="flex items-center gap-1 rounded border border-border px-2 py-1 hover:bg-muted" title={c.file_name}>
                        <FileText className="size-4" /> Ficha original
                      </button>
                    )}
                    <button type="button" onClick={() => printMirror(c)} className="flex items-center gap-1 rounded border border-border px-2 py-1 hover:bg-muted">
                      <Printer className="size-4" /> Espelho
                    </button>
                  </div>
                </td>
                <td className="p-2">
                  <button type="button" onClick={() => confirm(`Excluir o corte ${c.cut_number}?`) && remove.mutate(c)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs text-muted-foreground">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}
