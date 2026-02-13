import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockRequest, createMockResponse, createMockNext } from "../helpers/session.mock";
import { csrfMiddleware } from "../../middleware/csrf";

describe("csrf middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates a CSRF token if none exists", () => {
    const req = createMockRequest({ session: { csrfToken: undefined } });
    const res = createMockResponse();
    const next = createMockNext();

    csrfMiddleware(req as any, res as any, next);

    expect(req.session.csrfToken).toBeDefined();
    expect(typeof req.session.csrfToken).toBe("string");
    expect(req.session.csrfToken!.length).toBeGreaterThan(0);
    expect(next).toHaveBeenCalled();
  });

  it("sets res.locals.csrfToken", () => {
    const req = createMockRequest({ session: { csrfToken: "existing-token" } });
    const res = createMockResponse();
    const next = createMockNext();

    csrfMiddleware(req as any, res as any, next);

    expect(res.locals.csrfToken).toBe("existing-token");
  });

  it("passes through for GET requests", () => {
    const req = createMockRequest({ method: "GET", session: { csrfToken: "token" } });
    const res = createMockResponse();
    const next = createMockNext();

    csrfMiddleware(req as any, res as any, next);

    expect(next).toHaveBeenCalled();
  });

  it("passes POST with valid token", () => {
    const req = createMockRequest({
      method: "POST",
      session: { csrfToken: "valid-token" },
      body: { _csrf: "valid-token" },
    });
    const res = createMockResponse();
    const next = createMockNext();

    csrfMiddleware(req as any, res as any, next);

    expect(next).toHaveBeenCalled();
  });

  it("rejects POST with invalid token", () => {
    const req = createMockRequest({
      method: "POST",
      session: { csrfToken: "valid-token" },
      body: { _csrf: "wrong-token" },
    });
    const res = createMockResponse();
    const next = createMockNext();

    csrfMiddleware(req as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.render).toHaveBeenCalledWith("pages/error", expect.objectContaining({
      title: "Forbidden",
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects POST with missing token", () => {
    const req = createMockRequest({
      method: "POST",
      session: { csrfToken: "valid-token" },
      body: {},
    });
    const res = createMockResponse();
    const next = createMockNext();

    csrfMiddleware(req as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("validates PUT requests", () => {
    const req = createMockRequest({
      method: "PUT",
      session: { csrfToken: "token" },
      body: { _csrf: "wrong" },
    });
    const res = createMockResponse();
    const next = createMockNext();

    csrfMiddleware(req as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("validates DELETE requests", () => {
    const req = createMockRequest({
      method: "DELETE",
      session: { csrfToken: "token" },
      body: { _csrf: "wrong" },
    });
    const res = createMockResponse();
    const next = createMockNext();

    csrfMiddleware(req as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });
});
