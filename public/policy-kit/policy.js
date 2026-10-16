// Hanflux policy pages: contents scroll-spy, section link anchors, copy-link
// buttons. Everything here is an enhancement; the pages read fine without it.
;(() => {
  const toc = document.querySelector('.toc')
  const details = toc && toc.querySelector('details')

  if (details) {
    // Contents stays open on wide screens and starts collapsed on narrow ones
    const wide = matchMedia('(min-width: 961px)')
    const sync = () => {
      details.open = wide.matches
    }
    sync()
    wide.addEventListener('change', sync)
    toc.addEventListener('click', (e) => {
      if (!wide.matches && e.target.closest('a')) details.open = false
    })

    const links = [...toc.querySelectorAll('a[href^="#"]')]
    const targets = links.map((a) => document.getElementById(a.hash.slice(1))).filter(Boolean)
    let active = null
    let queued = false
    const spy = () => {
      queued = false
      const line = innerHeight * 0.3
      let current = targets[0]
      for (const t of targets) if (t.getBoundingClientRect().top <= line) current = t
      // at the very bottom the last section counts as current even if short
      if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2) current = targets.at(-1)
      if (current === active) return
      active = current
      for (const a of links) {
        const on = a.hash === `#${current.id}`
        a.classList.toggle('is-active', on)
        if (on) a.setAttribute('aria-current', 'location')
        else a.removeAttribute('aria-current')
      }
    }
    addEventListener(
      'scroll',
      () => {
        if (!queued) {
          queued = true
          requestAnimationFrame(spy)
        }
      },
      { passive: true },
    )
    spy()
  }

  // A "#" link on each numbered heading, so a clause can be cited by URL
  for (const h of document.querySelectorAll('.prose section[id] > h2')) {
    const a = document.createElement('a')
    a.className = 'anchor'
    a.href = `#${h.parentElement.id}`
    a.setAttribute('aria-label', `Link to section: ${h.textContent.trim()}`)
    a.textContent = '#'
    h.append(a)
  }

  for (const btn of document.querySelectorAll('[data-copy]')) {
    if (!navigator.clipboard) continue
    btn.hidden = false
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy)
        btn.textContent = 'Copied'
        btn.dataset.copied = ''
        setTimeout(() => {
          btn.textContent = 'Copy link'
          delete btn.dataset.copied
        }, 1800)
      } catch {
        btn.textContent = 'Copy blocked'
      }
    })
  }
})()
