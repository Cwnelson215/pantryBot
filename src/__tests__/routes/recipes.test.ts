import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const { mockDb } = vi.hoisted(() => {
  const methods = [
    "select", "from", "where", "insert", "values", "returning",
    "update", "set", "delete", "orderBy", "limit", "offset", "groupBy",
  ] as const;
  const db: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of methods) db[m] = vi.fn();
  for (const m of methods) db[m].mockReturnValue(db);
  return { mockDb: db };
});

vi.mock("connect-pg-simple", () => ({
  default: () => {
    const session = require("express-session");
    return session.MemoryStore;
  },
}));

vi.mock("../../db/client", () => ({
  db: mockDb,
  pool: { connect: vi.fn(), end: vi.fn(), on: vi.fn() },
}));

vi.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    if (!req.session.userId) return res.redirect("/login");
    next();
  },
  guestOnly: (req: any, res: any, next: any) => {
    if (req.session.userId) return res.redirect("/");
    next();
  },
  loadUser: (req: any, res: any, next: any) => {
    res.locals.user = req.session.userId
      ? { id: req.session.userId, email: "test@example.com", displayName: "Test" }
      : null;
    next();
  },
}));

vi.mock("../../services/auth.service", () => ({
  registerUser: vi.fn(),
  loginUser: vi.fn(),
  getUserById: vi.fn(),
}));

vi.mock("../../services/pantry.service", () => ({
  getItems: vi.fn().mockResolvedValue([]),
  getExpiringItems: vi.fn().mockResolvedValue([]),
  getItemsByCategory: vi.fn().mockResolvedValue({}),
}));

vi.mock("../../services/spoonacular.service", () => ({
  findByIngredients: vi.fn(),
  getRecipeDetails: vi.fn(),
  searchRecipes: vi.fn(),
}));

vi.mock("../../services/claude.service", () => ({
  generateRecipe: vi.fn(),
  personalizeRecipe: vi.fn(),
}));

vi.mock("../../routes/grocery", () => {
  const { Router } = require("express");
  return { default: Router() };
});

import app from "../../app";
import * as authService from "../../services/auth.service";
import * as pantryService from "../../services/pantry.service";
import * as spoonacularService from "../../services/spoonacular.service";
import * as claudeService from "../../services/claude.service";

async function loginAgent() {
  const agent = request.agent(app);
  const page = await agent.get("/login");
  const csrfMatch = page.text.match(/name="_csrf" value="([^"]+)"/);
  const csrfToken = csrfMatch![1];

  (authService.loginUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    id: 1, email: "test@example.com",
  });
  await agent.post("/login").send(`email=test@example.com&password=pass&_csrf=${csrfToken}`);
  return { agent, csrfToken };
}

describe("recipes routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const method of Object.keys(mockDb)) {
      mockDb[method].mockReturnValue(mockDb);
    }
  });

  describe("unauthenticated", () => {
    it("redirects to /login for /recipes", async () => {
      const res = await request(app).get("/recipes");
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/login");
    });

    it("redirects to /login for /recipes/search", async () => {
      const res = await request(app).get("/recipes/search");
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/login");
    });

    it("redirects to /login for /recipes/generate", async () => {
      const res = await request(app).get("/recipes/generate");
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/login");
    });

    it("redirects to /login for /recipes/saved", async () => {
      const res = await request(app).get("/recipes/saved");
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/login");
    });
  });

  describe("authenticated", () => {
    it("GET /recipes renders index page", async () => {
      const { agent } = await loginAgent();

      const res = await agent.get("/recipes");
      expect(res.status).toBe(200);
      expect(res.text).toContain("Recipes");
    });

    it("GET /recipes/search renders search results from pantry", async () => {
      const { agent } = await loginAgent();

      (pantryService.getItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { name: "Chicken" },
        { name: "Rice" },
      ]);
      (spoonacularService.findByIngredients as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { id: 1, title: "Chicken Fried Rice", image: "img.jpg" },
      ]);

      const res = await agent.get("/recipes/search");
      expect(res.status).toBe(200);
      expect(res.text).toContain("Recipe Search");
      expect(spoonacularService.findByIngredients).toHaveBeenCalledWith(["Chicken", "Rice"]);
    });

    it("GET /recipes/search renders empty on API error", async () => {
      const { agent } = await loginAgent();

      (pantryService.getItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
      (spoonacularService.findByIngredients as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("API key invalid")
      );

      const res = await agent.get("/recipes/search");
      expect(res.status).toBe(200);
      expect(res.text).toContain("Recipe Search");
    });

    it("GET /recipes/saved renders saved recipes", async () => {
      const { agent } = await loginAgent();

      // Direct DB: db.select().from(savedRecipes).where(...)
      mockDb.where.mockResolvedValueOnce([
        { id: 1, title: "Pasta Carbonara", source: "spoonacular" },
      ]);

      const res = await agent.get("/recipes/saved");
      expect(res.status).toBe(200);
      expect(res.text).toContain("Saved Recipes");
    });

    it("GET /recipes/generate renders form with pantry items", async () => {
      const { agent } = await loginAgent();

      (pantryService.getItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { id: 1, name: "Pasta" },
        { id: 2, name: "Tomatoes" },
      ]);

      const res = await agent.get("/recipes/generate");
      expect(res.status).toBe(200);
      expect(res.text).toContain("Generate Recipe");
    });

    it("POST /recipes/generate renders generated recipe", async () => {
      const { agent, csrfToken } = await loginAgent();

      // Direct DB: db.select().from(userPreferences).where(...)
      mockDb.where.mockResolvedValueOnce([]);

      (claudeService.generateRecipe as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        title: "Quick Pasta",
        servings: 4,
        readyInMinutes: 20,
        ingredients: [{ name: "pasta", amount: "1", unit: "lb" }],
        instructions: ["Boil pasta", "Add sauce"],
        rawResponse: "{}",
      });

      const res = await agent
        .post("/recipes/generate")
        .send(`ingredients=pasta&ingredients=tomatoes&_csrf=${csrfToken}`);

      expect(res.status).toBe(200);
      expect(res.text).toContain("Quick Pasta");
      expect(claudeService.generateRecipe).toHaveBeenCalledWith(
        ["pasta", "tomatoes"],
        expect.any(Object)
      );
    });

    it("POST /recipes/generate redirects on error", async () => {
      const { agent, csrfToken } = await loginAgent();

      mockDb.where.mockResolvedValueOnce([]);

      (claudeService.generateRecipe as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("Anthropic API key not configured")
      );

      const res = await agent
        .post("/recipes/generate")
        .send(`ingredients=pasta&_csrf=${csrfToken}`);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/recipes/generate");
    });

    it("GET /recipes/:id renders recipe detail from Spoonacular", async () => {
      const { agent } = await loginAgent();

      (spoonacularService.getRecipeDetails as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 123,
        title: "Chicken Parmesan",
        servings: 4,
        readyInMinutes: 45,
        extendedIngredients: [],
        instructions: "Cook chicken...",
      });

      const res = await agent.get("/recipes/123");
      expect(res.status).toBe(200);
      expect(res.text).toContain("Chicken Parmesan");
    });

    it("GET /recipes/:id with NaN redirects to /recipes", async () => {
      const { agent } = await loginAgent();

      const res = await agent.get("/recipes/notanumber");
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/recipes");
    });

    it("GET /recipes/:id redirects on API error", async () => {
      const { agent } = await loginAgent();

      (spoonacularService.getRecipeDetails as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("Not Found")
      );

      const res = await agent.get("/recipes/999");
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/recipes");
    });

    it("POST /recipes/save saves recipe and redirects", async () => {
      const { agent, csrfToken } = await loginAgent();

      // Direct DB: db.insert(savedRecipes).values({...})
      // No .returning(), so .values() returns mockDb which is awaited → fine

      const res = await agent
        .post("/recipes/save")
        .send([
          `title=Pasta Carbonara`,
          `source=spoonacular`,
          `spoonacularId=123`,
          `servings=4`,
          `readyInMinutes=30`,
          `_csrf=${csrfToken}`,
        ].join("&"));

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/recipes/saved");
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("POST /recipes/:id/personalize renders personalized recipe", async () => {
      const { agent, csrfToken } = await loginAgent();

      (spoonacularService.getRecipeDetails as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 123,
        title: "Chicken Stir Fry",
        ingredients: ["chicken", "vegetables"],
        instructions: "Stir fry everything",
      });
      (pantryService.getItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { name: "Chicken" },
        { name: "Soy Sauce" },
      ]);
      // Direct DB: db.select().from(userPreferences).where(...)
      mockDb.where.mockResolvedValueOnce([]);

      (claudeService.personalizeRecipe as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        "Here is your adapted recipe with soy sauce..."
      );

      const res = await agent
        .post("/recipes/123/personalize")
        .send(`_csrf=${csrfToken}`);

      expect(res.status).toBe(200);
      expect(res.text).toContain("Chicken Stir Fry");
      expect(claudeService.personalizeRecipe).toHaveBeenCalled();
    });

    it("POST /recipes/:id/personalize redirects on error", async () => {
      const { agent, csrfToken } = await loginAgent();

      (spoonacularService.getRecipeDetails as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("API error")
      );

      const res = await agent
        .post("/recipes/123/personalize")
        .send(`_csrf=${csrfToken}`);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/recipes/123");
    });
  });
});
