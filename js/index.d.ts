import type { Page, BrowserContext } from 'playwright';

/**
 * Block cookie consent dialogs on a Playwright Page or BrowserContext.
 *
 * Call once before navigating - survives page navigations automatically.
 * Handles main frames, iframes, URL blocking, CSS injection, and click handlers.
 *
 * @param target - A Playwright Page or BrowserContext
 *
 * @example
 * // Page-level
 * const { blockCookieDialogs } = require('ai-dont-care-about-cookies');
 * await blockCookieDialogs(page);
 * await page.goto('https://example.com');
 *
 * @example
 * // Context-level (all pages)
 * await blockCookieDialogs(context);
 */
export function blockCookieDialogs(target: Page | BrowserContext): Promise<void>;
