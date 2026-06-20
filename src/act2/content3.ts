/**
 * ACT III — "Signals Shipped" + "The Portal" — all copy in one place.
 * The closing movement of the descent: a work reel of representative builds,
 * then a full-screen portal CTA. Edit text/data here — no component edits needed.
 *
 * The projects are representative archetypes of what Hanflux AI ships (voice,
 * automation, skills/agents) — swap in real named case studies as they land.
 */

export const ACT3 = {
  reel: {
    kicker: 'SIGNALS SHIPPED',
    title: ['Systems we', 'set running.'],
    sub: 'A few of the autonomous layers we’ve wired into living businesses — each one still running while you read this.',
    cta: 'Every build is bespoke. Yours starts with a conversation.',
  },

  // Work tiles — rendered as shader hover-distortion planes in WebGL.
  // `tex` is an optional image URL (Higgsfield-generated or any asset); when
  // absent the tile renders a procedural field in its hue, so it never blanks.
  projects: [
    {
      id: 'switchboard',
      no: '01',
      title: 'Switchboard',
      sector: 'Multi-location services',
      blurb:
        'A voice receptionist that picks up every call in under a second, books into the calendar, and texts a recap — across 14 locations, in three languages.',
      metric: '0 missed calls',
      tags: ['Realtime voice', 'Calendar', 'Multilingual'],
      a: '#27f2c0',
      b: '#062a2a',
      tex: '/work/01.jpg' as string | null,
    },
    {
      id: 'nightshift',
      no: '02',
      title: 'Nightshift',
      sector: 'E-commerce ops',
      blurb:
        'An n8n nervous system that reconciles orders, flags fraud, answers tickets and restocks — the whole back office running itself between midnight and dawn.',
      metric: '92% auto-resolved',
      tags: ['Orchestration', '500+ connectors', 'Self-healing'],
      a: '#7c5cff',
      b: '#1a1147',
      tex: '/work/02.jpg' as string | null,
    },
    {
      id: 'cortex',
      no: '03',
      title: 'Cortex',
      sector: 'B2B SaaS',
      blurb:
        'A Claude skill that reads the entire knowledge base, reasons over live product data, and drafts answers your team approves in one click. RAG that actually lands.',
      metric: '6× faster replies',
      tags: ['Custom skills', 'MCP', 'RAG'],
      a: '#ff3d7f',
      b: '#3a0f24',
      tex: '/work/03.jpg' as string | null,
    },
    {
      id: 'prospector',
      no: '04',
      title: 'Prospector',
      sector: 'Growth',
      blurb:
        'Autonomous research and outreach that prospects while the team sleeps — personalised sequences, reply detection, and meetings booked straight onto the calendar.',
      metric: '3.1× pipeline',
      tags: ['Research', 'Sequences', 'Auto-booking'],
      a: '#27f2c0',
      b: '#0a2a3e',
      tex: '/work/04.jpg' as string | null,
    },
    {
      id: 'concierge',
      no: '05',
      title: 'Concierge',
      sector: 'Hospitality',
      blurb:
        'One agent across web chat, WhatsApp and phone — answering, upselling and routing the edge cases to a human with the full transcript already summarised.',
      metric: '24/7 coverage',
      tags: ['Omnichannel', 'Hand-off', 'Summaries'],
      a: '#7c5cff',
      b: '#11204d',
      tex: '/work/05.jpg' as string | null,
    },
    {
      id: 'observatory',
      no: '06',
      title: 'Observatory',
      sector: 'Analytics',
      blurb:
        'Every call, flow and conversion captured and understood in real time — live dashboards plus anomaly and opportunity alerts the moment the signal moves.',
      metric: 'real-time signal',
      tags: ['Dashboards', 'Funnel analytics', 'Alerts'],
      a: '#ff3d7f',
      b: '#3a1a4d',
      tex: '/work/06.jpg' as string | null,
    },
  ],

  // The scroll-driven "dive into the screen" — a Seedance hyperspace plunge
  // scrubbed by scroll, with kinetic words rushing past the viewer.
  dive: {
    kicker: 'CROSS THE THRESHOLD',
    words: ['DIVE', 'INTO', 'THE', 'MACHINE'],
    sub: 'past the surface — into the layer that runs itself',
    video: '/work/dive.mp4',
    poster: '/work/dive-poster.jpg',
  },

  portal: {
    kicker: 'THE DESCENT ENDS HERE',
    title: ['Step through.', 'Let’s build the', 'layer that runs', 'itself.'],
    body: 'Tell us the work you keep doing by hand. We’ll wire the agents, the automations and the voice that make it run without you.',
    button: 'Open the build',
    email: 'hello@hanflux.ai',
    socials: [
      { label: 'Email', href: 'mailto:hello@hanflux.ai' },
      { label: 'WhatsApp', href: 'https://wa.me/' },
      { label: 'X', href: 'https://x.com/' },
    ],
  },
}

export type Project = (typeof ACT3.projects)[number]
