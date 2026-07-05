import type { Tool, ToolContext } from '../registry.js'

export class WebBrowseTool implements Tool {
  readonly name = 'web_browse'
  readonly description = 'Sucht im Internet nach Informationen mit DuckDuckGo.'
  readonly parameters = {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Der Suchbegriff' },
      max_results: { type: 'integer', description: 'Maximale Anzahl der Ergebnisse (Standard: 5)' },
    },
    required: ['query'],
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const query = String(args.query ?? '')
    const maxResults = Number(args.max_results ?? 5)

    try {
      // DuckDuckGo Instant Answer API (limited but no scraping)
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Clara/2.0 (local AI assistant)' },
        signal: AbortSignal.timeout(15_000),
      })

      if (!resp.ok) {
        return `Websuche fehlgeschlagen: HTTP ${resp.status}`
      }

      const data = await resp.json() as {
        AbstractText?: string
        AbstractSource?: string
        AbstractURL?: string
        RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>
        Results?: Array<{ Text?: string; FirstURL?: string }>
      }

      const results: string[] = []

      if (data.AbstractText) {
        results.push(`**${data.AbstractSource ?? 'Wikipedia'}**\n${data.AbstractText}\nURL: ${data.AbstractURL ?? ''}`)
      }

      const topics = [...(data.Results ?? []), ...(data.RelatedTopics ?? [])]
      for (const topic of topics.slice(0, maxResults)) {
        if (topic.Text && topic.FirstURL) {
          results.push(`**${topic.Text.split(' - ')[0]}**\n${topic.Text}\nURL: ${topic.FirstURL}`)
        }
      }

      if (!results.length) {
        // Fallback: try HTML search
        return await this._htmlSearch(query, maxResults)
      }

      return results.slice(0, maxResults).join('\n\n')
    } catch (err) {
      return `Fehler bei der Websuche: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  private async _htmlSearch(query: string, maxResults: number): Promise<string> {
    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html',
        },
        signal: AbortSignal.timeout(15_000),
      })

      if (!resp.ok) return `Keine Ergebnisse fuer '${query}' gefunden.`

      const html = await resp.text()

      // Extract results from DuckDuckGo HTML
      const results: string[] = []
      const resultRe = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
      const snippetRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi

      const titles: Array<[string, string]> = []
      let m: RegExpExecArray | null
      resultRe.lastIndex = 0
      while ((m = resultRe.exec(html)) !== null && titles.length < maxResults) {
        const href = m[1].replace(/\/\/duckduckgo\.com\/l\/\?uddg=/, '')
        const title = m[2].replace(/<[^>]+>/g, '').trim()
        titles.push([decodeURIComponent(href), title])
      }

      const snippets: string[] = []
      snippetRe.lastIndex = 0
      while ((m = snippetRe.exec(html)) !== null && snippets.length < maxResults) {
        snippets.push(m[1].replace(/<[^>]+>/g, '').trim())
      }

      for (let i = 0; i < titles.length; i++) {
        const [url, title] = titles[i]
        const snippet = snippets[i] ?? ''
        results.push(`${i + 1}. **${title}**\n   ${snippet}\n   URL: ${url}`)
      }

      return results.length ? results.join('\n\n') : `Keine Ergebnisse fuer '${query}' gefunden.`
    } catch {
      return `Keine Ergebnisse fuer '${query}' gefunden.`
    }
  }
}
