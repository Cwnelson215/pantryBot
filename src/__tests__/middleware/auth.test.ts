import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockRequest, createMockResponse, createMockNext } from "../helpers/session.mock";

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
  pool: { connect: vi.fn(), end: vi.fn() },
}));

import { requireAuth, guestOnly, loadUser } from "../../middleware/auth";

describe("auth middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const method of Object.keys(mockDb)) {
      mockDb[method].mockReturnValue(mockDb);
    }
  });

  describe("requireAuth", () => {
    it("calls next when user is authenticated", () => {
      const req = createMockRequest({ session: { userId: 1 } });
      const res = createMockResponse();
      const next = createMockNext();

      requireAuth(req as any, res as any, next);

      expect(next).toHaveBeenCalled();
      expect(res.redirect).not.toHaveBeenCalled();
    });

    it("redirects to /login when not authenticated", () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      requireAuth(req as any, res as any, next);

      expect(res.redirect).toHaveBeenCalledWith("/login");
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("guestOnly", () => {
    it("calls next when user is not authenticated", () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      guestOnly(req as any, res as any, next);

      expect(next).toHaveBeenCalled();
      expect(res.redirect).not.toHaveBeenCalled();
    });

    it("redirects to / when user is authenticated", () => {
      const req = createMockRequest({ session: { userId: 1 } });
      const res = createMockResponse();
      const next = createMockNext();

      guestOnly(req as any, res as any, next);

      expect(res.redirect).toHaveBeenCalledWith("/");
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("loadUser", () => {
    it("sets res.locals.user to null when no session userId", async () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      await loadUser(req as any, res as any, next);

      expect(res.locals.user).toBeNull();
      expect(next).toHaveBeenCalled();
    });

    it("loads user into res.locals when session has userId", async () => {
      const mockUser = { id: 1, email: "test@example.com", displayName: "Test" };
      mockDb.limit.mockResolvedValueOnce([mockUser]);

      const req = createMockRequest({ session: { userId: 1 } });
      const res = createMockResponse();
      const next = createMockNext();

      await loadUser(req as any, res as any, next);

      expect(res.locals.user).toEqual(mockUser);
      expect(next).toHaveBeenCalled();
    });

    it("destroys session and redirects when user not found in DB", async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const destroyFn = vi.fn((cb: () => void) => cb());
      const req = createMockRequest({
        session: { userId: 999, destroy: destroyFn },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await loadUser(req as any, res as any, next);

      expect(destroyFn).toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith("/login");
      expect(next).not.toHaveBeenCalled();
    });
  });
});
