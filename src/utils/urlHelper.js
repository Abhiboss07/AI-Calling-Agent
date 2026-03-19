const config = require('../config');

function getPublicBaseUrl(req) {
  const configured = (config.baseUrl || '').trim();
  const isConfiguredUsable = configured && !/localhost|127\.0\.0\.1/i.test(configured);
  if (isConfiguredUsable) {
    const url = configured.replace(/\/$/, '');
    // Ensure protocol is present — Railway env vars are often set without https://
    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
  }

  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}`.replace(/\/$/, '');
}

module.exports = { getPublicBaseUrl };
