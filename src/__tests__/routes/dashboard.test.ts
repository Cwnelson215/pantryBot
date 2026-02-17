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
  getExpiringItems: vi.fn().mockResolvedValue([]),
  getItems: vi.fn().mockResolvedValue([]),
  getItemsByCategory: vi.fn().mockResolvedValue({}),
}));

vi.mock("../../services/grocery.service", () => ({
  classifyIngredients: vi.fn(),
  deduplicateItems: vi.fn(),
  createList: vi.fn(),
  getLists: vi.fn().mockResolvedValue([]),
  getList: vi.fn(),
  getListItems: vi.fn().mockResolvedValue([]),
  addItems: vi.fn(),
  addCustomItem: vi.fn(),
  toggleItem: vi.fn(),
  removeItem: vi.fn(),
  deleteList: vi.fn(),
}));

import app from "../../app";
import * as authService from "../../services/auth.service";
import * as pantryService from "../../services/pantry.service";

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

describe("dashboard routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const method of Object.keys(mockDb)) {
      mockDb[method].mockReturnValue(mockDb);
    }
  });

  it("redirects to /login when not authenticated", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/login");
  });

  it("renders dashboard when authenticated", async () => {
    const { agent } = await loginAgent();

    (pantryService.getExpiringItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: 1, name: "Milk", expirationDate: "2025-06-01" },
    ]);
    (pantryService.getItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: 1, name: "Milk" },
      { id: 2, name: "Eggs" },
    ]);
    // Direct DB query: db.select().from(savedRecipes).where().orderBy().limit(5)
    mockDb.limit.mockResolvedValueOnce([
      { id: 1, title: "Pasta Carbonara", createdAt: new Date() },
    ]);

    const res = await agent.get("/");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Dashboard");
  });
});
