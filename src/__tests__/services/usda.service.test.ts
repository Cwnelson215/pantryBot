import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { extractNutrientsFromSearchResult } from "../../services/usda.service";
import { config } from "../../config";

// Mock config before importing functions that use fetch
vi.mock("../../config", () => ({
  config: {
    usda: {
      apiKey: "test-usda-key",
      baseUrl: "https://api.nal.usda.gov/fdc/v1",
    },
  },
}));

describe("usda.service", () => {
  describe("extractNutrientsFromSearchResult", () => {
    it("extracts all nutrients from a full result", () => {
      const food = {
        foodNutrients: [
          { nutrientName: "Energy", value: 250 },
          { nutrientName: "Protein", value: 12.5 },
          { nutrientName: "Carbohydrate, by difference", value: 30 },
          { nutrientName: "Total lipid (fat)", value: 10 },
          { nutrientName: "Fiber, total dietary", value: 3 },
          { nutrientName: "Sugars, total including NLEA", value: 8 },
          { nutrientName: "Sodium, Na", value: 500 },
          { nutrientName: "Iron, Fe", value: 2.5 },
          { nutrientName: "Calcium, Ca", value: 100 },
          { nutrientName: "Vitamin D (D2 + D3)", value: 5 },
          { nutrientName: "Potassium, K", value: 400 },
          { nutrientName: "Vitamin C, total ascorbic acid", value: 15 },
        ],
      };

      const result = extractNutrientsFromSearchResult(food);
      expect(result).toEqual({
        calories: 250,
        proteinG: 12.5,
        carbsG: 30,
        fatG: 10,
        fiberG: 3,
        sugarG: 8,
        sodiumMg: 500,
        ironMg: 2.5,
        calciumMg: 100,
        vitaminDMcg: 5,
        potassiumMg: 400,
        vitaminCMg: 15,
      });
    });

    it("returns all nulls for empty foodNutrients", () => {
      const food = { foodNutrients: [] };
      const result = extractNutrientsFromSearchResult(food);
      expect(result.calories).toBeNull();
      expect(result.proteinG).toBeNull();
      expect(result.fatG).toBeNull();
    });

    it("returns all nulls when foodNutrients is missing", () => {
      const result = extractNutrientsFromSearchResult({});
      expect(result.calories).toBeNull();
      expect(result.carbsG).toBeNull();
    });

    it("handles nutrient.name format (detail endpoint)", () => {
      const food = {
        foodNutrients: [
          { nutrient: { name: "Energy" }, amount: 150 },
          { nutrient: { name: "Protein" }, amount: 8 },
        ],
      };

      const result = extractNutrientsFromSearchResult(food);
      expect(result.calories).toBe(150);
      expect(result.proteinG).toBe(8);
    });

    it("takes first matching nutrient and ignores duplicates", () => {
      const food = {
        foodNutrients: [
          { nutrientName: "Energy", value: 200 },
          { nutrientName: "Energy", value: 999 },
        ],
      };

      const result = extractNutrientsFromSearchResult(food);
      expect(result.calories).toBe(200);
    });

    it("handles alternate sugar field name", () => {
      const food = {
        foodNutrients: [{ nutrientName: "Sugars, Total", value: 5 }],
      };

      const result = extractNutrientsFromSearchResult(food);
      expect(result.sugarG).toBe(5);
    });
  });

  describe("searchFoods", () => {
    beforeEach(() => {
      vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("calls the USDA API with correct URL and returns foods", async () => {
      const mockFoods = [{ fdcId: "123", description: "Apple" }];
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ foods: mockFoods }),
      });

      const { searchFoods } = await import("../../services/usda.service");
      const result = await searchFoods("apple");

      expect(global.fetch).toHaveBeenCalledOnce();
      const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toContain("query=apple");
      expect(url).toContain("pageSize=10");
      expect(result).toEqual(mockFoods);
    });

    it("throws on non-ok response", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      const { searchFoods } = await import("../../services/usda.service");
      await expect(searchFoods("test")).rejects.toThrow("USDA API error");
    });
  });

  describe("getFoodDetails", () => {
    beforeEach(() => {
      vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("fetches food details by fdcId", async () => {
      const mockFood = { fdcId: "123", description: "Apple" };
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockFood),
      });

      const { getFoodDetails } = await import("../../services/usda.service");
      const result = await getFoodDetails("123");

      const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toContain("/food/123");
      expect(result).toEqual(mockFood);
    });
  });

  describe("lookupByBarcode", () => {
    beforeEach(() => {
      vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("returns matching food when exact UPC match found", async () => {
      const mockFood = {
        fdcId: 456,
        description: "All Purpose Flour",
        brandOwner: "Great Value",
        gtinUpc: "0078742370781",
      };
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ foods: [mockFood, { fdcId: 789, gtinUpc: "9999999999" }] }),
      });

      const { lookupByBarcode } = await import("../../services/usda.service");
      const result = await lookupByBarcode("0078742370781", 5000);

      expect(result).toEqual(mockFood);
      expect(global.fetch).toHaveBeenCalledOnce();
      const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toContain("/foods/search");
      expect(options.method).toBe("POST");
      const body = JSON.parse(options.body);
      expect(body.query).toBe("0078742370781");
      expect(body.dataType).toEqual(["Branded"]);
    });

    it("returns null when no exact UPC match in results", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ foods: [{ fdcId: 123, gtinUpc: "9999999999" }] }),
      });

      const { lookupByBarcode } = await import("../../services/usda.service");
      const result = await lookupByBarcode("0078742370781", 5000);
      expect(result).toBeNull();
    });

    it("returns null when foods array is empty", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ foods: [] }),
      });

      const { lookupByBarcode } = await import("../../services/usda.service");
      const result = await lookupByBarcode("0078742370781", 5000);
      expect(result).toBeNull();
    });

    it("returns null when API key is missing", async () => {
      const original = config.usda.apiKey;
      (config.usda as any).apiKey = "";

      try {
        const { lookupByBarcode } = await import("../../services/usda.service");
        const result = await lookupByBarcode("0078742370781", 5000);
        expect(result).toBeNull();
        expect(global.fetch).not.toHaveBeenCalled();
      } finally {
        (config.usda as any).apiKey = original;
      }
    });

    it("returns null on fetch error", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network error"));

      const { lookupByBarcode } = await import("../../services/usda.service");
      const result = await lookupByBarcode("0078742370781", 5000);
      expect(result).toBeNull();
    });

    it("returns null on non-ok response", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 500,
      });

      const { lookupByBarcode } = await import("../../services/usda.service");
      const result = await lookupByBarcode("0078742370781", 5000);
      expect(result).toBeNull();
    });

    it("matches UPC with leading zeros stripped", async () => {
      const mockFood = {
        fdcId: 456,
        description: "Flour",
        gtinUpc: "78742370781",
      };
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ foods: [mockFood] }),
      });

      const { lookupByBarcode } = await import("../../services/usda.service");
      const result = await lookupByBarcode("0078742370781", 5000);
      expect(result).toEqual(mockFood);
    });
  });

  describe("getNutrients", () => {
    beforeEach(() => {
      vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("extracts nutrients from food details", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            foodNutrients: [
              { nutrient: { name: "Energy" }, amount: 52 },
              { nutrient: { name: "Protein" }, amount: 0.3 },
            ],
          }),
      });

      const { getNutrients } = await import("../../services/usda.service");
      const result = await getNutrients("123");
      expect(result.calories).toBe(52);
      expect(result.proteinG).toBe(0.3);
    });

    it("returns all nulls when foodNutrients is missing", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const { getNutrients } = await import("../../services/usda.service");
      const result = await getNutrients("999");
      expect(result.calories).toBeNull();
      expect(result.proteinG).toBeNull();
    });
  });
});
