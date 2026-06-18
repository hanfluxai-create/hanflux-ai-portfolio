/**
 * ALL brand + copy lives here — single editable source of truth.
 * Swap in real projects, images, and links without touching components.
 * (3D/visual tunables live separately in ./config.ts)
 */

export const BRAND = {
  name: 'Hanflux AI',
  wordmark: 'HANFLUX', // the "°" signal-mark is appended by the UI
  tagline: 'The ultimate workflow automation & AI voice-agent ecosystem.',
  intro:
    'Autonomous voice agents and end-to-end workflow automation, woven into one living system that answers, acts, and scales while you sleep.',
  vibeWords: ['autonomous', 'neural', 'fluid', 'futuristic', 'intelligent'],
  contact: {
    email: 'hello@hanflux.ai',
    socials: [
      { label: 'X', href: 'https://x.com/' },
      { label: 'LinkedIn', href: 'https://linkedin.com/' },
      { label: 'GitHub', href: 'https://github.com/hanfluxai-create' },
    ],
  },
}

export interface Capability {
  id: string
  title: string
  kicker: string // short category label
  description: string
  role: string
  year: string
  href: string
  // procedural gradient used until a real image is supplied (image?: string overrides)
  colorA: string
  colorB: string
  image?: string
}

/**
 * The 3D carousel "screens". For Hanflux these are capability showcases.
 * Replace with real case studies + `image` URLs when ready.
 */
export const CAPABILITIES: Capability[] = [
  {
    id: 'voice-agents',
    title: 'AI Voice Agents',
    kicker: 'Voice AI',
    description:
      'Lifelike voice agents that answer, qualify, and book — 24/7, in any language, indistinguishable from your best rep.',
    role: 'Realtime Voice',
    year: '2026',
    href: '#',
    colorA: '#27f2c0',
    colorB: '#0c5c5a',
  },
  {
    id: 'workflow-automation',
    title: 'Workflow Automation',
    kicker: 'Orchestration',
    description:
      'n8n-grade pipelines that wire your entire stack into one autonomous nervous system — triggers, logic, and action.',
    role: 'Automation',
    year: '2026',
    href: '#',
    colorA: '#7c5cff',
    colorB: '#241a4d',
  },
  {
    id: 'ai-receptionist',
    title: 'AI Receptionist',
    kicker: 'Inbound',
    description:
      'Every inbound call answered instantly, routed intelligently, and logged — never a missed lead again.',
    role: 'Inbound AI',
    year: '2026',
    href: '#',
    colorA: '#ff3d7f',
    colorB: '#4d1029',
  },
  {
    id: 'outbound-engine',
    title: 'Outbound Engine',
    kicker: 'Growth',
    description:
      'Autonomous outreach, follow-up, and nurture that scales pipeline without scaling headcount.',
    role: 'Outbound AI',
    year: '2026',
    href: '#',
    colorA: '#27f2c0',
    colorB: '#1a3a4d',
  },
  {
    id: 'integration-fabric',
    title: 'Integration Fabric',
    kicker: 'Connectivity',
    description:
      '500+ connectors. One brain. Your tools, data, and channels finally speaking the same language.',
    role: 'Platform',
    year: '2026',
    href: '#',
    colorA: '#7c5cff',
    colorB: '#0c2b4d',
  },
  {
    id: 'insight-cortex',
    title: 'Insight Cortex',
    kicker: 'Analytics',
    description:
      'Real-time analytics across every call, flow, and conversion — the signal beneath the automation.',
    role: 'Analytics',
    year: '2026',
    href: '#',
    colorA: '#ff3d7f',
    colorB: '#3a1a4d',
  },
]

export const ABOUT = {
  heading: 'We build the autonomous layer of your business.',
  body: [
    'Hanflux AI fuses human-grade voice agents with deep workflow automation into a single, self-operating ecosystem.',
    'From the first ring to the final follow-up, every interaction is captured, understood, and acted on — at machine speed, with human warmth.',
  ],
  stats: [
    { value: '24/7', label: 'always-on agents' },
    { value: '500+', label: 'integrations' },
    { value: '<1s', label: 'response latency' },
  ],
}

// Chat-nav quick replies map to these (intent routing fills in Phase 3).
export const CHAT_CHIPS = [
  'Work',
  'About',
  'Services',
  'Contact',
  'Voice Agents',
  'Workflow Automation',
  'Integrations',
]
