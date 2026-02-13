import { vi } from "vitest";

/**
 * Creates a chainable mock that mimics Drizzle's query builder pattern.
 * Each method returns the same proxy, and results are resolved via the mock's return value.
 */
export function createMockDb() {
  const chainMethods = [
    "select",
    "from",
    "where",
    "insert",
    "values",
    "returning",
    "update",
    "set",
    "delete",
    "orderBy",
    "limit",
    "offset",
    "groupBy",
  ] as const;

  const mockDb: Record<string, ReturnType<typeof vi.fn>> = {};

  for (const method of chainMethods) {
    mockDb[method] = vi.fn();
  }

  // Wire each method to return the mock itself (chainable)
  for (const method of chainMethods) {
    mockDb[method].mockReturnValue(mockDb);
  }

  return mockDb;
}

export function createMockPool() {
  return {
    connect: vi.fn(),
    query: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
  };
}
