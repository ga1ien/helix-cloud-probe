/**
 * Live-region announcer for the Hello Kulti demo.
 *
 * Screen readers only speak changes inside a live region, so every state change
 * in the demo (form submitted, async result, error) is written into a single
 * aria-live element through this module instead of being written directly to
 * the visible output. That keeps one, predictable announcement channel.
 *
 * Two priorities are supported:
 *   - "polite"     -> role="status",  aria-live="polite"    (waits its turn)
 *   - "assertive"  -> role="alert",   aria-live="assertive" (errors interrupt)
 */

/** id of the live region rendered by the demo page. */
export const STATUS_REGION_ID = 'kulti-status';

/** Default scheduler: write on the next tick so clearing + setting is a mutation. */
const defaultSchedule = (callback) => setTimeout(callback, 0);

/**
 * Wrap a live-region element in a tiny announcer.
 *
 * @param {Element} region live region element (e.g. role="status")
 * @param {{schedule?: (cb: Function) => void}} [options]
 * @returns {{announce: (message: unknown, options?: {priority?: 'polite'|'assertive'}) => string, clear: () => void}}
 */
export function createAnnouncer(region, options = {}) {
  if (!region || typeof region.setAttribute !== 'function') {
    throw new TypeError('createAnnouncer requires a live-region element');
  }
  const schedule = options.schedule || defaultSchedule;

  return {
    announce(message, { priority = 'polite' } = {}) {
      const text = message == null ? '' : String(message);
      const assertive = priority === 'assertive';

      // role/aria-live are set together so the region is always announced with
      // the right urgency, even though the demo reuses one element.
      region.setAttribute('role', assertive ? 'alert' : 'status');
      region.setAttribute('aria-live', assertive ? 'assertive' : 'polite');

      // Re-announcing the exact same string is often ignored by screen readers,
      // so empty the region first and write the message on the next tick.
      if (region.textContent === text) {
        region.textContent = '';
      }
      schedule(() => {
        region.textContent = text;
      });
      return text;
    },

    clear() {
      region.textContent = '';
    },
  };
}

let singleton = null;

/**
 * Convenience wrapper for the demo page: finds #kulti-status in the document.
 * Tests use createAnnouncer() with a fake region instead.
 */
export function announce(message, options) {
  if (typeof document === 'undefined') {
    throw new Error('announce() needs a document; use createAnnouncer() instead');
  }
  if (!singleton) {
    const region = document.getElementById(STATUS_REGION_ID);
    if (!region) throw new Error(`Live region #${STATUS_REGION_ID} is missing`);
    singleton = createAnnouncer(region);
  }
  return singleton.announce(message, options);
}
