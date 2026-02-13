import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockRequest, createMockResponse, createMockNext } from "../helpers/session.mock";
import { flashMiddleware, setFlash } from "../../middleware/flash";

describe("flash middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("flashMiddleware", () => {
    it("moves flash messages from session to res.locals", () => {
      const messages = [{ type: "success", message: "Item added" }];
      const req = createMockRequest({
        session: { flash: messages },
      });
      const res = createMockResponse();
      const next = createMockNext();

      flashMiddleware(req as any, res as any, next);

      expect(res.locals.flash).toEqual(messages);
      expect(next).toHaveBeenCalled();
    });

    it("clears session flash after moving to res.locals", () => {
      const messages = [{ type: "error", message: "Something failed" }];
      const req = createMockRequest({
        session: { flash: messages },
      });
      const res = createMockResponse();
      const next = createMockNext();

      flashMiddleware(req as any, res as any, next);

      expect(req.session.flash).toEqual([]);
    });

    it("sets empty array when no flash messages exist", () => {
      const req = createMockRequest({
        session: { flash: undefined },
      });
      const res = createMockResponse();
      const next = createMockNext();

      flashMiddleware(req as any, res as any, next);

      expect(res.locals.flash).toEqual([]);
    });
  });

  describe("setFlash", () => {
    it("adds a flash message to the session", () => {
      const req = createMockRequest({
        session: { flash: [] },
      });

      setFlash(req as any, "success", "Item added");

      expect(req.session.flash).toEqual([
        { type: "success", message: "Item added" },
      ]);
    });

    it("initializes flash array if not present", () => {
      const req = createMockRequest({
        session: { flash: undefined },
      });

      setFlash(req as any, "error", "Something failed");

      expect(req.session.flash).toEqual([
        { type: "error", message: "Something failed" },
      ]);
    });

    it("appends to existing flash messages", () => {
      const req = createMockRequest({
        session: { flash: [{ type: "info", message: "First" }] },
      });

      setFlash(req as any, "success", "Second");

      expect(req.session.flash).toHaveLength(2);
    });
  });
});
