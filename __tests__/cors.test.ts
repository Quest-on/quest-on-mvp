import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { getCorsHeaders, handleCorsPreFlight } from "../lib/cors";

function makeRequest(origin: string | null, method = "POST"): NextRequest {
  const headers: Record<string, string> = {};
  if (origin !== null) headers["origin"] = origin;
  return new NextRequest("http://localhost:3000/api/test", { method, headers });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getCorsHeaders", () => {
  it("returns CORS headers for an allowed production origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOWED_ORIGINS", "");

    const req = makeRequest("https://quest-on.app");
    const headers = getCorsHeaders(req);

    expect(headers["Access-Control-Allow-Origin"]).toBe("https://quest-on.app");
    expect(headers["Access-Control-Allow-Methods"]).toContain("POST");
    expect(headers["Vary"]).toBe("Origin");
  });

  it("rejects localhost origins under the production fallback", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOWED_ORIGINS", "");

    for (const origin of ["http://localhost:3000", "http://localhost:3001"]) {
      expect(Object.keys(getCorsHeaders(makeRequest(origin)))).toHaveLength(0);
    }
  });

  it("rejects domains the project does not own under the production fallback", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOWED_ORIGINS", "");

    for (const origin of ["https://quest-on.kr", "https://www.quest-on.kr"]) {
      expect(Object.keys(getCorsHeaders(makeRequest(origin)))).toHaveLength(0);
    }
  });

  it("returns empty object for disallowed origin in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOWED_ORIGINS", "");

    const req = makeRequest("https://evil.example.com");
    const headers = getCorsHeaders(req);

    expect(Object.keys(headers)).toHaveLength(0);
  });

  it("returns empty object when origin header is absent", () => {
    vi.stubEnv("NODE_ENV", "production");

    const req = makeRequest(null);
    const headers = getCorsHeaders(req);

    expect(Object.keys(headers)).toHaveLength(0);
  });

  it("allows any origin in development mode", () => {
    vi.stubEnv("NODE_ENV", "development");

    const req = makeRequest("https://anything.example.com");
    const headers = getCorsHeaders(req);

    expect(headers["Access-Control-Allow-Origin"]).toBe(
      "https://anything.example.com"
    );
  });

  it("uses ALLOWED_ORIGINS env var when set, overriding defaults", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(
      "ALLOWED_ORIGINS",
      "https://custom-app.example.com,https://other.example.com"
    );

    const allowedHeaders = getCorsHeaders(makeRequest("https://custom-app.example.com"));
    expect(allowedHeaders["Access-Control-Allow-Origin"]).toBe(
      "https://custom-app.example.com"
    );

    // Default allowed origins are NOT in this custom list
    const blockedHeaders = getCorsHeaders(makeRequest("https://quest-on.app"));
    expect(Object.keys(blockedHeaders)).toHaveLength(0);
  });

  it("passes custom methods through to the header", () => {
    vi.stubEnv("NODE_ENV", "development");

    const headers = getCorsHeaders(makeRequest("http://localhost:3000"), "GET, POST, OPTIONS");

    expect(headers["Access-Control-Allow-Methods"]).toBe("GET, POST, OPTIONS");
  });

  it("sets Max-Age and Allow-Headers on valid origin", () => {
    vi.stubEnv("NODE_ENV", "development");

    const headers = getCorsHeaders(makeRequest("http://localhost:3000"));

    expect(headers["Access-Control-Max-Age"]).toBe("86400");
    expect(headers["Access-Control-Allow-Headers"]).toContain("Content-Type");
  });
});

describe("handleCorsPreFlight", () => {
  it("returns 204 with CORS headers for allowed origin", () => {
    vi.stubEnv("NODE_ENV", "development");

    const req = makeRequest("http://localhost:3000", "OPTIONS");
    const response = handleCorsPreFlight(req);

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3000"
    );
  });

  it("returns 204 with no CORS headers for disallowed origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOWED_ORIGINS", "");

    const req = makeRequest("https://evil.example.com", "OPTIONS");
    const response = handleCorsPreFlight(req);

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
