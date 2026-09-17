import { defineConfig } from "vitest/config";

// Tests run in Node: everything under test here is server-side (socket auth,
// guards, ID generation). Add a jsdom project later if component tests appear.
// `.mts` so the ESM syntax below is loaded as ESM.
export default defineConfig({
  // Resolves the `@/*` -> `src/*` alias from tsconfig.json natively, so no
  // extra plugin is needed.
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
