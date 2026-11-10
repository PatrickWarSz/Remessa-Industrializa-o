export type ParsedCut = {
  cut_number: string;
  cut_on: string; // AAAA-MM-DD
  model_label: string;
  fabric: string;
  color: string;
  qty_p: number;
  qty_m: number;
  qty_g: number;
  qty_gg: number;
};

/** Lê o texto da Ficha de Corte (Bullmer) e devolve os campos que conseguir achar. */
export function parseCutText(text: string): Partial<ParsedCut> {
  const t = text.replace(/\s+/g, " ");
  const out: Partial<ParsedCut> = {};
  const num = t.match(/N\.?\s*º?\s*CORTE\s*:?\s*(\d+)/i);
  if (num) out.cut_number = num[1];
  const date = t.match(/DATA\s*:?\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  if (date) out.cut_on = `${date[3]}-${date[2]}-${date[1]}`;
  const model = t.match(/MODELO\s*:?\s*(.+?)\s+(TECIDO|TIPO|GRADE)/i);
  if (model) out.model_label = model[1].trim();
  const fabric = t.match(/TECIDO\s*:?\s*(.+?)\s+(TIPO|GRADE)/i);
  if (fabric) out.fabric = fabric[1].trim();
  const tot = t.match(/TOTAL DE PE[ÇC]AS CORTADAS\s*:?\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/i);
  if (tot) {
    out.qty_p = Number(tot[1]);
    out.qty_m = Number(tot[2]);
    out.qty_g = Number(tot[3]);
    out.qty_gg = Number(tot[4]);
  }
  const color = t.match(/[\d.,]+\s+\d+\s+([A-ZÀ-Ú ]+?)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+/);
  if (color) out.color = color[1].trim();
  return out;
}

export async function readPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const c = await page.getTextContent();
    text += c.items.map((it) => ("str" in it ? it.str : "")).join(" ") + " ";
  }
  return text;
}
