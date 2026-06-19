/**
 * ACT II — "The Descent" — all copy in one place.
 * This is the long-form, scroll-driven world that lives vertically BELOW the
 * Act I immersive hero. Act I is never touched; this is purely additive.
 *
 * Voice: confident, specific, slightly cinematic — what Hanflux AI actually
 * does (Claude skills + agents, n8n workflow automation, realtime voice AI).
 */

export const ACT2 = {
  // The threshold between Act I and Act II
  threshold: {
    kicker: 'BELOW THE SIGNAL',
    title: ['WHAT', 'WE BUILD'],
    sub: 'You just met the surface. Keep descending — this is the machinery underneath: the agents, the automations, and the voices we wire into living systems.',
    cue: 'scroll to descend',
  },

  // The floating glass constellation — the capabilities, deeper than Act I
  arsenal: {
    kicker: 'THE ARSENAL',
    title: 'Six instruments. One autonomous layer.',
    sub: 'Each is a glass module in the same machine — composable, observable, and always on.',
  },

  // The capability cards rendered as floating glass in 3D
  capabilities: [
    {
      id: 'voice',
      no: '01',
      tag: 'REALTIME VOICE',
      title: 'AI Voice Agents',
      blurb:
        'Human-grade voice that answers, qualifies, books and follows up — 24/7, in any language, at sub-second latency. Indistinguishable from your best rep.',
      bullets: ['Inbound + outbound calling', 'Natural turn-taking & barge-in', 'Calendar, CRM & payment actions'],
      a: '#27F2C0',
      b: '#0c5c5a',
    },
    {
      id: 'automation',
      no: '02',
      tag: 'ORCHESTRATION',
      title: 'Workflow Automation',
      blurb:
        'n8n-grade pipelines that wire your entire stack into one nervous system — triggers, branching logic, retries and self-healing. The work runs itself.',
      bullets: ['500+ app connectors', 'Event & schedule triggers', 'Human-in-the-loop checkpoints'],
      a: '#7C5CFF',
      b: '#241a4d',
    },
    {
      id: 'skills',
      no: '03',
      tag: 'CLAUDE SKILLS · MCP',
      title: 'Agents & Skills',
      blurb:
        'Bespoke Claude skills and MCP-connected agents that read your tools, reason over your data, and take action — intelligence shaped to your exact workflow.',
      bullets: ['Custom skills & tool use', 'MCP server integrations', 'RAG over your knowledge'],
      a: '#FF3D7F',
      b: '#4d1029',
    },
    {
      id: 'inbound',
      no: '04',
      tag: 'INBOUND',
      title: 'AI Receptionist',
      blurb:
        'Every call, chat and form answered instantly, routed intelligently and logged automatically. Never a missed lead, never a closed door.',
      bullets: ['Instant pickup, zero hold', 'Smart routing & triage', 'Full transcript + summary'],
      a: '#27F2C0',
      b: '#1a3a4d',
    },
    {
      id: 'outbound',
      no: '05',
      tag: 'GROWTH',
      title: 'Outbound Engine',
      blurb:
        'Autonomous research, outreach and nurture that scales pipeline without scaling headcount. It prospects while you sleep and hands you warm replies.',
      bullets: ['Account & contact research', 'Personalised sequences', 'Reply detection & booking'],
      a: '#7C5CFF',
      b: '#0c2b4d',
    },
    {
      id: 'cortex',
      no: '06',
      tag: 'ANALYTICS',
      title: 'Insight Cortex',
      blurb:
        'Every call, flow and conversion captured and understood in real time — the signal beneath the automation, turned into decisions.',
      bullets: ['Live dashboards', 'Call & funnel analytics', 'Anomaly + opportunity alerts'],
      a: '#FF3D7F',
      b: '#3a1a4d',
    },
  ],

  // The living loop — how the system works
  loop: {
    kicker: 'THE LIVING LOOP',
    title: 'It listens, understands, acts — then gets sharper.',
    steps: [
      {
        no: '01',
        title: 'Listen',
        body: 'Calls, messages, forms, webhooks and events stream in across every channel you run.',
      },
      {
        no: '02',
        title: 'Understand',
        body: 'Claude reasons over context, intent and your knowledge base to decide what actually matters.',
      },
      {
        no: '03',
        title: 'Act',
        body: 'Agents book, reply, update, escalate and orchestrate tools through n8n — end to end.',
      },
      {
        no: '04',
        title: 'Learn',
        body: 'Every outcome is logged and fed back, so the system compounds instead of standing still.',
      },
    ],
  },

  // The stack we wield — honest credibility
  stack: {
    kicker: 'THE STACK WE WIELD',
    title: 'Best-in-class parts, welded into one machine.',
    groups: [
      { label: 'Intelligence', items: ['Claude Opus', 'Claude Sonnet', 'Claude Haiku', 'Custom Skills', 'MCP'] },
      { label: 'Automation', items: ['n8n', 'Webhooks', 'Schedulers', 'Queues', 'Zapier bridge'] },
      { label: 'Voice', items: ['Realtime STT/TTS', 'Telephony (SIP)', 'Barge-in', 'Multilingual'] },
      { label: 'Memory', items: ['Vector DB / RAG', 'Postgres', 'Knowledge bases'] },
      { label: 'Surfaces', items: ['Web', 'WhatsApp', 'Email', 'Slack', 'CRM'] },
    ],
  },

  // Proof / outcome metrics
  metrics: [
    { v: '24/7', l: 'always-on agents' },
    { v: '<1s', l: 'voice response latency' },
    { v: '500+', l: 'integrations wired' },
    { v: '∞', l: 'concurrent conversations' },
  ],

  // Final CTA
  cta: {
    kicker: 'THE SURFACE WAS THE INTRO',
    title: ['Let’s build your', 'autonomous layer.'],
    body: 'Tell us the work you keep doing by hand. We’ll wire the agents, the automations and the voice that make it run itself.',
    email: 'hello@hanflux.ai',
    button: 'Start the build',
  },
}

export type Capability2 = (typeof ACT2.capabilities)[number]
