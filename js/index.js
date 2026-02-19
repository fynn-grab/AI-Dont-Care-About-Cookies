/**
 * Playwright Cookie Blocker
 * Blocks cookie consent dialogs using rules from "I Still Don't Care About Cookies"
 *
 * Replicates the exact flow from the original extension's background.js:
 * 1. Common CSS injected early (before page scripts execute)
 * 2. URL blocking via page.route()
 * 3. On domcontentloaded: embedsHandler -> domain-specific rules -> default click handler fallback
 *
 * Usage:
 *   const { blockCookieDialogs } = require('ai-dont-care-about-cookies');
 *   await blockCookieDialogs(page);    // or context
 *   await page.goto('https://example.com');
 */

const fs = require('fs');
const path = require('path');
const { blockUrls, rules, commons, commonJSHandlers } = require('./rules-data');
const { cleanHostname, getHostLevels, resolveRule } = require('./domain-resolver');

// Cache data files in memory
let commonCssContent = null;
const handlerScriptCache = {};

function getCommonCss() {
  if (!commonCssContent) {
    commonCssContent = fs.readFileSync(
      path.join(__dirname, '..', 'data', 'css', 'common.css'),
      'utf-8'
    );
  }
  return commonCssContent;
}

function getHandlerScript(filename) {
  if (!handlerScriptCache[filename]) {
    handlerScriptCache[filename] = fs.readFileSync(
      path.join(__dirname, '..', 'data', 'js', filename),
      'utf-8'
    );
  }
  return handlerScriptCache[filename];
}

/**
 * Check if a URL should be blocked based on blockUrls rules.
 * Replicates blockUrlCallback() from background.js exactly.
 */
function shouldBlockUrl(url, hostLevels) {
  const cleanURL = url.split('?')[0];

  // Check grouped filters (keyword-based groups for fast matching)
  for (const group in blockUrls.common_groups) {
    if (url.indexOf(group) > -1) {
      const groupFilters = blockUrls.common_groups[group];
      for (let i = 0; i < groupFilters.length; i++) {
        const filter = groupFilters[i];
        if (
          (filter.q && url.indexOf(filter.r) > -1) ||
          (!filter.q && cleanURL.indexOf(filter.r) > -1)
        ) {
          // Check for exceptions
          if (filter.e && hostLevels.length > 0) {
            let isException = false;
            for (let level = 0; level < hostLevels.length; level++) {
              for (let exc = 0; exc < filter.e.length; exc++) {
                if (filter.e[exc] === hostLevels[level]) {
                  isException = true;
                  break;
                }
              }
              if (isException) break;
            }
            if (isException) continue;
          }
          return true;
        }
      }
    }
  }

  // Check ungrouped common filters
  const commonFilters = blockUrls.common;
  for (let i = 0; i < commonFilters.length; i++) {
    const filter = commonFilters[i];
    if (
      (filter.q && url.indexOf(filter.r) > -1) ||
      (!filter.q && cleanURL.indexOf(filter.r) > -1)
    ) {
      if (filter.e && hostLevels.length > 0) {
        let isException = false;
        for (let level = 0; level < hostLevels.length; level++) {
          for (let exc = 0; exc < filter.e.length; exc++) {
            if (filter.e[exc] === hostLevels[level]) {
              isException = true;
              break;
            }
          }
          if (isException) break;
        }
        if (isException) continue;
      }
      return true;
    }
  }

  // Check site-specific filters
  if (hostLevels.length > 0) {
    for (let level = 0; level < hostLevels.length; level++) {
      const siteRules = blockUrls.specific[hostLevels[level]];
      if (siteRules) {
        for (let i = 0; i < siteRules.length; i++) {
          if (url.indexOf(siteRules[i]) > -1) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

/**
 * Apply domain-specific rules to a page.
 * Replicates activateDomain() from background.js exactly.
 *
 * Each rule can have:
 *   s = custom CSS for webpage
 *   c = common CSS index (into commons array)
 *   j = JS handler index (into commonJSHandlers: 0=defaultClick, 2=sessionStorage,
 *       3=localStorage, 5=clickHandler, 6=cookieHandler, 8=googleHandler)
 *
 * All three (s, c, j) are independent and can be combined.
 */
async function activateDomain(page, hostname, hostLevels) {
  const rule = resolveRule(hostname, hostLevels, rules);

  if (!rule) {
    return false;
  }

  let status = false;

  // rule.s = Custom CSS for webpage
  if (typeof rule.s !== 'undefined') {
    await page.addStyleTag({ content: rule.s }).catch(() => {});
    status = true;
  }

  // rule.c = Common CSS for webpage (index into commons array)
  if (typeof rule.c !== 'undefined') {
    const commonCss = commons[rule.c];
    if (commonCss) {
      await page.addStyleTag({ content: commonCss }).catch(() => {});
    }
    status = true;
  }

  // rule.j = Common JS handler (index into commonJSHandlers)
  // This injects the FULL handler script (including its execution code) into the page,
  // exactly like the original extension does with executeScript({file: ...})
  if (typeof rule.j !== 'undefined') {
    const handlerName = commonJSHandlers[rule.j];
    if (handlerName) {
      try {
        const scriptContent = getHandlerScript(handlerName + '.js');
        await page.addScriptTag({ content: scriptContent }).catch(() => {});
      } catch (e) {
        // Handler file not found - skip
      }
    }
    status = true;
  }

  return status;
}

/**
 * Apply doTheMagic logic to a page after navigation.
 * Replicates the exact flow from background.js lines 478-532.
 *
 * Original order:
 * 1. common.css (already injected via addInitScript)
 * 2. embedsHandler.js
 * 3. activateDomain(hostname) -> activateDomain(host_levels)
 * 4. If no rule found: 0_defaultClickHandler.js
 */
async function doTheMagic(page) {
  try {
    const url = page.url();
    if (!url || url.indexOf('http') !== 0) return;

    const hostname = cleanHostname(url);
    if (!hostname) return;

    const hostLevels = getHostLevels(hostname);

    // Step 2: Inject embeds handler (always, like original)
    try {
      const embedsScript = getHandlerScript('embedsHandler.js');
      await page.addScriptTag({ content: embedsScript });
    } catch (e) { /* page navigated away */ }

    // Step 3: Try to activate domain-specific rules
    const activated = await activateDomain(page, hostname, hostLevels);

    if (!activated) {
      // Step 4: No specific rule found - inject default click handler
      try {
        const defaultClickScript = getHandlerScript('0_defaultClickHandler.js');
        await page.addScriptTag({ content: defaultClickScript });
      } catch (e) { /* page navigated away */ }
    }
  } catch (e) {
    // Page may have navigated away, ignore errors
  }
}

/**
 * Apply doTheMagic to a single frame.
 * Replicates webNavigation.onCompleted for frameId > 0.
 */
async function doTheMagicForFrame(frame) {
  const url = frame.url();
  if (!url || url === 'about:blank' || url.indexOf('http') !== 0) return;

  try {
    const hostname = cleanHostname(url);
    if (!hostname) return;

    const hostLevels = getHostLevels(hostname);

    // Inject common CSS into frame
    await frame.addStyleTag({ content: getCommonCss() }).catch(() => {});

    // Inject embeds handler
    await frame.addScriptTag({ content: getHandlerScript('embedsHandler.js') }).catch(() => {});

    // Try domain-specific rules
    const rule = resolveRule(hostname, hostLevels, rules);
    if (rule) {
      if (typeof rule.s !== 'undefined') {
        await frame.addStyleTag({ content: rule.s }).catch(() => {});
      }
      if (typeof rule.c !== 'undefined') {
        const css = commons[rule.c];
        if (css) await frame.addStyleTag({ content: css }).catch(() => {});
      }
      if (typeof rule.j !== 'undefined') {
        const handlerName = commonJSHandlers[rule.j];
        if (handlerName) {
          try {
            await frame.addScriptTag({ content: getHandlerScript(handlerName + '.js') }).catch(() => {});
          } catch (e) {}
        }
      }
    } else {
      await frame.addScriptTag({ content: getHandlerScript('0_defaultClickHandler.js') }).catch(() => {});
    }
  } catch (e) {
    // Frame not accessible, skip
  }
}

/**
 * Main entry point - block cookie dialogs on a Playwright Page or BrowserContext.
 *
 * @param {import('playwright').Page | import('playwright').BrowserContext} target - Page or BrowserContext
 */
async function blockCookieDialogs(target) {
  const isContext = typeof target.newPage === 'function';

  if (isContext) {
    const context = target;

    // URL blocking on context level
    await context.route('**/*', (route, request) => {
      const url = request.url();
      const resourceType = request.resourceType();

      if (['script', 'stylesheet', 'xhr', 'fetch'].includes(resourceType)) {
        const referer = request.headers()['referer'] || url;
        const hostname = cleanHostname(referer);
        const hostLevels = hostname ? getHostLevels(hostname) : [];

        if (shouldBlockUrl(url, hostLevels)) {
          return route.abort();
        }
      }
      return route.fallback();
    });

    // Apply to future pages
    context.on('page', (page) => {
      setupPage(page);
    });

    // Apply to existing pages
    for (const page of context.pages()) {
      setupPage(page);
    }
  } else {
    const page = target;

    // URL blocking on page level
    await page.route('**/*', (route, request) => {
      const url = request.url();
      const resourceType = request.resourceType();

      if (['script', 'stylesheet', 'xhr', 'fetch'].includes(resourceType)) {
        const referer = request.headers()['referer'] || url;
        const hostname = cleanHostname(referer);
        const hostLevels = hostname ? getHostLevels(hostname) : [];

        if (shouldBlockUrl(url, hostLevels)) {
          return route.abort();
        }
      }
      return route.fallback();
    });

    setupPage(page);
  }
}

/**
 * Set up cookie blocking on a single page.
 * Replicates the original extension's injection strategy:
 * - common.css via addInitScript (runs at document start, survives navigations)
 * - Domain-specific rules on domcontentloaded (earlier than load, closer to original onCommitted)
 * - Frame handling via framenavigated (fires per-frame, like original's onCompleted)
 */
function setupPage(page) {
  // Step 1: Inject common CSS early via addInitScript
  // This runs before page scripts execute, similar to original's insertCSS at document_start.
  // Note: Original uses cssOrigin: "user" for higher priority. Playwright has no equivalent,
  // but common.css uses !important throughout, so author-level should work in most cases.
  const commonCss = getCommonCss();
  page.addInitScript((css) => {
    const style = document.createElement('style');
    style.setAttribute('data-idcac', '1');
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }, commonCss);

  // On domcontentloaded: apply domain-specific rules (closer to original's onCommitted timing)
  page.on('domcontentloaded', async () => {
    await doTheMagic(page);
  });

  // On framenavigated: handle each iframe individually as it navigates.
  // This replicates original's webNavigation.onCompleted for frameId > 0.
  // Unlike 'load' (which fires once), this fires per-frame and catches late-loading iframes.
  page.on('framenavigated', async (frame) => {
    if (frame === page.mainFrame()) return;
    await doTheMagicForFrame(frame);
  });
}

module.exports = { blockCookieDialogs };
