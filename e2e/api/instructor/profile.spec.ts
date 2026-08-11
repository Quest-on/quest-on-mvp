import { test, expect } from "../../fixtures/auth.fixture";
import { getTestSupabase } from "../../helpers/supabase-test-client";

const supabase = getTestSupabase();

async function cleanupInstructorProfiles() {
  await supabase
    .from("instructor_profiles")
    .delete()
    .in("id", ["test-instructor-id"]);
}

test.describe("POST /api/instructor/profile", () => {
  test.afterEach(async () => {
    await cleanupInstructorProfiles();
  });

  test("instructor creates profile → 200", async ({ instructorRequest }) => {
    const res = await instructorRequest.post("/api/instructor/profile", {
      data: {
        name: "Prof. Kim",
        email: "prof.kim@university.kr",
        school: "Seoul National University",
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.created).toBe(true);

    // Verify profile exists in DB
    const { data } = await supabase
      .from("instructor_profiles")
      .select("*")
      .eq("id", "test-instructor-id")
      .single();

    expect(data).toBeTruthy();
    expect(data.name).toBe("Prof. Kim");
    expect(data.email).toBe("prof.kim@university.kr");
    expect(data.school).toBe("Seoul National University");
    // 승인 대기 개념을 없앴다(에픽 #79 P0). 교수자는 가입 즉시 활동하고,
    // 미인증 계정 제어는 status 가 아니라 plan_limits 의 무료 한도가 맡는다.
    expect(data.status).toBe("approved");
  });

  test("instructor upserts existing profile → 200", async ({
    instructorRequest,
  }) => {
    // Create initial profile
    await instructorRequest.post("/api/instructor/profile", {
      data: {
        name: "Old Name",
        email: "old@university.kr",
        school: "Old School",
      },
    });

    // Update via second POST
    const res = await instructorRequest.post("/api/instructor/profile", {
      data: {
        name: "New Name",
        email: "new@university.kr",
        school: "New School",
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify updated values
    const { data } = await supabase
      .from("instructor_profiles")
      .select("*")
      .eq("id", "test-instructor-id")
      .single();

    expect(data.name).toBe("New Name");
    expect(data.email).toBe("new@university.kr");
  });

  test("unauthenticated request → 401", async ({ anonRequest }) => {
    const res = await anonRequest.post("/api/instructor/profile", {
      data: { name: "Anon", email: "anon@test.com" },
    });

    expect(res.status()).toBe(401);
  });

  test("empty name defaults to empty string (no 400)", async ({
    instructorRequest,
  }) => {
    const res = await instructorRequest.post("/api/instructor/profile", {
      data: { name: "", email: "test@school.kr" },
    });

    // Route uses '' as default — should succeed
    expect(res.status()).toBe(200);
  });
});
