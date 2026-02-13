import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../config", () => ({
  config: {
    spoonacular: {
      apiKey: "test-spoonacular-key",
      baseUrl: "https://api.spoonacular.com",
    },
  },
}));

import { findByIngredients, getRecipeDetails, searchRecipes } from "../../services/spoonacular.service";

describe("spoonacular.service", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("findByIngredients", () => {
    it("calls API with correct URL and returns results", async () => {
      const mockRecipes = [{ id: 1, title: "Pasta" }];
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockRecipes),
      });

      const result = await findByIngredients(["pasta", "tomatoes"]);
      expect(result).toEqual(mockRecipes);

      const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toContain("findByIngredients");
      expect(url).toContain("pasta%2Ctomatoes");
      expect(url).toContain("number=10");
    });

    it("uses custom number parameter", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await findByIngredients(["rice"], 5);

      const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toContain("number=5");
    });

    it("throws on API error", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 402,
        statusText: "Payment Required",
      });

      await expect(findByIngredients(["test"])).rejects.toThrow(
        "Spoonacular API error: 402 Payment Required"
      );
    });
  });

  describe("getRecipeDetails", () => {
    it("fetches recipe details by id", async () => {
      const mockRecipe = { id: 123, title: "Pasta Carbonara" };
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockRecipe),
      });

      const result = await getRecipeDetails(123);
      expect(result).toEqual(mockRecipe);

      const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toContain("/recipes/123/information");
      expect(url).toContain("includeNutrition=true");
    });

    it("throws on API error", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(getRecipeDetails(999)).rejects.toThrow(
        "Spoonacular API error: 404 Not Found"
      );
    });
  });

  describe("searchRecipes", () => {
    it("searches with query and default options", async () => {
      const mockResults = { results: [{ id: 1 }] };
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResults),
      });

      const result = await searchRecipes("chicken");
      expect(result).toEqual(mockResults);

      const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toContain("query=chicken");
      expect(url).toContain("number=10");
      expect(url).toContain("addRecipeInformation=true");
    });

    it("includes diet and cuisine options", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      });

      await searchRecipes("salad", {
        diet: "vegetarian",
        cuisine: "italian",
        number: 5,
      });

      const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toContain("diet=vegetarian");
      expect(url).toContain("cuisine=italian");
      expect(url).toContain("number=5");
    });

    it("throws on API error", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      await expect(searchRecipes("test")).rejects.toThrow(
        "Spoonacular API error"
      );
    });
  });
});
