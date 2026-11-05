import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/coverage/**", "apps/web/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      // Nest 모듈은 데코레이터만 있는 빈 클래스가 정상이다
      "@typescript-eslint/no-extraneous-class": ["error", { allowWithDecorator: true }],
    },
  },
  prettier,
);
