import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      // Mirrors the "~*" -> "src/*" path mapping Plasmo sets up in tsconfig.
      '~': path.resolve(__dirname, 'src')
    }
  },
  test: {
    // `node` is ~50x faster to boot than jsdom and everything under src/core is
    // DOM-free. Component tests opt in with a `// @vitest-environment jsdom`
    // docblock at the top of the file.
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/core/**/*.ts'],
      exclude: ['src/core/**/*.d.ts']
    }
  }
})
