import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["__tests__/**/*.test.ts"],

    // 기본 5초는 이 저장소에 짧다.
    //
    // 테스트 26개가 await import() 로 무거운 모듈(lib/grading, 라우트
    // 핸들러)을 끌어온다. 워커가 붐빌 때 그 해석이 5초를 넘겨서, 로직은
    // 멀쩡한데 Test timed out 으로 죽는다. 6회 돌리면 1회꼴로 났다.
    //
    // 개별 테스트에 인자를 다는 대신 여기서 올린다 - 26곳에 흩어 두면
    // 새 테스트가 또 같은 함정을 밟는다.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // Supabase auth mock for tests — prevents SSR cookie/header deps
      "@/lib/supabase-auth": path.resolve(
        __dirname,
        "lib/testing/supabase-auth-mock.ts"
      ),
    },
  },
});
