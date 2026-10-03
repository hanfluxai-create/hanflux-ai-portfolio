/**
 * ACT II · "THE LATTICE" · all copy in one place.
 * A forward flight through a living Matrix: divisions, proof, process, and
 * pricing. Each section is a station the camera flies to. Edit text/data
 * here, no component edits needed.
 *
 * Voice: confident, specific, anti-hype. Grounded in 2026 market research:
 *  · MIT "GenAI Divide": 95% of enterprise AI pilots never touch P&L; externally
 *    built systems reach production 2× as often (67% vs 33%).
 *  · Gartner: >40% of agentic AI projects will be cancelled by end-2027 —
 *    de-risking is the product.
 *  · None of the leading agencies publish pricing; transparent fixed-fee tiers
 *    are an open trust wedge. Post-deployment reliability ops ("SRE for AI")
 *    is unclaimed flagship territory. This copy takes both positions.
 *
 * House style: no en/em dashes anywhere in rendered strings. Use periods,
 * commas, or colons instead.
 */

export const ACT2 = {
  // The threshold between Act I and Act II: the uplink into the Lattice
  threshold: {
    kicker: 'you are entering the lattice',
    title: ['ONE MACHINE.', 'EVERY WORKFLOW.'],
    sub: 'This is where AI stops being a demo. Voice, agents, orchestration, memory, growth, and the ops layer that keeps it all alive after launch. Keep scrolling to fly in.',
    boot: [
      'opening uplink to hanflux',
      'six divisions online',
      'evals passing, humans on the loop',
      'scroll to fly in',
    ],
    cue: 'jack in',
  },

  // HUD labels per station (lowercase, shown after a > prompt)
  hud: {
    threshold: 'uplink',
    loop: 'build loop',
    buildLog: 'build log',
    stack: 'the stack',
    metrics: 'proof',
    engage: 'ways in',
  },

  // The divisions: six stations, each with a 3D construct in the Lattice.
  // `a` is the division accent that regrades the whole world.
  capabilities: [
    {
      id: 'voice',
      no: '01',
      tag: 'voice division',
      title: 'AI Voice Agents',
      blurb:
        'Picks up before the second ring, in any language, and books the job while your competitor’s phone is still ringing. Speed-to-lead is a solved problem here.',
      bullets: [
        'Inbound + outbound at any volume',
        'Books, routes and recaps into your CRM',
        'Sub-second turn-taking, barge-in, transfer to human',
      ],
      a: '#27F2C0',
      b: '#0c5c5a',
    },
    {
      id: 'foundry',
      no: '02',
      tag: 'agent foundry',
      title: 'Custom Agents & Skills',
      blurb:
        'Claude agents shaped to your exact workflow: they read your tools over MCP, plan multi-step work, and check their own output against a rubric before you ever see it.',
      bullets: [
        'Bespoke skills, versioned like code',
        'MCP integrations: your stack becomes their toolbox',
        'Sub-agent teams: research, drafting, QA in parallel',
      ],
      a: '#7C5CFF',
      b: '#241a4d',
    },
    {
      id: 'orchestration',
      no: '03',
      tag: 'orchestration',
      title: 'Workflow Automation',
      blurb:
        'An n8n nervous system wiring your entire stack into one graph: triggers, branching, retries with backoff, and a human checkpoint before anything irreversible fires.',
      bullets: [
        '500+ app connectors',
        'Self-healing: error triggers + automatic retries',
        'Human-in-the-loop gates on expensive actions',
      ],
      a: '#4EA8FF',
      b: '#0c2b4d',
    },
    {
      id: 'memory',
      no: '04',
      tag: 'memory vault',
      title: 'RAG & Knowledge Systems',
      blurb:
        'Your documents, tickets and tribal knowledge become an answer engine where every response traces to a real source. Permission-aware, current, never a guess.',
      bullets: [
        'Vector index + long context over your corpus',
        'Access control mirrored from your permissions',
        'Citations on every answer',
      ],
      a: '#FFB36B',
      b: '#4d2c0c',
    },
    {
      id: 'growth',
      no: '05',
      tag: 'growth engine',
      title: 'Revenue Systems',
      blurb:
        'Outbound that researches, personalises and books while you sleep. Inbound where no call, chat or form ever goes unanswered. Pipeline without headcount.',
      bullets: [
        'Account research → sequence → booked meeting',
        'Reply detection and intelligent routing',
        'Every lead logged, scored, followed up',
      ],
      a: '#FF3D7F',
      b: '#4d1029',
    },
    {
      id: 'ops',
      no: '06',
      tag: 'lattice ops, our flagship',
      title: 'AI Reliability Ops',
      blurb:
        'The layer nobody else sells: we run your AI after it ships. Evals, monitoring, drift detection, cost tuning, model migrations. SRE for your agents, as a product.',
      bullets: [
        'Continuous evals against your rubric',
        'Live dashboards: latency, cost, resolution rate',
        'Model migrations when a better/cheaper one lands',
      ],
      a: '#9AE6FF',
      b: '#12384d',
    },
  ],

  // The build loop — process transparency as proof. This is the eval loop
  // buyers never get shown: how we decide ship / no-ship.
  loop: {
    kicker: 'how a system gets built',
    title: 'We don’t demo. We deploy, prove, and keep it alive.',
    steps: [
      {
        no: '01',
        title: 'Map',
        body: 'A short recon of your real workflows. Most aren’t worth automating. We score the few that are, with ROI math attached.',
      },
      {
        no: '02',
        title: 'Build',
        body: 'A working system on your real data in weeks. The same people who scope it build it. No bait-and-switch.',
      },
      {
        no: '03',
        title: 'Prove',
        body: 'An eval harness scores every output against your rubric. It ships when the numbers clear the bar, not when the demo looks good.',
      },
      {
        no: '04',
        title: 'Run',
        body: 'Monitoring, drift alerts, cost tuning and upgrades. The system compounds instead of quietly rotting.',
      },
    ],
  },

  // The build log — a running, specific record of what actually gets wired.
  buildLog: {
    kicker: 'tail -f build.log',
    title: 'Not a menu. A running log of what gets wired.',
    sub: 'Pull any line. We scope it this week.',
    entries: [
      {
        tag: 'claude',
        title: 'Agent SDK builds',
        body: 'Multi-step agents that plan, call tools, check their own work against a rubric, and retry before you ever see the output.',
      },
      {
        tag: 'n8n',
        title: 'AI Agent nodes',
        body: "Claude's reasoning wired straight into n8n's graph, so a workflow stops just triggering and starts deciding.",
      },
      {
        tag: 'claude',
        title: 'Custom Skills',
        body: 'Packaged expertise Claude loads on demand: your playbooks, your tone, your edge cases, versioned like code.',
      },
      {
        tag: 'n8n',
        title: 'Self-healing workflows',
        body: 'Error triggers, retries with backoff, and a human-in-the-loop checkpoint before anything expensive or irreversible fires.',
      },
      {
        tag: 'claude',
        title: 'MCP integrations',
        body: 'Your CRM, calendar and ticketing system exposed as tools Claude can call directly. No fragile screen-scraping.',
      },
      {
        tag: 'both',
        title: 'Realtime voice loop',
        body: 'Sub-second STT → Claude → TTS, wired straight into telephony. The agent picks up before the second ring.',
      },
      {
        tag: 'claude',
        title: 'Eval harnesses',
        body: 'Golden sets, rubric scoring and regression gates: the ship/no-ship instrument every AI build should come with, and almost none do.',
      },
      {
        tag: 'n8n',
        title: '500+ connectors',
        body: 'Every app in your stack wired into one graph: CRM, calendar, Slack, Stripe, your own internal APIs.',
      },
      {
        tag: 'both',
        title: 'Model migrations',
        body: 'When a better or cheaper model lands, we re-run your evals, migrate the prompts, and cut costs without breaking behaviour.',
      },
      {
        tag: 'claude',
        title: 'Computer-use QA',
        body: 'An agent that drives a real browser like a user would, files the bug, and attaches the repro.',
      },
      {
        tag: 'both',
        title: 'RAG over your knowledge',
        body: 'Vector-indexed docs plus long context, so every answer traces back to a real source. Never a guess.',
      },
      {
        tag: 'claude',
        title: 'Sub-agent orchestration',
        body: 'One orchestrator and a bench of specialists for research, drafting and QA, run in parallel and merged into a single answer.',
      },
    ],
  },

  // The stack we wield — honest credibility, model-agnostic by design
  stack: {
    kicker: 'the stack we wield',
    title: 'Best-in-class parts, welded into one machine.',
    groups: [
      {
        label: 'Intelligence',
        items: ['Claude (first-choice)', 'GPT / Gemini', 'Open-weights', 'Custom Skills', 'MCP'],
      },
      { label: 'Automation', items: ['n8n', 'Webhooks', 'Schedulers', 'Queues', 'Zapier bridge'] },
      { label: 'Voice', items: ['Realtime STT/TTS', 'Telephony (SIP)', 'Barge-in', 'Multilingual'] },
      { label: 'Memory', items: ['Vector DB / RAG', 'Postgres', 'Knowledge bases'] },
      { label: 'Proof', items: ['Eval harnesses', 'Live dashboards', 'Tracing & logs'] },
      { label: 'Surfaces', items: ['Web', 'WhatsApp', 'Email', 'Slack', 'CRM'] },
    ],
  },

  // Proof / outcome metrics — one band, four numbers a buyer's boss cares about
  metrics: [
    { v: '24/7', l: 'always-on agents' },
    { v: '<1s', l: 'voice response latency' },
    { v: '500+', l: 'app connectors on tap' },
    { v: '2×', l: 'ship rate of external builds vs in-house (MIT)' },
  ],

  // Ways in — transparent fixed-fee tiers. None of the market publishes
  // pricing; this section is deliberately the exception.
  engage: {
    kicker: 'ways in',
    title: 'Three doors. Fixed fees. No mystery.',
    sub: 'MIT found 95% of enterprise AI pilots never touch the P&L, and that externally built systems reach production twice as often. Closing that gap is our entire business, so every phase is fixed-fee, and part of it can ride on the KPI we commit to.',
    tiers: [
      {
        no: '01',
        name: 'Signal Audit',
        window: '2 weeks',
        price: 'from $3,000',
        body: 'We map your workflows, find the few automations actually worth building, and hand you a scored roadmap with ROI math. Yours to keep. Build it with anyone.',
      },
      {
        no: '02',
        name: 'First Agent Live',
        window: '3 to 6 weeks',
        price: 'from $10,000',
        body: 'One workflow (voice, agent or automation) wired end to end on your real data, with an eval harness proving it works before anyone relies on it.',
      },
      {
        no: '03',
        name: 'The Autonomous Layer',
        window: '6 to 12 weeks',
        price: 'from $30,000',
        body: 'Voice, agents, orchestration and memory deployed across the org, with training so your team owns what we built.',
      },
    ],
    retainer: {
      name: 'LATTICE OPS',
      price: 'from $1,500/mo',
      body: 'The service that never sleeps: monitoring, evals, drift alerts, cost tuning, model migrations, and a new automation shipped every month.',
    },
  },

  // Trust strip — the four questions every AI buyer actually asks, answered
  trust: {
    kicker: 'the fine print, up front',
    items: [
      { title: 'Your data trains nothing', body: 'Never used to train anyone’s models. In the contract, in writing.' },
      { title: 'Model-agnostic', body: 'Claude, GPT, Gemini or open weights: the best model per job. You are never locked in.' },
      { title: 'Humans on the loop', body: 'Checkpoints before anything expensive or irreversible fires.' },
      { title: 'Audit-ready', body: 'Logged decisions, scoped access, least-privilege keys on every build.' },
    ],
  },

  // Final CTA (the Portal carries the primary close; kept for reuse)
  cta: {
    kicker: 'end of line',
    title: ['Get your AI', 'into production.'],
    body: 'Tell us the work you keep doing by hand. We’ll wire the voice, the agents and the automations that make it run itself. Then we’ll keep them alive.',
    email: 'hello@hanflux.ai',
    button: 'Get your AI into production',
  },
}

export type Capability2 = (typeof ACT2.capabilities)[number]
