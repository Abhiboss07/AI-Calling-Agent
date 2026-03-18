const logger = require('./logger');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function retry(fn, opts = { retries: 3, minDelay: 200, factor: 2, onRetry: null }) {
  let attempt = 0; let delay = opts.minDelay || 200;
  while (true) {
    try { return await fn(); }
    catch (err) {
      attempt++;
      if (attempt > (opts.retries || 3)) throw err;
      if (opts.onRetry) try { opts.onRetry(err, attempt, delay); } catch (e) { }
      await sleep(delay);
      delay = Math.round(delay * (opts.factor || 2));
    }
  }
}

/**
 * Simple one-shot retry with optional delay. Drop-in for voice pipeline use.
 * @param {Function} fn         Async function: () => Promise<T>
 * @param {number}   retries    How many times to retry on failure (default 1)
 * @param {number}   delayMs    Wait between retries (default 0)
 * @param {string}   label      Log tag for identifying the operation
 */
async function withRetry(fn, retries = 1, delayMs = 0, label = 'op') {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries) throw err;
      attempt++;
      logger.warn(`[retry] ${label} attempt ${attempt}/${retries} failed: ${err.message}`);
      if (delayMs > 0) await sleep(delayMs);
    }
  }
}

module.exports = { retry, withRetry };
