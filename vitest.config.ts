import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The parser is intentionally unimplemented in the scaffold; don't fail the
    // suite just because no tests exist yet.
    passWithNoTests: true,
  },
});
