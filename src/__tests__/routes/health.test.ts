import { describe, it, expect, vi } from "vitest";
import request from "supertest";

vi.mock("connect-pg-simple", () => ({
  default: () => {
    const session = require("express-session");
    return session.MemoryStore;
  },
}));

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

vi.mock("../../db/client", () => ({
  db: mockDb,
  pool: { connect: vi.fn(), end: vi.fn(), on: vi.fn() },
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

describe("GET /health", () => {
  it("returns 200 ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.text).toBe("ok");
  });
});
