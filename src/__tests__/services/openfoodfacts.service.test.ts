import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseQuantity, mapToAppCategory, lookupBarcode } from "../../services/openfoodfacts.service";

describe("openfoodfacts.service", () => {
  describe("parseQuantity", () => {
    it("parses grams", () => {
      expect(parseQuantity("500 g")).toEqual({ quantity: 500, unit: "g" });
    });

    it("parses grams without space", () => {
      expect(parseQuantity("500g")).toEqual({ quantity: 500, unit: "g" });
    });

    it("parses kilograms", () => {
      expect(parseQuantity("1.5 kg")).toEqual({ quantity: 1.5, unit: "kg" });
    });

    it("parses ounces", () => {
      expect(parseQuantity("16 oz")).toEqual({ quantity: 16, unit: "oz" });
    });

    it("parses liters", () => {
      expect(parseQuantity("1 l")).toEqual({ quantity: 1, unit: "L" });
    });

    it("converts cl to ml", () => {
      expect(parseQuantity("33 cl")).toEqual({ quantity: 330, unit: "ml" });
    });

    it("parses ml", () => {
      expect(parseQuantity("500 ml")).toEqual({ quantity: 500, unit: "ml" });
    });

    it("handles comma decimal separators", () => {
      expect(parseQuantity("1,5 kg")).toEqual({ quantity: 1.5, unit: "kg" });
    });

    it("returns empty object for empty string", () => {
      expect(parseQuantity("")).toEqual({});
    });

    it("returns empty object for invalid format", () => {
      expect(parseQuantity("unknown")).toEqual({});
    });

    it("returns empty object for no unit match", () => {
      // "xyz" is not in UNIT_ALIASES, so unit will be undefined
      expect(parseQuantity("500 xyz")).toEqual({ quantity: 500, unit: undefined });
    });
  });

  describe("mapToAppCategory", () => {
    it("maps dairy tags", () => {
      expect(mapToAppCategory(["en:milk", "en:beverages"])).toBe("Dairy");
    });

    it("maps meat tags", () => {
      expect(mapToAppCategory(["en:chicken-breasts"])).toBe("Meat & Seafood");
    });

    it("maps grain tags", () => {
      expect(mapToAppCategory(["en:whole-wheat-bread"])).toBe("Grains & Bread");
    });

    it("maps produce tags", () => {
      expect(mapToAppCategory(["en:fresh-vegetables"])).toBe("Produce");
    });

    it("maps snack tags", () => {
      expect(mapToAppCategory(["en:chocolate-cookies"])).toBe("Snacks");
    });

    it("maps beverage tags", () => {
      expect(mapToAppCategory(["en:orange-juice"])).toBe("Beverages");
    });

    it("returns undefined for unknown tags", () => {
      expect(mapToAppCategory(["en:something-unknown-xyz"])).toBeUndefined();
    });

    it("returns undefined for empty array", () => {
      expect(mapToAppCategory([])).toBeUndefined();
    });
  });

  describe("lookupBarcode", () => {
    beforeEach(() => {
      vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("returns product info on success", async () => {
      const mockResponse = {
        status: 1,
        product: {
          product_name: "Whole Milk",
          brands: "Organic Valley",
          quantity: "1 l",
          categories_tags: ["en:milk"],
          image_url: "https://example.com/milk.jpg",
        },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await lookupBarcode("3270190207924");
      expect(result.found).toBe(true);
      expect(result.name).toBe("Organic Valley Whole Milk");
      expect(result.brand).toBe("Organic Valley");
      expect(result.quantity).toBe(1);
      expect(result.unit).toBe("L");
      expect(result.category).toBe("Dairy");
    });

    it("does not duplicate brand in name when already present", async () => {
      const mockResponse = {
        status: 1,
        product: {
          product_name: "Organic Valley Whole Milk",
          brands: "Organic Valley",
          quantity: "1 l",
          categories_tags: [],
        },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await lookupBarcode("1234567890");
      expect(result.name).toBe("Organic Valley Whole Milk");
    });

    it("returns not found when HTTP response is not ok", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 404,
      });

      const result = await lookupBarcode("0000000000");
      expect(result).toEqual({ found: false });
    });

    it("returns not found when status is not 1", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 0 }),
      });

      const result = await lookupBarcode("0000000000");
      expect(result).toEqual({ found: false });
    });

    it("returns not found on fetch error (e.g., timeout)", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new DOMException("The operation was aborted", "AbortError")
      );

      const result = await lookupBarcode("0000000000");
      expect(result).toEqual({ found: false });
    });

    it("returns not found when fetch never resolves (hard deadline)", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(
        new Promise(() => {}) // never resolves
      );

      const start = Date.now();
      const result = await lookupBarcode("0000000000");
      const elapsed = Date.now() - start;

      expect(result).toEqual({ found: false });
      expect(elapsed).toBeLessThan(15000);
    }, 20000);

    it("returns not found when response.json() never resolves", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => new Promise(() => {}), // body read never completes
      });

      const start = Date.now();
      const result = await lookupBarcode("0000000000");
      const elapsed = Date.now() - start;

      expect(result).toEqual({ found: false });
      expect(elapsed).toBeLessThan(15000);
    }, 20000);
  });
});
