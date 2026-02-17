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

import app from "../../app";
import * as authService from "../../services/auth.service";

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

describe("preferences routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const method of Object.keys(mockDb)) {
      mockDb[method].mockReturnValue(mockDb);
    }
  });

  it("redirects to /login when not authenticated", async () => {
    const res = await request(app).get("/preferences");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/login");
  });

  it("GET /preferences renders form with no existing preferences", async () => {
    const { agent } = await loginAgent();

    // Direct DB: db.select().from(userPreferences).where(...)
    mockDb.where.mockResolvedValueOnce([]);

    const res = await agent.get("/preferences");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Preferences");
  });

  it("GET /preferences renders form with saved preferences", async () => {
    const { agent } = await loginAgent();

    mockDb.where.mockResolvedValueOnce([{
      id: 1,
      userId: 1,
      dietaryTags: ["Vegetarian"],
      allergies: ["Peanuts"],
      cuisinePrefs: ["Italian"],
      servingSize: 4,
    }]);

    const res = await agent.get("/preferences");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Preferences");
  });

  it("POST /preferences updates existing preferences", async () => {
    const { agent, csrfToken } = await loginAgent();

    // Check existing
    mockDb.where.mockResolvedValueOnce([{ id: 1, userId: 1 }]);
    // Update
    mockDb.where.mockResolvedValueOnce(undefined);

    const res = await agent
      .post("/preferences")
      .send([
        `dietaryTags=Vegetarian`,
        `dietaryTags=Vegan`,
        `allergies=Peanuts`,
        `cuisinePrefs=Italian`,
        `servingSize=4`,
        `_csrf=${csrfToken}`,
      ].join("&"));

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/preferences");
    expect(mockDb.update).toHaveBeenCalled();
  });

  it("POST /preferences creates new preferences when none exist", async () => {
    const { agent, csrfToken } = await loginAgent();

    // No existing
    mockDb.where.mockResolvedValueOnce([]);
    // Insert (no .returning())

    const res = await agent
      .post("/preferences")
      .send(`dietaryTags=Keto&servingSize=2&_csrf=${csrfToken}`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/preferences");
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it("POST /preferences handles comma-separated string input", async () => {
    const { agent, csrfToken } = await loginAgent();

    mockDb.where.mockResolvedValueOnce([]);

    const res = await agent
      .post("/preferences")
      .send(`dietaryTags=Vegetarian,Gluten-Free&_csrf=${csrfToken}`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/preferences");
  });

  it("POST /preferences handles empty input", async () => {
    const { agent, csrfToken } = await loginAgent();

    mockDb.where.mockResolvedValueOnce([{ id: 1, userId: 1 }]);
    mockDb.where.mockResolvedValueOnce(undefined);

    const res = await agent
      .post("/preferences")
      .send(`_csrf=${csrfToken}`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/preferences");
  });
});
