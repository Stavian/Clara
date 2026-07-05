import type { Tool } from '../registry.js'

export class CalculatorTool implements Tool {
  readonly name = 'calculator'
  readonly description = 'Fuehrt mathematische Berechnungen aus.'
  readonly parameters = {
    type: 'object',
    properties: {
      expression: { type: 'string', description: 'Der mathematische Ausdruck (z.B. "2 + 3 * 4" oder "sqrt(16)")' },
    },
    required: ['expression'],
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const expression = String(args.expression ?? '').trim()
    if (!expression) return 'Fehler: Kein Ausdruck angegeben.'

    try {
      const result = this._evaluate(expression)
      return `${expression} = ${result}`
    } catch (err) {
      return `Berechnungsfehler: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  private _evaluate(expr: string): number | string {
    // Safe math evaluator using Function with restricted context
    const sanitized = expr
      .replace(/\bsqrt\b/g, 'Math.sqrt')
      .replace(/\babs\b/g, 'Math.abs')
      .replace(/\bfloor\b/g, 'Math.floor')
      .replace(/\bceil\b/g, 'Math.ceil')
      .replace(/\bround\b/g, 'Math.round')
      .replace(/\bsin\b/g, 'Math.sin')
      .replace(/\bcos\b/g, 'Math.cos')
      .replace(/\btan\b/g, 'Math.tan')
      .replace(/\blog\b/g, 'Math.log')
      .replace(/\bpow\b/g, 'Math.pow')
      .replace(/\bPI\b/g, 'Math.PI')
      .replace(/\bE\b/g, 'Math.E')
      .replace(/\bmax\b/g, 'Math.max')
      .replace(/\bmin\b/g, 'Math.min')
      .replace(/\^\^/g, '**')
      .replace(/\^/g, '**')

    // Security: only allow numbers, operators, math functions
    if (/[^0-9+\-*/.(),%\s\w]/.test(sanitized) || /[a-zA-Z]+/.test(sanitized.replace(/Math\.\w+/g, ''))) {
      throw new Error('Ungueltige Zeichen im Ausdruck')
    }

    // eslint-disable-next-line no-new-func
    const result = new Function('Math', `"use strict"; return (${sanitized})`)(Math) as unknown
    if (typeof result !== 'number') throw new Error('Ungueltige Berechnung')
    if (!isFinite(result)) throw new Error('Ergebnis ist nicht endlich (Division durch 0?)')
    return result
  }
}
