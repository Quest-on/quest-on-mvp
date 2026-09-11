import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: [
      "playwright-report/**",
      "test-results/**",
      "coverage/**",
      "e2e/**",
      "__tests__/**",
      // 에이전트 런타임 디렉터리. gitignore 대상이라 CI 는 볼 일이 없지만,
      // 로컬 워킹트리에는 세션 산출물이 쌓인다. flat config 는 .gitignore 를
      // 읽지 않으므로 여기서 빼지 않으면 `npm run lint` 가 그 파일들까지 본다.
      //
      // 특히 .cjs 하나만 생겨도 lint 전체가 죽는다 — eslint-config-next 의
      // react 플러그인 블록이 **/*.{js,jsx,mjs,ts,tsx,mts,cts} 에만 적용돼서
      // .cjs 에는 react 네임스페이스가 없는데, 아래 rules 블록은 파일 제한이
      // 없어 react/no-unescaped-entities 를 모든 파일에 걸기 때문이다.
      ".gjc/**",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      "no-console": ["warn", { allow: ["error"] }],
      // Downgrade pre-existing errors to warnings (fix incrementally)
      "react/no-unescaped-entities": "warn",
      "prefer-const": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      // React compiler rules — downgrade until codebase is fully compatible
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
    },
  },
  {
    files: ["scripts/**"],
    rules: {
      "no-console": "off",
    },
  },
  {
    // CommonJS Node utility scripts (.js, run via `node scripts/*.js`);
    // package.json has no "type":"module", so require() is correct here.
    files: ["scripts/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["lib/logger.ts"],
    rules: {
      "no-console": "off",
    },
  },
];

export default eslintConfig;
