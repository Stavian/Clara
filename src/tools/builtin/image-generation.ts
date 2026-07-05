import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import type { Tool } from '../registry.js'

export class ImageGenerationTool implements Tool {
  readonly name = 'image_generation'
  readonly description = 'Generiert Bilder mit Stable Diffusion Forge. Prompt MUSS auf Englisch sein.'
  readonly parameters = {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'Englischer Bildprompt (detailliert und spezifisch)' },
    },
    required: ['prompt'],
  }

  constructor(
    private readonly sdApiUrl: string,
    private readonly outputDir: string,
  ) {
    mkdirSync(outputDir, { recursive: true })
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const basePrompt = String(args.prompt ?? '').trim()
    if (!basePrompt) return 'Fehler: Kein Prompt angegeben.'

    // Add European ethnicity hints as the Python code does
    const prompt = `${basePrompt}, european features`
    const negativePrompt = 'asian features, east asian, chinese, japanese, korean, text, watermark, blurry, low quality'

    try {
      const payload = {
        prompt,
        negative_prompt: negativePrompt,
        steps: 20,
        cfg_scale: 7,
        width: 512,
        height: 512,
        sampler_name: 'DPM++ 2M',
      }

      const resp = await fetch(`${this.sdApiUrl}/sdapi/v1/txt2img`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(120_000),
      })

      if (!resp.ok) {
        return `Bildgenerierung fehlgeschlagen: HTTP ${resp.status}`
      }

      const data = await resp.json() as { images?: string[] }
      const imageBase64 = data.images?.[0]
      if (!imageBase64) return 'Fehler: Kein Bild in der Antwort.'

      const filename = `generated_${Date.now()}.png`
      const filepath = path.join(this.outputDir, filename)
      writeFileSync(filepath, Buffer.from(imageBase64, 'base64'))

      return `![Generiertes Bild](/generated/${filename})`
    } catch (err) {
      return `Fehler bei der Bildgenerierung: ${err instanceof Error ? err.message : String(err)}`
    }
  }
}
