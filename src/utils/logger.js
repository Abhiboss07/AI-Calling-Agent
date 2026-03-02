// ══════════════════════════════════════════════════════════════════════════════
// STRUCTURED LOGGER — JSON output in production, human-readable in dev
// ══════════════════════════════════════════════════════════════════════════════

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const CURRENT_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL || 'info'] || 1;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// In-memory log buffer for the dashboard viewer
const MAX_LOGS = 200;
const logBuffer = [];

function prependLog(entry) {
  logBuffer.unshift(entry);
  if (logBuffer.length > MAX_LOGS) {
    logBuffer.pop();
  }
}

function getSystemLogs() {
  return logBuffer;
}

function formatArgs(args) {
  return args.map(a => {
    if (a === null || a === undefined) return String(a);
    if (a instanceof Error) {
      return a.stack || a.message || String(a);
    }
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
  const json = jsonLog('INFO', args);
  prependLog(JSON.parse(json));

  if (IS_PRODUCTION) {
    console.log(json);
  } else {
    console.log(humanLog('INFO', args));
  }
}

function debug(...args) {
  if (CURRENT_LEVEL > LOG_LEVELS.debug) return;
  const json = jsonLog('DEBUG', args);
  prependLog(JSON.parse(json));

  if (IS_PRODUCTION) {
    console.log(json);
  } else {
    console.log(humanLog('DEBUG', args));
  }
}

function warn(...args) {
  if (CURRENT_LEVEL > LOG_LEVELS.warn) return;
  const json = jsonLog('WARN', args);
  prependLog(JSON.parse(json));

  if (IS_PRODUCTION) {
    console.warn(json);
  } else {
    console.warn(humanLog('WARN', args));
  }
}

function error(...args) {
  const json = jsonLog('ERROR', args);
  prependLog(JSON.parse(json));

  if (IS_PRODUCTION) {
    console.error(json);
  } else {
    console.error(humanLog('ERROR', args));
  }
}

module.exports = { log, debug, warn, error, getSystemLogs };
