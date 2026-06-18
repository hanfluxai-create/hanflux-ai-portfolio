/**
 * Minimal DOM overlay for Phase 0: wordmark + nav + a corner HUD.
 * Phase 5 grows this into full SplitText reveals and active states.
 */
export function Overlay() {
  return (
    <div className="overlay">
      <header className="topbar">
        <a href="#" className="wordmark" data-hover>
          HYDRA<span className="wordmark-mark">°</span>
        </a>
        <nav className="nav">
          <a href="#work" data-hover>Work</a>
          <a href="#about" data-hover>About</a>
          <a href="#contact" data-hover>Contact</a>
        </nav>
      </header>

      <footer className="hud">
        <span className="hud-pulse" aria-hidden="true" />
        <span>real-time webgl</span>
        <span className="hud-sep">/</span>
        <span>
          press <kbd>G</kbd> for debug
        </span>
      </footer>
    </div>
  )
}
