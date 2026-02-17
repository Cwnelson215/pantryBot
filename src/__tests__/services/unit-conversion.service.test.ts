import { describe, it, expect } from "vitest";
import { tryConvert } from "../../services/unit-conversion.service";

describe("unit-conversion.service", () => {
  describe("tryConvert", () => {
    it("returns amount unchanged for same unit", () => {
      expect(tryConvert(5, "cup", "cup")).toBe(5);
    });

    it("returns amount unchanged after alias normalization", () => {
      expect(tryConvert(3, "cups", "cup")).toBe(3);
      expect(tryConvert(2, "teaspoons", "tsp")).toBe(2);
      expect(tryConvert(1, "pounds", "lb")).toBe(1);
    });

    // ── Volume conversions ──────────────────────────────────────────────

    it("converts tsp to tbsp", () => {
      const result = tryConvert(3, "tsp", "tbsp");
      expect(result).toBeCloseTo(1, 0);
    });

    it("converts tbsp to tsp", () => {
      const result = tryConvert(1, "tbsp", "tsp");
      expect(result).toBeCloseTo(3, 0);
    });

    it("converts cup to ml", () => {
      const result = tryConvert(1, "cup", "ml");
      expect(result).toBeCloseTo(236.588, 1);
    });

    it("converts ml to cup", () => {
      const result = tryConvert(236.588, "ml", "cup");
      expect(result).toBeCloseTo(1, 1);
    });

    it("converts fl oz to l", () => {
      const result = tryConvert(33.814, "fl oz", "l");
      expect(result).toBeCloseTo(1, 0);
    });

    it("converts l to fl oz", () => {
      const result = tryConvert(1, "l", "fl oz");
      expect(result).toBeCloseTo(33.814, 0);
    });

    // ── Weight conversions ──────────────────────────────────────────────

    it("converts oz to g", () => {
      const result = tryConvert(1, "oz", "g");
      expect(result).toBeCloseTo(28.3495, 1);
    });

    it("converts g to oz", () => {
      const result = tryConvert(28.3495, "g", "oz");
      expect(result).toBeCloseTo(1, 1);
    });

    it("converts lb to kg", () => {
      const result = tryConvert(1, "lb", "kg");
      expect(result).toBeCloseTo(0.4536, 2);
    });

    it("converts kg to lb", () => {
      const result = tryConvert(1, "kg", "lb");
      expect(result).toBeCloseTo(2.2046, 2);
    });

    // ── Count units ─────────────────────────────────────────────────────

    it("returns amount for same count type", () => {
      expect(tryConvert(5, "piece", "piece")).toBe(5);
      expect(tryConvert(3, "can", "can")).toBe(3);
    });

    it("returns null for different count types", () => {
      expect(tryConvert(1, "can", "bag")).toBeNull();
      expect(tryConvert(2, "bottle", "jar")).toBeNull();
    });

    // ── Cross-group ─────────────────────────────────────────────────────

    it("returns null for volume to weight conversion", () => {
      expect(tryConvert(1, "cup", "g")).toBeNull();
    });

    it("returns null for weight to volume conversion", () => {
      expect(tryConvert(100, "g", "ml")).toBeNull();
    });

    it("returns null for count to volume conversion", () => {
      expect(tryConvert(1, "piece", "cup")).toBeNull();
    });

    // ── Unknown units ───────────────────────────────────────────────────

    it("returns null for unknown from unit", () => {
      expect(tryConvert(1, "bushel", "cup")).toBeNull();
    });

    it("returns null for unknown to unit", () => {
      expect(tryConvert(1, "cup", "bushel")).toBeNull();
    });

    it("returns null when both units are unknown", () => {
      expect(tryConvert(1, "foo", "bar")).toBeNull();
    });

    // ── Alias resolution ────────────────────────────────────────────────

    it("resolves plural aliases", () => {
      expect(tryConvert(2, "teaspoons", "tablespoons")).toBeCloseTo(0.667, 1);
      expect(tryConvert(1, "liters", "milliliters")).toBeCloseTo(1000, 0);
      expect(tryConvert(1000, "grams", "kilograms")).toBeCloseTo(1, 1);
    });

    it("resolves British spelling aliases", () => {
      expect(tryConvert(1, "litre", "ml")).toBeCloseTo(1000, 0);
      expect(tryConvert(500, "millilitres", "l")).toBeCloseTo(0.5, 1);
    });

    it("resolves lbs alias", () => {
      expect(tryConvert(1, "lbs", "lb")).toBe(1);
      expect(tryConvert(2, "lbs", "oz")).toBeCloseTo(32, 0);
    });
  });
});
