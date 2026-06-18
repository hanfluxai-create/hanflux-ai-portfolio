import type { Section } from '../store/store'

export interface IntentResult {
  section: Section
  confidence: number // 0..1
  source: 'keyword' | 'llm' | 'fallback'
}

export const SECTIONS: Section[] = ['intro', 'work', 'about', 'services', 'contact']

const KEYWORD_MAP: Record<Section, string[]> = {
  intro: ['home', 'start', 'intro', 'beginning', 'top', 'hello', 'hi', 'hey'],
  work: ['work', 'projects', 'portfolio', 'case study', 'case studies', 'showcase', 'clients', 'examples', 'demo work'],
  about: ['about', 'who', 'team', 'story', 'mission', 'company', 'studio', 'background'],
  services: [
    'service', 'services', 'offer', 'offering', 'what do you do', 'capabilit', 'solutions', 'pricing',
    'voice', 'voice agent', 'voice agents', 'phone', 'call', 'speech', 'receptionist',
    'workflow', 'workflow automation', 'automation', 'automate', 'n8n', 'pipeline',
    'integration', 'integrations', 'integrate', 'api', 'connect', 'crm', 'webhook',
  ],
  contact: ['contact', 'reach', 'email', 'get in touch', 'hire', 'book', 'call you', 'talk', 'quote', 'sales'],
}

const normalize = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()

/** Pure, synchronous, never throws — the always-on default router. */
export function resolveIntent(text: string): IntentResult {
  const q = normalize(text)
  if (!q) return { section: 'intro', confidence: 0, source: 'fallback' }

  let best: Section = 'work'
  let bestScore = 0
  for (const section of SECTIONS) {
    let score = 0
    for (const phrase of KEYWORD_MAP[section]) {
      if (q.includes(phrase)) score += phrase.includes(' ') ? 2 : 1
    }
    if (score > bestScore) {
      bestScore = score
      best = section
    }
  }

  if (bestScore === 0) return { section: 'work', confidence: 0, source: 'fallback' }
  const confidence = Math.min(1, 0.5 + bestScore * 0.18)
  return { section: best, confidence, source: 'keyword' }
}

/**
 * OPTIONAL LLM classifier. Default OFF. Never throws, never crashes w/o key.
 * @ai-sdk/anthropic does NOT auto-add the dangerous browser header, so a direct
 * client call is CORS-blocked unless you opt in. SAFE pattern: VITE_LLM_PROXY_URL
 * -> a serverless route that holds the real key. Direct VITE_ANTHROPIC_API_KEY
 * is demo-only and exposes the key in the client bundle.
 */
export async function classifyIntentLLM(text: string): Promise<IntentResult> {
  const fallback = resolveIntent(text)
  try {
    if (import.meta.env.VITE_ENABLE_LLM_INTENT !== 'true') return fallback
    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined
    const proxyURL = import.meta.env.VITE_LLM_PROXY_URL as string | undefined
    if (!apiKey && !proxyURL) return fallback // graceful no-key fallback

    const { generateObject } = await import('ai')
    const { createAnthropic } = await import('@ai-sdk/anthropic')

    const anthropic = createAnthropic({
      ...(proxyURL ? { baseURL: proxyURL } : {}),
      ...(apiKey ? { apiKey, headers: { 'anthropic-dangerous-direct-browser-access': 'true' } } : {}),
    })

    const { object } = await generateObject({
      model: anthropic('claude-haiku-4-5'),
      output: 'enum',
      enum: SECTIONS, // string[] only — no zod required in enum mode
      system:
        'You route a visitor query for an AI automation agency portfolio to ONE section. ' +
        'services = voice agents, workflow automation, integrations. ' +
        'Reply with exactly one of the allowed values.',
      prompt: text,
      temperature: 0,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(4000),
    })

    return { section: object as Section, confidence: 0.9, source: 'llm' }
  } catch {
    return fallback // never throws
  }
}
