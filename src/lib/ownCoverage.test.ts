import { describe, expect, it } from "vitest";
import { ownCoverage } from "./ownCoverage";

const k = "cr|LEGGING";

describe("cobertura da industrialização", () => {
  it("pede vendas do mês + 40% da média de 3 meses menos o saldo", () => {
    const months = [
      { key: 202608, sold: { [k]: 100 }, shipped: { [k]: 150 } },
      { key: 202609, sold: { [k]: 100 }, shipped: { [k]: 100 } },
      { key: 202610, sold: { [k]: 100 }, shipped: {} },
    ];
    const [row] = ownCoverage(months, 202610);
    expect(row.prior).toBe(50);
    expect(row.target).toBe(40);
    expect(row.need).toBe(90);
    expect(row.status).toBe("falta");
  });

  it("não pede nada quando o estoque já cobre vendas e colchão", () => {
    const months = [
      { key: 202609, sold: { [k]: 10 }, shipped: { [k]: 500 } },
      { key: 202610, sold: { [k]: 100 }, shipped: {} },
    ];
    expect(ownCoverage(months, 202610)[0].need).toBe(0);
  });
});
