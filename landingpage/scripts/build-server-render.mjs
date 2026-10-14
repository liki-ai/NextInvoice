// Builds the invoice templates and texts into one plain Node file for the API server, so the server
// prints the same invoice the web app shows. Run by `npm run build`; the result is committed, and
// both copies of the server get the identical file.

import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rolldown } from 'rolldown'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// The invoice page and texts, and the spreadsheet and bank-statement readers for the finance inbox.
const entries = [
  ['src/lib/serverRender.ts', 'invoiceRender.js'],
  ['src/lib/serverFinance.ts', 'finance.js'],
]

for (const [input, output] of entries) {
  const targets = ['../server/src/generated/', '../faturimiapp/server/src/generated/'].map((dir) => resolve(root, dir, output))
  const bundle = await rolldown({ input: resolve(root, input), platform: 'node', logLevel: 'warn' })
  await bundle.write({
    file: targets[0],
    format: 'cjs',
    banner: `// Generated from landingpage/${input} by landingpage/scripts/build-server-render.mjs. Do not edit.`,
  })
  await bundle.close()
  for (const target of targets.slice(1)) {
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(targets[0], target)
  }
  console.log(`${output} → ${targets.length} copies`)
}
