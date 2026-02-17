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

vi.mock("../../services/grocery.service", () => ({
  classifyIngredients: vi.fn().mockReturnValue({ missing: [], partial: [], matched: [] }),
  deduplicateItems: vi.fn().mockImplementation((items: any[]) => items),
  createList: vi.fn().mockResolvedValue({ id: 1, userId: 1, name: "Test List" }),
  getLists: vi.fn().mockResolvedValue([]),
  getList: vi.fn().mockResolvedValue(null),
  getListItems: vi.fn().mockResolvedValue([]),
  addItems: vi.fn().mockResolvedValue([]),
  addCustomItem: vi.fn().mockResolvedValue({ id: 1 }),
  toggleItem: vi.fn().mockResolvedValue({ id: 1, checked: 1 }),
  removeItem: vi.fn().mockResolvedValue({ id: 1 }),
  deleteList: vi.fn().mockResolvedValue({ id: 1 }),
}));

vi.mock("../../services/spoonacular.service", () => ({
  findByIngredients: vi.fn().mockResolvedValue([]),
  getRecipeDetails: vi.fn(),
  searchRecipes: vi.fn(),
}));

import app from "../../app";
import * as authService from "../../services/auth.service";
import * as pantryService from "../../services/pantry.service";
import * as groceryService from "../../services/grocery.service";
import * as spoonacularService from "../../services/spoonacular.service";

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

describe("grocery routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const method of Object.keys(mockDb)) {
      mockDb[method].mockReturnValue(mockDb);
    }
  });

  describe("unauthenticated", () => {
    it("redirects to /login for GET /grocery", async () => {
      const res = await request(app).get("/grocery");
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/login");
    });

    it("redirects to /login for GET /grocery/new", async () => {
      const res = await request(app).get("/grocery/new");
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/login");
    });
  });

  describe("authenticated", () => {
    it("GET /grocery renders list of grocery lists", async () => {
      const { agent } = await loginAgent();

      (groceryService.getLists as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { id: 1, name: "Weekly Shopping", createdAt: new Date() },
      ]);

      const res = await agent.get("/grocery");
      expect(res.status).toBe(200);
      expect(res.text).toContain("Grocery Lists");
      expect(res.text).toContain("Weekly Shopping");
    });

    it("GET /grocery/new renders with saved recipes and suggestions", async () => {
      const { agent } = await loginAgent();

      // Direct DB: db.select().from(savedRecipes).where(...)
      mockDb.where.mockResolvedValueOnce([
        { id: 1, title: "Pasta Carbonara", source: "spoonacular" },
      ]);

      (pantryService.getItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { name: "Chicken" },
      ]);

      (spoonacularService.findByIngredients as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { id: 100, title: "Chicken Stir Fry", usedIngredientCount: 2, missedIngredientCount: 3 },
        { id: 101, title: "Chicken Soup", usedIngredientCount: 1, missedIngredientCount: 4 },
      ]);

      const res = await agent.get("/grocery/new");
      expect(res.status).toBe(200);
      expect(res.text).toContain("Create Grocery List");
      expect(res.text).toContain("Pasta Carbonara");
      expect(res.text).toContain("Chicken Stir Fry");
    });

    it("GET /grocery/new handles Spoonacular API failure gracefully", async () => {
      const { agent } = await loginAgent();

      mockDb.where.mockResolvedValueOnce([]);

      (pantryService.getItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { name: "Chicken" },
      ]);

      (spoonacularService.findByIngredients as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("API error")
      );

      const res = await agent.get("/grocery/new");
      expect(res.status).toBe(200);
      expect(res.text).toContain("Create Grocery List");
    });

    it("GET /grocery/new sorts suggested recipes by usedIngredientCount desc", async () => {
      const { agent } = await loginAgent();

      mockDb.where.mockResolvedValueOnce([]);

      (pantryService.getItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { name: "Chicken" },
      ]);

      (spoonacularService.findByIngredients as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { id: 101, title: "Low Match", usedIngredientCount: 1, missedIngredientCount: 5 },
        { id: 100, title: "High Match", usedIngredientCount: 5, missedIngredientCount: 1 },
      ]);

      const res = await agent.get("/grocery/new");
      expect(res.status).toBe(200);
      // High Match should appear before Low Match
      const highIdx = res.text.indexOf("High Match");
      const lowIdx = res.text.indexOf("Low Match");
      expect(highIdx).toBeLessThan(lowIdx);
    });

    it("POST /grocery/generate redirects back when no recipes selected", async () => {
      const { agent, csrfToken } = await loginAgent();

      const res = await agent
        .post("/grocery/generate")
        .send(`_csrf=${csrfToken}`);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/grocery/new");
    });

    it("POST /grocery/generate with no partial matches creates list directly", async () => {
      const { agent, csrfToken } = await loginAgent();

      // Saved recipe DB lookup
      mockDb.where.mockResolvedValueOnce([
        {
          id: 1,
          title: "Pasta",
          ingredientsJson: [{ name: "spaghetti" }, { name: "tomato sauce" }],
        },
      ]);

      (pantryService.getItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { name: "butter" },
      ]);

      (groceryService.classifyIngredients as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        missing: [{ name: "spaghetti" }, { name: "tomato sauce" }],
        partial: [],
        matched: [],
      });

      (groceryService.deduplicateItems as ReturnType<typeof vi.fn>).mockReturnValueOnce([
        { name: "spaghetti", sourceRecipeTitle: "Pasta" },
        { name: "tomato sauce", sourceRecipeTitle: "Pasta" },
      ]);

      (groceryService.createList as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 5, userId: 1, name: "Pasta",
      });

      const res = await agent
        .post("/grocery/generate")
        .send(`savedRecipes=1&_csrf=${csrfToken}`);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/grocery/5");
      expect(groceryService.createList).toHaveBeenCalledWith(1, "Pasta");
      expect(groceryService.addItems).toHaveBeenCalled();
    });

    it("POST /grocery/generate with partial matches renders confirmation", async () => {
      const { agent, csrfToken } = await loginAgent();

      mockDb.where.mockResolvedValueOnce([
        {
          id: 1,
          title: "Chicken Stir Fry",
          ingredientsJson: [{ name: "chicken breast" }, { name: "soy sauce" }],
        },
      ]);

      (pantryService.getItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { name: "chicken" },
      ]);

      (groceryService.classifyIngredients as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        missing: [{ name: "soy sauce" }],
        partial: [{ ingredient: { name: "chicken breast" }, pantryItemName: "chicken" }],
        matched: [],
      });

      (groceryService.deduplicateItems as ReturnType<typeof vi.fn>).mockReturnValueOnce([
        { name: "soy sauce", sourceRecipeTitle: "Chicken Stir Fry" },
      ]);

      const res = await agent
        .post("/grocery/generate")
        .send(`savedRecipes=1&_csrf=${csrfToken}`);

      expect(res.status).toBe(200);
      expect(res.text).toContain("Confirm Grocery List");
      expect(res.text).toContain("chicken breast");
      expect(res.text).toContain("chicken");
    });

    it("POST /grocery/generate handles Spoonacular recipe IDs", async () => {
      const { agent, csrfToken } = await loginAgent();

      (pantryService.getItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      (spoonacularService.getRecipeDetails as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        title: "Chicken Parmesan",
        extendedIngredients: [{ name: "chicken" }, { name: "parmesan" }],
      });

      (groceryService.classifyIngredients as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        missing: [{ name: "chicken" }, { name: "parmesan" }],
        partial: [],
        matched: [],
      });

      (groceryService.deduplicateItems as ReturnType<typeof vi.fn>).mockReturnValueOnce([
        { name: "chicken", sourceRecipeTitle: "Chicken Parmesan" },
        { name: "parmesan", sourceRecipeTitle: "Chicken Parmesan" },
      ]);

      (groceryService.createList as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 10, userId: 1, name: "Chicken Parmesan",
      });

      const res = await agent
        .post("/grocery/generate")
        .send(`spoonacularRecipes=123&_csrf=${csrfToken}`);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/grocery/10");
      expect(spoonacularService.getRecipeDetails).toHaveBeenCalledWith(123);
    });

    it("POST /grocery/confirm creates list from confirmed items", async () => {
      const { agent, csrfToken } = await loginAgent();

      (groceryService.createList as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 7, userId: 1, name: "Shopping List",
      });

      const missingItems = JSON.stringify([
        { name: "soy sauce", amount: "2", unit: "tbsp" },
      ]);
      const partialItems = JSON.stringify([
        { ingredientName: "chicken breast", amount: "1", unit: "lb", sourceRecipeTitle: "Stir Fry" },
      ]);

      const res = await agent
        .post("/grocery/confirm")
        .send([
          `listName=Shopping List`,
          `missingItems=${encodeURIComponent(missingItems)}`,
          `partialItems=${encodeURIComponent(partialItems)}`,
          `confirmedPartials=chicken breast`,
          `_csrf=${csrfToken}`,
        ].join("&"));

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/grocery/7");
      expect(groceryService.createList).toHaveBeenCalledWith(1, "Shopping List");
      expect(groceryService.addItems).toHaveBeenCalledWith(
        7,
        expect.arrayContaining([
          expect.objectContaining({ name: "soy sauce" }),
          expect.objectContaining({ name: "chicken breast" }),
        ])
      );
    });

    it("POST /grocery/confirm excludes unchecked partial items", async () => {
      const { agent, csrfToken } = await loginAgent();

      (groceryService.createList as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 8, userId: 1, name: "List",
      });

      const missingItems = JSON.stringify([{ name: "soy sauce" }]);
      const partialItems = JSON.stringify([
        { ingredientName: "chicken breast" },
      ]);

      // No confirmedPartials field = user unchecked all
      const res = await agent
        .post("/grocery/confirm")
        .send([
          `listName=List`,
          `missingItems=${encodeURIComponent(missingItems)}`,
          `partialItems=${encodeURIComponent(partialItems)}`,
          `_csrf=${csrfToken}`,
        ].join("&"));

      expect(res.status).toBe(302);
      expect(groceryService.addItems).toHaveBeenCalledWith(
        8,
        expect.not.arrayContaining([
          expect.objectContaining({ name: "chicken breast" }),
        ])
      );
    });

    it("GET /grocery/:id renders list detail with items", async () => {
      const { agent } = await loginAgent();

      (groceryService.getList as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 1, name: "Weekly Shopping", createdAt: new Date(),
      });

      (groceryService.getListItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { id: 1, name: "Chicken", checked: 0, isCustom: 0 },
        { id: 2, name: "Rice", checked: 1, isCustom: 0 },
      ]);

      const res = await agent.get("/grocery/1");
      expect(res.status).toBe(200);
      expect(res.text).toContain("Weekly Shopping");
      expect(res.text).toContain("Chicken");
    });

    it("GET /grocery/:id redirects when list not found", async () => {
      const { agent } = await loginAgent();

      (groceryService.getList as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const res = await agent.get("/grocery/999");
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/grocery");
    });

    it("POST /grocery/:id/add-item adds custom item", async () => {
      const { agent, csrfToken } = await loginAgent();

      (groceryService.getList as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 1, name: "Test",
      });

      const res = await agent
        .post("/grocery/1/add-item")
        .send(`name=Paper Towels&amount=1&unit=pack&_csrf=${csrfToken}`);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/grocery/1");
      expect(groceryService.addCustomItem).toHaveBeenCalledWith(1, "Paper Towels", "1", "pack");
    });

    it("POST /grocery/:id/add-item redirects when name is missing", async () => {
      const { agent, csrfToken } = await loginAgent();

      (groceryService.getList as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 1, name: "Test",
      });

      const res = await agent
        .post("/grocery/1/add-item")
        .send(`name=&_csrf=${csrfToken}`);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/grocery/1");
      expect(groceryService.addCustomItem).not.toHaveBeenCalled();
    });

    it("POST /grocery/:id/items/:itemId/toggle toggles checked state", async () => {
      const { agent, csrfToken } = await loginAgent();

      (groceryService.getList as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 1, name: "Test",
      });

      const res = await agent
        .post("/grocery/1/items/5/toggle")
        .send(`_csrf=${csrfToken}`);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/grocery/1");
      expect(groceryService.toggleItem).toHaveBeenCalledWith(5, 1);
    });

    it("POST /grocery/:id/items/:itemId/delete removes item", async () => {
      const { agent, csrfToken } = await loginAgent();

      (groceryService.getList as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 1, name: "Test",
      });

      const res = await agent
        .post("/grocery/1/items/5/delete")
        .send(`_csrf=${csrfToken}`);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/grocery/1");
      expect(groceryService.removeItem).toHaveBeenCalledWith(5, 1);
    });

    it("POST /grocery/:id/delete deletes list and redirects to index", async () => {
      const { agent, csrfToken } = await loginAgent();

      const res = await agent
        .post("/grocery/1/delete")
        .send(`_csrf=${csrfToken}`);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/grocery");
      expect(groceryService.deleteList).toHaveBeenCalledWith(1, 1);
    });
  });
});
