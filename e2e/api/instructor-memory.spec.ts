import { test, expect } from "../fixtures/auth.fixture";

const MEMORY_ROUTE = "/api/instructor/memory";

test.describe("instructor memory API", () => {
  test("unauthenticated list is rejected", async ({ anonRequest }) => {
    const response = await anonRequest.get(MEMORY_ROUTE);
    expect(response.status()).toBe(401);
  });

  test("student list is rejected", async ({ studentRequest }) => {
    const response = await studentRequest.get(MEMORY_ROUTE);
    expect(response.status()).toBe(403);
  });

  test("invalid memory id is rejected before storage access", async ({ instructorRequest }) => {
    const response = await instructorRequest.delete(`${MEMORY_ROUTE}/not-a-uuid`);
    expect(response.status()).toBe(400);
  });

  test("malformed settings actions are rejected", async ({ instructorRequest }) => {
    const responses = await Promise.all([
      instructorRequest.patch(`${MEMORY_ROUTE}/settings`, { data: {} }),
      instructorRequest.patch(`${MEMORY_ROUTE}/settings`, { data: { action: 1 } }),
      instructorRequest.patch(`${MEMORY_ROUTE}/settings`, { data: { action: "disable" } }),
    ]);

    expect(responses.map((response) => response.status())).toEqual([400, 400, 400]);
  });
});
