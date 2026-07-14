import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

const serverExternalPackages = [
  'pg',
  'bullmq',
  'ioredis',
  'drizzle-orm',
  'better-auth',
  '@better-auth/drizzle-adapter',
  '@getworkbench/core',
  '@getworkbench/tanstack-start',
]

const serverExternalPatterns = [
  /^pg($|\/)/,
  /^bullmq($|\/)/,
  /^ioredis($|\/)/,
  /^drizzle-orm($|\/)/,
  /^better-auth($|\/)/,
  /^@better-auth($|\/)/,
  /^@getworkbench($|\/)/,
]

const config = defineConfig(({ command }) => ({
  resolve: { tsconfigPaths: true },
  optimizeDeps: { exclude: serverExternalPackages },
  ssr: { external: serverExternalPackages },
  plugins: [
    command === 'build'
      ? nitro({
          rollupConfig: { external: [/^@sentry\//, ...serverExternalPatterns] },
        })
      : undefined,
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
}))

export default config
