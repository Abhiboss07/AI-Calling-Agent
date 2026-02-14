// ══════════════════════════════════════════════════════════════════════════════
// STRUCTURED LOGGER — JSON output in production, human-readable in dev
// ══════════════════════════════════════════════════════════════════════════════

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const CURRENT_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL || 'info'] || 1;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function formatArgs(args) {
  return args.map(a => {
    if (a === null || a === undefined) return String(a);
    if (typeof a === 'object') {
      try { return JSON.stringify(a); }
      catch { return String(a); }
    }
    return String(a);
  }).join(' ');
}

function jsonLog(level, args) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: formatArgs(args),
    pid: process.pid
  };

  // Extract callSid if present in args (for call-level tracing)
  for (const a of args) {
    if (typeof a === 'string' && a.startsWith('CA')) {
      entry.callSid = a;
      break;
    }
    if (typeof a === 'object' && a?.callSid) {
      entry.callSid = a.callSid;
      break;
    }
  }

  return JSON.stringify(entry);
}

function humanLog(level, args) {
  const ts = new Date().toISOString();
  return `[${ts}] ${level.padEnd(5)} ${formatArgs(args)}`;
}

function log(...args) {
  if (CURRENT_LEVEL > LOG_LEVELS.info) return;
  if (IS_PRODUCTION) {
    console.log(jsonLog('INFO', args));
  } else {
    console.log(humanLog('INFO', args));
  }
}

function debug(...args) {
  if (CURRENT_LEVEL > LOG_LEVELS.debug) return;
  if (IS_PRODUCTION) {
    console.log(jsonLog('DEBUG', args));
  } else {
    console.log(humanLog('DEBUG', args));
  }
}

function warn(...args) {
  if (CURRENT_LEVEL > LOG_LEVELS.warn) return;
  if (IS_PRODUCTION) {
    console.warn(jsonLog('WARN', args));
  } else {
    console.warn(humanLog('WARN', args));
  }
}

function error(...args) {
  if (IS_PRODUCTION) {
    console.error(jsonLog('ERROR', args));
  } else {
    console.error(humanLog('ERROR', args));
  }
}

module.exports = { log, debug, warn, error };
