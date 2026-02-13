import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDb, mockBcrypt } = vi.hoisted(() => {
  const methods = [
    "select", "from", "where", "insert", "values", "returning",
    "update", "set", "delete", "orderBy", "limit", "offset", "groupBy",
  ] as const;
  const db: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of methods) {
    db[m] = vi.fn();
  }
  for (const m of methods) {
    db[m].mockReturnValue(db);
  }
  return {
    mockDb: db,
    mockBcrypt: {
      hash: vi.fn().mockResolvedValue("hashed-password"),
      compare: vi.fn(),
    },
  };
});

vi.mock("../../db/client", () => ({
  db: mockDb,
  pool: { connect: vi.fn(), end: vi.fn() },
}));

vi.mock("bcrypt", () => ({
  default: mockBcrypt,
}));

import bcrypt from "bcrypt";
import { registerUser, loginUser, getUserById } from "../../services/auth.service";

describe("auth.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const method of Object.keys(mockDb)) {
      mockDb[method].mockReturnValue(mockDb);
    }
  });

  describe("registerUser", () => {
    it("hashes the password and inserts a new user", async () => {
      mockDb.where.mockResolvedValueOnce([]);
      mockDb.returning.mockResolvedValueOnce([
        {
          id: 1,
          email: "test@example.com",
          passwordHash: "hashed-password",
          displayName: "Test User",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await registerUser("test@example.com", "password123", "Test User");

      expect(bcrypt.hash).toHaveBeenCalledWith("password123", 10);
      expect(result).toHaveProperty("id", 1);
      expect(result).toHaveProperty("email", "test@example.com");
      expect(result).not.toHaveProperty("passwordHash");
    });

    it("throws when email already exists", async () => {
      mockDb.where.mockResolvedValueOnce([{ id: 1, email: "test@example.com" }]);

      await expect(
        registerUser("test@example.com", "password123")
      ).rejects.toThrow("A user with this email already exists");
    });
  });

  describe("loginUser", () => {
    it("returns user without password on valid credentials", async () => {
      mockDb.where.mockResolvedValueOnce([
        {
          id: 1,
          email: "test@example.com",
          passwordHash: "hashed-password",
          displayName: "Test",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      mockBcrypt.compare.mockResolvedValue(true);

      const result = await loginUser("test@example.com", "password123");

      expect(result).toHaveProperty("id", 1);
      expect(result).not.toHaveProperty("passwordHash");
    });

    it("returns null when email not found", async () => {
      mockDb.where.mockResolvedValueOnce([]);

      const result = await loginUser("nonexistent@example.com", "password123");
      expect(result).toBeNull();
    });

    it("returns null when password is wrong", async () => {
      mockDb.where.mockResolvedValueOnce([
        {
          id: 1,
          email: "test@example.com",
          passwordHash: "hashed-password",
          displayName: "Test",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      mockBcrypt.compare.mockResolvedValue(false);

      const result = await loginUser("test@example.com", "wrong-password");
      expect(result).toBeNull();
    });
  });

  describe("getUserById", () => {
    it("returns user without password", async () => {
      mockDb.where.mockResolvedValueOnce([
        {
          id: 1,
          email: "test@example.com",
          passwordHash: "hashed-password",
          displayName: "Test",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await getUserById(1);
      expect(result).toHaveProperty("id", 1);
      expect(result).not.toHaveProperty("passwordHash");
    });

    it("returns null when user not found", async () => {
      mockDb.where.mockResolvedValueOnce([]);

      const result = await getUserById(999);
      expect(result).toBeNull();
    });
  });
});
