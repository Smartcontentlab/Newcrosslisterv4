/**
 * The Crosslister design system is light-only (the Framer file has one theme).
 * This makes sure a dark class or an old saved preference can never leave the app half-themed.
 */
export function initTheme(): void {
  document.documentElement.classList.remove('dark');
  try {
    window.localStorage.removeItem('crosslinkos-theme');
  } catch {
    /* storage can be unavailable (private window); nothing to clean up */
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', '#F6F3EE');
}
