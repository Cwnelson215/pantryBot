import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCreate } = vi.hoisted(() => {
  return { mockCreate: vi.fn() };
});

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
    },
  };
});

vi.mock("../../config", () => ({
  config: {
    anthropic: { apiKey: "test-anthropic-key" },
  },
}));

import { personalizeRecipe, generateRecipe } from "../../services/claude.service";

describe("claude.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateRecipe", () => {
    it("parses JSON response from Claude", async () => {
      const recipeJson = JSON.stringify({
        title: "Pasta Primavera",
        servings: 4,
        readyInMinutes: 30,
        ingredients: [{ name: "pasta", amount: "1", unit: "lb" }],
        instructions: ["Cook pasta", "Add vegetables"],
      });

      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: recipeJson }],
      });

      const result = await generateRecipe(["pasta", "tomatoes"], {});
      expect(result.title).toBe("Pasta Primavera");
      expect(result.servings).toBe(4);
      expect(result.readyInMinutes).toBe(30);
      expect(result.ingredients).toHaveLength(1);
      expect(result.instructions).toHaveLength(2);
      expect(result.rawResponse).toBe(recipeJson);
    });

    it("extracts JSON from markdown code blocks", async () => {
      const recipeJson = JSON.stringify({
        title: "Simple Salad",
        servings: 2,
        readyInMinutes: 10,
        ingredients: [{ name: "lettuce", amount: "1", unit: "head" }],
        instructions: ["Wash lettuce"],
      });

      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: "```json\n" + recipeJson + "\n```" }],
      });

      const result = await generateRecipe(["lettuce"], {});
      expect(result.title).toBe("Simple Salad");
    });

    it("passes preferences in the prompt", async () => {
      const recipeJson = JSON.stringify({
        title: "Vegan Bowl",
        servings: 2,
        readyInMinutes: 15,
        ingredients: [],
        instructions: [],
      });

      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: recipeJson }],
      });

      await generateRecipe(["rice", "beans"], {
        dietaryTags: ["Vegan"],
        allergies: ["Peanuts"],
        cuisinePrefs: ["Mexican"],
        servingSize: 2,
      });

      const prompt = mockCreate.mock.calls[0][0].messages[0].content;
      expect(prompt).toContain("Vegan");
      expect(prompt).toContain("Peanuts");
      expect(prompt).toContain("Mexican");
      expect(prompt).toContain("2");
    });

    it("throws when JSON is invalid", async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: "Not valid JSON at all" }],
      });

      await expect(generateRecipe(["test"], {})).rejects.toThrow();
    });
  });

  describe("personalizeRecipe", () => {
    it("returns personalized text", async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: "Here is your personalized recipe..." }],
      });

      const result = await personalizeRecipe(
        { title: "Pasta", ingredients: ["pasta", "sauce"], instructions: "Cook it" },
        ["pasta", "tomatoes"],
        { dietaryTags: ["Vegetarian"] }
      );

      expect(result).toBe("Here is your personalized recipe...");
    });

    it("returns empty string when no text block found", async () => {
      mockCreate.mockResolvedValue({
        content: [],
      });

      const result = await personalizeRecipe(
        { title: "Test", ingredients: [], instructions: "" },
        [],
        {}
      );

      expect(result).toBe("");
    });

    it("includes recipe details and preferences in prompt", async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: "Adapted recipe" }],
      });

      await personalizeRecipe(
        { title: "Chicken Stir Fry", ingredients: ["chicken", "broccoli"], instructions: "Stir fry together" },
        ["chicken", "rice", "soy sauce"],
        { allergies: ["Peanuts"], servingSize: 4 }
      );

      const prompt = mockCreate.mock.calls[0][0].messages[0].content;
      expect(prompt).toContain("Chicken Stir Fry");
      expect(prompt).toContain("chicken, broccoli");
      expect(prompt).toContain("Peanuts");
      expect(prompt).toContain("4");
    });
  });
});
