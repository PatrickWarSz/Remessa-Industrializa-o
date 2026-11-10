import { describe, expect, it } from "vitest";
import { parseCutText } from "./cutSheet";

const sample = `Ficha de Corte Cliente: 2289 CAMILA REZENDE N.º CORTE 3 DATA: 09/11/2026 MODELO: CALCA ELASTICO
TECIDO: SUPLEX TIPO DE CORTE: Bullmer GRADE: PESO FOLHAS COR 2 4 5 3 P M G GG TOTAL
382,486 123 PRETO 246 492 615 369 1722 TOTAL DE PEÇAS CORTADAS: 246 492 615 369 1722`;

describe("parseCutText", () => {
  it("lê número, data, modelo e grade da ficha do cortador", () => {
    const r = parseCutText(sample);
    expect(r.cut_number).toBe("3");
    expect(r.cut_on).toBe("2026-11-09");
    expect(r.model_label).toBe("CALCA ELASTICO");
    expect([r.qty_p, r.qty_m, r.qty_g, r.qty_gg]).toEqual([246, 492, 615, 369]);
  });
});
