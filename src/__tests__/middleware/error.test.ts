import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockRequest, createMockResponse, createMockNext } from "../helpers/session.mock";

// We need to control config.nodeEnv for these tests
vi.mock("../../config", () => ({
  config: {
    nodeEnv: "development",
    viewsPath: "src/views",
  },
}));

import { errorHandler } from "../../middleware/error";
import { config } from "../../config";

describe("error middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress console.error during tests
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renders error page with custom status code", () => {
    const err = { status: 404, message: "Not Found" };
    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    errorHandler(err, req as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.render).toHaveBeenCalledWith("pages/error", expect.objectContaining({
      title: "Error",
    }));
  });

  it("defaults to 500 when no status is set", () => {
    const err = { message: "Something broke" };
    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    errorHandler(err, req as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("shows detailed error in development mode", () => {
    (config as any).nodeEnv = "development";
    const err = { message: "Detailed error info" };
    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    errorHandler(err, req as any, res as any, next);

    expect(res.render).toHaveBeenCalledWith("pages/error", expect.objectContaining({
      message: "Detailed error info",
    }));
  });

  it("hides detailed error in production mode", () => {
    (config as any).nodeEnv = "production";
    const err = { message: "Secret database error" };
    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    errorHandler(err, req as any, res as any, next);

    expect(res.render).toHaveBeenCalledWith("pages/error", expect.objectContaining({
      message: "Internal Server Error",
    }));

    // Restore for other tests
    (config as any).nodeEnv = "development";
  });

  it("logs the error to console", () => {
    const err = new Error("Test error");
    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    errorHandler(err, req as any, res as any, next);

    expect(console.error).toHaveBeenCalledWith(err);
  });
});
