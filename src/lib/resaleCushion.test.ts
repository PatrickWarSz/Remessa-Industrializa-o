import { describe, expect, it } from "vitest";
import { resaleCushion } from "./resale";

describe("colchão da revenda", () => {
  it("é 40% da média dos últimos 3 meses, arredondado para cima", () => {
    const m = (q: number) => new Map([["samba|GG", new Map([["rc", q]])]]);
    const c = resaleCushion([m(100), m(200), m(301), m(9999)], 0.4);
    expect(c.get("samba|GG")?.get("rc")).toBe(81);
  });
});
