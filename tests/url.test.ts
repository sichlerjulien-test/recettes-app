import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockHeadersGet = vi.fn();
vi.mock("next/headers", () => ({
  headers: () => Promise.resolve({ get: mockHeadersGet }),
}));

import { getSiteUrl } from "@/lib/url";

describe("getSiteUrl", () => {
  const originalEnv = process.env.NEXT_PUBLIC_SITE_URL;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = originalEnv;
    }
    mockHeadersGet.mockReset();
  });

  it("retourne NEXT_PUBLIC_SITE_URL quand défini", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://recettes.example.com";
    expect(await getSiteUrl()).toBe("https://recettes.example.com");
  });

  it("utilise le header Host en fallback quand NEXT_PUBLIC_SITE_URL absent", async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    mockHeadersGet.mockImplementation((key: string) => {
      if (key === "host") return "mon-app.vercel.app";
      if (key === "x-forwarded-proto") return "https";
      return null;
    });
    expect(await getSiteUrl()).toBe("https://mon-app.vercel.app");
  });

  it("ne retourne jamais undefined ou la chaîne 'undefined'", async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    mockHeadersGet.mockReturnValue(null);
    const result = await getSiteUrl();
    expect(result).not.toContain("undefined");
    expect(result.startsWith("http")).toBe(true);
  });
});
