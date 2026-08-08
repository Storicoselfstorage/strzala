import { defineConfig } from 'vitest/config';

// core nie dotyka DOM — środowisko node; e2e (playwright) poza vitestem
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
