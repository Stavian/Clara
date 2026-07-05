#!/usr/bin/env node
import { buildCLI } from './cli/run-main.js'

const program = buildCLI()

program.parseAsync(process.argv).catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
