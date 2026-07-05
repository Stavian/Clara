import type { Tool } from '../registry.js'

export class WebFetchTool implements Tool {
  readonly name = 'web_fetch'
  readonly description = 'Laedt den Inhalt einer Webseite herunter und gibt ihn als Text zurueck.'
  readonly parameters = {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Die URL der Webseite' },
      max_length: { type: 'integer', description: 'Maximale Zeichenanzahl des Inhalts (Standard: 8000)' },
    },
    required: ['url'],
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const url = String(args.url ?? '')
    const maxLength = Number(args.max_length ?? 8000)

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return `Fehler: Ungueltige URL '${url}' - muss mit http:// oder https:// beginnen`
    }

    try {
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,text/plain',
        },
        signal: AbortSignal.timeout(15_000),
      })

      if (!resp.ok) return `HTTP Fehler: ${resp.status} ${resp.statusText}`

      const contentType = resp.headers.get('content-type') ?? ''
      const text = await resp.text()

      let content: string
      if (contentType.includes('text/html')) {
        content = this._stripHtml(text)
      } else {
        content = text
      }

      content = content.replace(/\n{3,}/g, '\n\n').trim()
      if (content.length > maxLength) {
        content = content.slice(0, maxLength) + '\n... (gekuerzt)'
      }

      return `Inhalt von ${url}:\n\n${content}`
    } catch (err) {
      return `Fehler beim Laden von ${url}: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  private _stripHtml(html: string): string {
    // Remove scripts, styles, comments
    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n')
      .replace(/<[^>]+>/g, '')

    // Decode common HTML entities
    text = text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')

    return text
  }
}
