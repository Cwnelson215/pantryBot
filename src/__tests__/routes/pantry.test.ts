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
  getItem: vi.fn(),
  addItem: vi.fn().mockResolvedValue({ id: 1 }),
  updateItem: vi.fn().mockResolvedValue({ id: 1 }),
  deleteItem: vi.fn().mockResolvedValue({ id: 1 }),
  getExpiringItems: vi.fn().mockResolvedValue([]),
  getItemsByCategory: vi.fn().mockResolvedValue({}),
}));

vi.mock("../../services/openfoodfacts.service", () => ({
  lookupBarcode: vi.fn(),
}));

import app from "../../app";
import * as authService from "../../services/auth.service";
import * as pantryService from "../../services/pantry.service";
import * as openfoodfacts from "../../services/openfoodfacts.service";

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

describe("pantry routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const method of Object.keys(mockDb)) {
      mockDb[method].mockReturnValue(mockDb);
    }
  });

  describe("unauthenticated", () => {
    it("redirects to /login for GET /pantry", async () => {
      const res = await request(app).get("/pantry");
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/login");
    });

    it("redirects to /login for GET /pantry/add", async () => {
      const res = await request(app).get("/pantry/add");
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/login");
    });

    it("redirects to /login for barcode lookup", async () => {
      const res = await request(app).get("/pantry/lookup-barcode/3270190207924");
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/login");
    });
  });

  describe("authenticated", () => {
    it("GET /pantry renders pantry page with categories", async () => {
      const { agent } = await loginAgent();

      (pantryService.getItemsByCategory as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        Dairy: [{ id: 1, name: "Milk", category: "Dairy" }],
        Produce: [{ id: 2, name: "Apple", category: "Produce" }],
      });

      const res = await agent.get("/pantry");
      expect(res.status).toBe(200);
      expect(res.text).toContain("My Pantry");
    });

    it("GET /pantry/add renders add form", async () => {
      const { agent } = await loginAgent();

      const res = await agent.get("/pantry/add");
      expect(res.status).toBe(200);
      expect(res.text).toContain("Add Pantry Item");
    });

    it("POST /pantry/add creates item and redirects", async () => {
      const { agent, csrfToken } = await loginAgent();

      const res = await agent
        .post("/pantry/add")
        .send(`name=Milk&quantity=1&unit=L&category=Dairy&_csrf=${csrfToken}`);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/pantry");
      expect(pantryService.addItem).toHaveBeenCalledWith(1, expect.objectContaining({
        name: "Milk",
        quantity: "1",
        unit: "L",
        category: "Dairy",
      }));
    });

    it("POST /pantry/add redirects back when name is missing", async () => {
      const { agent, csrfToken } = await loginAgent();

      const res = await agent
        .post("/pantry/add")
        .send(`name=&quantity=1&_csrf=${csrfToken}`);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/pantry/add");
      expect(pantryService.addItem).not.toHaveBeenCalled();
    });

    it("GET /pantry/:id/edit renders edit form", async () => {
      const { agent } = await loginAgent();

      (pantryService.getItem as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 1, userId: 1, name: "Milk", quantity: "1", unit: "L",
        category: "Dairy", expirationDate: null, notes: null,
      });

      const res = await agent.get("/pantry/1/edit");
      expect(res.status).toBe(200);
      expect(res.text).toContain("Edit Item");
    });

    it("GET /pantry/:id/edit redirects when item not found", async () => {
      const { agent } = await loginAgent();

      (pantryService.getItem as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const res = await agent.get("/pantry/999/edit");
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/pantry");
    });

    it("POST /pantry/:id/edit updates item and redirects", async () => {
      const { agent, csrfToken } = await loginAgent();

      const res = await agent
        .post("/pantry/1/edit")
        .send(`name=Whole Milk&quantity=2&unit=L&category=Dairy&_csrf=${csrfToken}`);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/pantry");
      expect(pantryService.updateItem).toHaveBeenCalledWith(1, 1, expect.objectContaining({
        name: "Whole Milk",
      }));
    });

    it("POST /pantry/:id/delete deletes item and redirects", async () => {
      const { agent, csrfToken } = await loginAgent();

      const res = await agent
        .post("/pantry/1/delete")
        .send(`_csrf=${csrfToken}`);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/pantry");
      expect(pantryService.deleteItem).toHaveBeenCalledWith(1, 1);
    });

    it("GET /pantry/lookup-barcode returns product data", async () => {
      const { agent } = await loginAgent();

      (openfoodfacts.lookupBarcode as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        found: true,
        name: "Organic Milk",
        brand: "Organic Valley",
        quantity: 1,
        unit: "L",
        category: "Dairy",
      });

      const res = await agent.get("/pantry/lookup-barcode/3270190207924");
      expect(res.status).toBe(200);
      expect(res.body.found).toBe(true);
      expect(res.body.name).toBe("Organic Milk");
    });

    it("GET /pantry/lookup-barcode rejects invalid barcode format", async () => {
      const { agent } = await loginAgent();

      const res = await agent.get("/pantry/lookup-barcode/abc");
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid barcode");
    });

    it("GET /pantry/lookup-barcode handles service error", async () => {
      const { agent } = await loginAgent();

      (openfoodfacts.lookupBarcode as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("timeout")
      );

      const res = await agent.get("/pantry/lookup-barcode/3270190207924");
      expect(res.status).toBe(500);
      expect(res.body.error).toContain("Failed to look up barcode");
    });

    it("GET /pantry/lookup-barcode returns 504 when service never resolves", async () => {
      const { agent } = await loginAgent();

      (openfoodfacts.lookupBarcode as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        new Promise(() => {}) // never resolves
      );

      const res = await agent.get("/pantry/lookup-barcode/3270190207924");
      expect(res.status).toBe(504);
      expect(res.body.error).toContain("timed out");
    }, 20000);
  });
});
