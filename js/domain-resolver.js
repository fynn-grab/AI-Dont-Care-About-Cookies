/**
 * Domain resolution and rule lookup - replicates getHostname() and getPreparedTab() from background.js
 */

function cleanHostname(url) {
  try {
    if (url.indexOf('http') !== 0) {
      return false;
    }
    const a = new URL(url);
    return a.hostname.replace(/^w{2,3}\d*\./i, '');
  } catch {
    return false;
  }
}

function getHostLevels(hostname) {
  if (!hostname) return [];
  const parts = hostname.split('.');
  const levels = [];
  for (let i = parts.length; i >= 2; i--) {
    levels.push(parts.slice(-1 * i).join('.'));
  }
  return levels;
}

function resolveRule(hostname, hostLevels, rules) {
  if (rules[hostname]) {
    return rules[hostname];
  }
  for (const level of hostLevels) {
    if (rules[level]) {
      return rules[level];
    }
  }
  return null;
}

module.exports = { cleanHostname, getHostLevels, resolveRule };
