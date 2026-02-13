import { vi } from "vitest";

export function createMockRequest(overrides: Record<string, unknown> = {}) {
  return {
    session: {
      userId: undefined as number | undefined,
      csrfToken: undefined as string | undefined,
      flash: [] as { type: string; message: string }[],
      destroy: vi.fn((cb: () => void) => cb()),
      save: vi.fn((cb?: () => void) => cb?.()),
    },
    body: {},
    params: {},
    query: {},
    method: "GET",
    get: vi.fn(),
    ...overrides,
  };
}

export function createMockResponse() {
  const res: Record<string, unknown> = {
    locals: {} as Record<string, unknown>,
    statusCode: 200,
  };

  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn(() => res);
  res.send = vi.fn(() => res);
  res.render = vi.fn(() => res);
  res.redirect = vi.fn(() => res);

  return res;
}

export function createMockNext() {
  return vi.fn();
}

export function createAuthenticatedRequest(
  userId: number = 1,
  overrides: Record<string, unknown> = {}
) {
  return createMockRequest({
    session: {
      userId,
      csrfToken: "test-csrf-token",
      flash: [],
      destroy: vi.fn((cb: () => void) => cb()),
      save: vi.fn((cb?: () => void) => cb?.()),
    },
    ...overrides,
  });
}
