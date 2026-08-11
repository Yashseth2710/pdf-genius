import react from '@vitejs/plugin-react-swc'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // SWC compiles JSX without Babel, which conflicts with the toolchain here.
  plugins: [react()],
  // Resolves the "@/*" alias straight from tsconfig.json - Vite does this
  // natively now, so no vite-tsconfig-paths plugin is needed.
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // Unit tests are *.test.tsx; Playwright's end-to-end specs are *.spec.ts
    // under e2e/ and must not be picked up by Vitest.
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**', '.next/**', 'e2e/**'],
  },
})
