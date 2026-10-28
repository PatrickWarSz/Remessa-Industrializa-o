import { describe, expect, it } from "vitest";
import { allocateNote } from "./resale";

const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

describe("allocateNote", () => {
  it("distribui 100% da nota, cobrindo a falta antes", () => {
    const r = allocateNote(700, new Map([["CR", 20], ["RC", 100]]), new Map([["CR", 2], ["RC", 98]]));
    expect(sum(r)).toBe(700);
    expect(r.get("CR")).toBeGreaterThanOrEqual(20);
    expect(r.get("RC")).toBeGreaterThanOrEqual(100);
  });
  it("sem necessidade, divide pela proporção de vendas", () => {
    const r = allocateNote(100, new Map(), new Map([["CR", 1], ["RC", 3]]));
    expect(r.get("CR")).toBe(25);
    expect(r.get("RC")).toBe(75);
  });
  it("nota menor que a necessidade cobre a menor primeiro", () => {
    const r = allocateNote(30, new Map([["CR", 25], ["RC", 1169]]), new Map());
    expect(r.get("CR")).toBe(25);
    expect(r.get("RC")).toBe(5);
  });
});
