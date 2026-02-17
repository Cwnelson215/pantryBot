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

vi.mock("../../services/auth.service", () => ({
  registerUser: vi.fn(),
  loginUser: vi.fn(),
  getUserById: vi.fn(),
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

describe("auth routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const method of Object.keys(mockDb)) {
      mockDb[method].mockReturnValue(mockDb);
    }
    // loadUser: no user for guest routes
    mockDb.limit.mockResolvedValue([]);
  });

  describe("GET /login", () => {
    it("renders login page for guests", async () => {
      const res = await request(app).get("/login");
      expect(res.status).toBe(200);
      expect(res.text).toContain("Login");
    });
  });

  describe("GET /register", () => {
    it("renders register page for guests", async () => {
      const res = await request(app).get("/register");
      expect(res.status).toBe(200);
      expect(res.text).toContain("Register");
    });
  });

  describe("POST /login", () => {
    it("redirects to / on valid login", async () => {
      (authService.loginUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 1,
        email: "test@example.com",
        displayName: "Test",
      });

      const agent = request.agent(app);
      const loginPage = await agent.get("/login");
      const csrfMatch = loginPage.text.match(/name="_csrf" value="([^"]+)"/);
      const csrfToken = csrfMatch ? csrfMatch[1] : "";

      const res = await agent
        .post("/login")
        .send(`email=test@example.com&password=password123&_csrf=${csrfToken}`);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/");
    });

    it("redirects back to /login with missing fields", async () => {
      const agent = request.agent(app);
      const loginPage = await agent.get("/login");
      const csrfMatch = loginPage.text.match(/name="_csrf" value="([^"]+)"/);
      const csrfToken = csrfMatch ? csrfMatch[1] : "";

      const res = await agent
        .post("/login")
        .send(`email=&password=&_csrf=${csrfToken}`);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/login");
    });

    it("redirects back to /login on invalid credentials", async () => {
      (authService.loginUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const agent = request.agent(app);
      const loginPage = await agent.get("/login");
      const csrfMatch = loginPage.text.match(/name="_csrf" value="([^"]+)"/);
      const csrfToken = csrfMatch ? csrfMatch[1] : "";

      const res = await agent
        .post("/login")
        .send(`email=wrong@example.com&password=wrong&_csrf=${csrfToken}`);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/login");
    });
  });

  describe("POST /register", () => {
    it("redirects to / on successful registration", async () => {
      (authService.registerUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 2,
        email: "new@example.com",
        displayName: "New User",
      });

      const agent = request.agent(app);
      const regPage = await agent.get("/register");
      const csrfMatch = regPage.text.match(/name="_csrf" value="([^"]+)"/);
      const csrfToken = csrfMatch ? csrfMatch[1] : "";

      const res = await agent
        .post("/register")
        .send(`email=new@example.com&password=password123&displayName=New User&_csrf=${csrfToken}`);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/");
    });

    it("redirects back to /register on duplicate email", async () => {
      (authService.registerUser as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("A user with this email already exists")
      );

      const agent = request.agent(app);
      const regPage = await agent.get("/register");
      const csrfMatch = regPage.text.match(/name="_csrf" value="([^"]+)"/);
      const csrfToken = csrfMatch ? csrfMatch[1] : "";

      const res = await agent
        .post("/register")
        .send(`email=dupe@example.com&password=password123&displayName=Dupe&_csrf=${csrfToken}`);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/register");
    });
  });

  describe("POST /logout", () => {
    it("destroys session and redirects to /login", async () => {
      const agent = request.agent(app);
      const loginPage = await agent.get("/login");
      const csrfMatch = loginPage.text.match(/name="_csrf" value="([^"]+)"/);
      const csrfToken = csrfMatch ? csrfMatch[1] : "";

      const res = await agent
        .post("/logout")
        .send(`_csrf=${csrfToken}`);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/login");
    });
  });
});
