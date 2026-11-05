import { describe, expect, it } from "vitest";
import { allocateNeed } from "./resale";

describe("allocateNeed (só o necessário)", () => {
  it("pede só a necessidade quando o balcão tem mais peças", () => {
    const r = allocateNeed(1200, new Map([["costa", 71], ["rc", 8], ["cr", 2]]));
    expect([...r.values()].reduce((a, b) => a + b, 0)).toBe(81);
    expect(r.get("costa")).toBe(71);
  });
  it("nunca passa do que foi pego no balcão", () => {
    const r = allocateNeed(100, new Map([["costa", 99], ["rc", 531]]));
    expect(r.get("costa")).toBe(99);
    expect(r.get("rc")).toBe(1);
  });
  it("quem já tem estoque suficiente não entra", () => {
    expect(allocateNeed(500, new Map()).size).toBe(0);
  });
});
