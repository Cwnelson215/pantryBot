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

vi.mock("../../services/nutrition.service", () => ({
  logMeal: vi.fn().mockResolvedValue({ id: 1 }),
  getDailyLog: vi.fn().mockResolvedValue({ entries: [], totals: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0, sugarG: 0, sodiumMg: 0, ironMg: 0, calciumMg: 0, vitaminDMcg: 0, potassiumMg: 0, vitaminCMg: 0 } }),
  getWeeklySummary: vi.fn().mockResolvedValue([]),
  deleteLog: vi.fn().mockResolvedValue({ id: 1 }),
  computeTotals: vi.fn(),
}));

vi.mock("../../services/usda.service", () => ({
  searchFoods: vi.fn(),
  extractNutrientsFromSearchResult: vi.fn(),
}));

vi.mock("../../services/pantry.service", () => ({
  getItems: vi.fn().mockResolvedValue([]),
  getExpiringItems: vi.fn().mockResolvedValue([]),
  getItemsByCategory: vi.fn().mockResolvedValue({}),
}));

vi.mock("../../services/grocery.service", () => ({
  getLists: vi.fn().mockResolvedValue([]),
  getList: vi.fn(),
  getListItems: vi.fn().mockResolvedValue([]),
  createList: vi.fn(),
  addItems: vi.fn(),
  addCustomItem: vi.fn(),
  toggleItem: vi.fn(),
  removeItem: vi.fn(),
  deleteList: vi.fn(),
  classifyIngredients: vi.fn().mockReturnValue({ missing: [], partial: [], matched: [] }),
  deduplicateItems: vi.fn().mockImplementation((items: any[]) => items),
}));

import app from "../../app";
import * as authService from "../../services/auth.service";
import * as nutritionService from "../../services/nutrition.service";
import * as usdaService from "../../services/usda.service";

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

describe("nutrition routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const method of Object.keys(mockDb)) {
      mockDb[method].mockReturnValue(mockDb);
    }
  });

  describe("unauthenticated", () => {
    it("redirects to /login for /nutrition", async () => {
      const res = await request(app).get("/nutrition");
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/login");
    });

    it("redirects to /login for /nutrition/daily", async () => {
      const res = await request(app).get("/nutrition/daily");
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/login");
    });

    it("redirects to /login for USDA search API", async () => {
      const res = await request(app).get("/nutrition/api/usda-search?q=apple");
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/login");
    });

    it("redirects to /login for saved recipes API", async () => {
      const res = await request(app).get("/nutrition/api/saved-recipes");
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/login");
    });
  });

  describe("authenticated", () => {
    it("GET /nutrition renders weekly summary", async () => {
      const { agent } = await loginAgent();

      (nutritionService.getWeeklySummary as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { date: "2025-01-13", totals: { calories: 2000 }, entryCount: 3 },
      ]);
      // Direct DB: db.select().from(userPreferences).where(...)
      mockDb.where.mockResolvedValueOnce([]);

      const res = await agent.get("/nutrition");
      expect(res.status).toBe(200);
      expect(res.text).toContain("Nutrition");
    });

    it("GET /nutrition/daily renders daily log", async () => {
      const { agent } = await loginAgent();

      (nutritionService.getDailyLog as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        entries: [
          { id: 1, foodName: "Chicken", calories: "300" },
        ],
        totals: { calories: 300, proteinG: 30, carbsG: 0, fatG: 5, fiberG: 0, sugarG: 0, sodiumMg: 0, ironMg: 0, calciumMg: 0, vitaminDMcg: 0, potassiumMg: 0, vitaminCMg: 0 },
      });
      // Direct DB: db.select().from(userPreferences).where(...)
      mockDb.where.mockResolvedValueOnce([]);

      const res = await agent.get("/nutrition/daily?date=2025-01-15");
      expect(res.status).toBe(200);
      expect(res.text).toContain("Daily Nutrition");
    });

    it("GET /nutrition/daily defaults to today when no date param", async () => {
      const { agent } = await loginAgent();

      mockDb.where.mockResolvedValueOnce([]);

      const res = await agent.get("/nutrition/daily");
      expect(res.status).toBe(200);
      expect(nutritionService.getDailyLog).toHaveBeenCalledWith(
        1,
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
      );
    });

    it("POST /nutrition/goals updates nutrition targets", async () => {
      const { agent, csrfToken } = await loginAgent();

      // Direct DB: check existing preferences
      mockDb.where.mockResolvedValueOnce([{ id: 1, userId: 1 }]);
      // Direct DB: update preferences
      mockDb.where.mockResolvedValueOnce(undefined);

      const res = await agent
        .post("/nutrition/goals")
        .send(`calorieTarget=2000&proteinTarget=150&_csrf=${csrfToken}`);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/nutrition");
      expect(mockDb.update).toHaveBeenCalled();
    });

    it("POST /nutrition/goals creates preferences when none exist", async () => {
      const { agent, csrfToken } = await loginAgent();

      // No existing preferences
      mockDb.where.mockResolvedValueOnce([]);
      // Insert returns mockDb (no .returning())

      const res = await agent
        .post("/nutrition/goals")
        .send(`calorieTarget=1800&_csrf=${csrfToken}`);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/nutrition");
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("GET /nutrition/api/usda-search returns food results", async () => {
      const { agent } = await loginAgent();

      (usdaService.searchFoods as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { fdcId: "123", description: "Apple, raw", foodNutrients: [] },
      ]);
      (usdaService.extractNutrientsFromSearchResult as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        calories: 52, proteinG: 0.3, carbsG: 14, fatG: 0.2,
        fiberG: 2.4, sugarG: 10, sodiumMg: 1, ironMg: 0.1,
        calciumMg: 6, vitaminDMcg: 0, potassiumMg: 107, vitaminCMg: 4.6,
      });

      const res = await agent.get("/nutrition/api/usda-search?q=apple");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].description).toBe("Apple, raw");
      expect(res.body[0].nutrients.calories).toBe(52);
    });

    it("GET /nutrition/api/usda-search returns empty for empty query", async () => {
      const { agent } = await loginAgent();

      const res = await agent.get("/nutrition/api/usda-search?q=");
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
      expect(usdaService.searchFoods).not.toHaveBeenCalled();
    });

    it("GET /nutrition/api/usda-search handles API errors", async () => {
      const { agent } = await loginAgent();

      (usdaService.searchFoods as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("USDA API error")
      );

      const res = await agent.get("/nutrition/api/usda-search?q=test");
      expect(res.status).toBe(500);
      expect(res.body.error).toContain("Failed to search USDA");
    });

    it("GET /nutrition/api/saved-recipes returns user recipes", async () => {
      const { agent } = await loginAgent();

      // Direct DB: db.select({...}).from(savedRecipes).where(...)
      mockDb.where.mockResolvedValueOnce([
        { id: 1, title: "Pasta", servings: 4, nutritionJson: { calories: 500 } },
      ]);

      const res = await agent.get("/nutrition/api/saved-recipes");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].title).toBe("Pasta");
    });

    it("POST /nutrition/log logs a meal and redirects", async () => {
      const { agent, csrfToken } = await loginAgent();

      const res = await agent
        .post("/nutrition/log")
        .send([
          `logDate=2025-01-15`,
          `foodName=Chicken Breast`,
          `servings=1`,
          `calories=250`,
          `proteinG=30`,
          `carbsG=0`,
          `fatG=5`,
          `_csrf=${csrfToken}`,
        ].join("&"));

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/nutrition/daily?date=2025-01-15");
      expect(nutritionService.logMeal).toHaveBeenCalledWith(1, expect.objectContaining({
        logDate: "2025-01-15",
        foodName: "Chicken Breast",
        calories: "250",
        proteinG: "30",
      }));
    });

    it("POST /nutrition/log/:id/delete deletes entry and redirects", async () => {
      const { agent, csrfToken } = await loginAgent();

      const res = await agent
        .post("/nutrition/log/5/delete")
        .set("Referer", "/nutrition/daily?date=2025-01-15")
        .send(`_csrf=${csrfToken}`);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/nutrition/daily?date=2025-01-15");
      expect(nutritionService.deleteLog).toHaveBeenCalledWith(5, 1);
    });

    it("POST /nutrition/log/:id/delete uses default redirect when no referer", async () => {
      const { agent, csrfToken } = await loginAgent();

      const res = await agent
        .post("/nutrition/log/5/delete")
        .send(`_csrf=${csrfToken}`);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/nutrition/daily");
    });
  });
});
