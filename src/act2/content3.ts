/**
 * ACT III — "The Portal" — all copy in one place.
 * The closing movement of the descent: a full-screen portal CTA.
 * Edit text/data here — no component edits needed.
 *
 * House style: no en/em dashes anywhere in rendered strings.
 */

export const ACT3 = {
  portal: {
    kicker: 'END OF THE LATTICE · YOUR MOVE',
    title: ['Get your AI', 'into production.'],
    body: 'Tell us the work you keep doing by hand. We’ll wire the voice, the agents and the automations that make it run itself. Then we’ll keep them alive. First door: a fixed-fee Signal Audit, yours to keep.',
    button: 'Book a 15-minute call',
    email: 'hanfluxai@gmail.com',
    // add WhatsApp ({ label: 'WhatsApp', href: 'https://wa.me/<E.164 digits>' })
    // and X ({ label: 'X', href: 'https://x.com/<handle>' }) once the real
    // handles exist — placeholder dead links ship nowhere
    socials: [
      // /legal redirects to legal.hanflux.ai (see vercel.json)
      { label: 'Legal', href: '/legal' },
    ],
  },
}
