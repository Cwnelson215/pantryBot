import { vi } from "vitest";

export function mockFetchResponse(body: unknown, options: { ok?: boolean; status?: number; statusText?: string } = {}) {
  const { ok = true, status = 200, statusText = "OK" } = options;

  return vi.fn().mockResolvedValue({
    ok,
    status,
    statusText,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

export function mockFetchError(error: Error) {
  return vi.fn().mockRejectedValue(error);
}

export function stubFetch(mock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", mock);
  return mock;
}
