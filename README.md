# AI-Dont-Care-About-Cookies

Block cookie consent dialogs in Playwright with a single line of code.

Uses **15,000+ domain rules** from the [I Still Don't Care About Cookies](https://github.com/OhMyGuus/I-Still-Dont-Care-About-Cookies) browser extension, ported natively to Playwright for **JavaScript** and **Python**.

## Why?

Cookie consent banners introduce significant friction for automated browser sessions and LLM-based web agents. Handling these dialogs per page leads to several technical inefficiencies:

* **Context Window Pollution:** Cookie banners bloat the DOM with irrelevant markup (vendor lists, legal text). This distracts the LLM from the actual page content and degrades extraction accuracy.
* **Unnecessary Token Usage:** Processing the markup of consent dialogs consumes API tokens without contributing to your actual data extraction task.
* **UI Interference:** Overlays obscure the viewport and intercept pointer events, which sometimes causes standard Playwright actions to fail or time out.
* **Agent Navigation:** Autonomous agents frequently spend execution steps attempting to dismiss consent dialogs instead of focusing on their primary objective.

**AI-Dont-Care-About-Cookies** resolves this at the session level. A single function call blocks consent management scripts via network interception and hides associated UI elements via injected CSS, allowing your scraper or agent to access the underlying page content uninterrupted.

## Features

* 15,308 domain-specific rules
* 1,740 tracking URL patterns blocked via `page.route()`
* 14,341 lines of CSS injected before page scripts execute
* 7 handler scripts (default click, site-specific click, cookie, localStorage, sessionStorage, Google, embeds)
* Survives page navigations without re-injection
* Handles cookie dialogs inside iframes (e.g., Sourcepoint)
* Works at page or context level
* TypeScript type definitions included (JS package)
* No runtime dependencies beyond Playwright

## Installation

### JavaScript / Node.js

```bash
npm install ai-dont-care-about-cookies
```

### Python

```bash
pip install ai-dont-care-about-cookies
```

## Usage

### JavaScript

```js
const { chromium } = require('playwright');
const { blockCookieDialogs } = require('ai-dont-care-about-cookies');

const browser = await chromium.launch();
const context = await browser.newContext({ bypassCSP: true });
const page = await context.newPage();

await blockCookieDialogs(page);

await page.goto('https://www.spiegel.de');
```

#### Context-level (all pages)

```js
await blockCookieDialogs(context);

const page1 = await context.newPage();
await page1.goto('https://www.bbc.com');

const page2 = await context.newPage();
await page2.goto('https://www.spiegel.de');
```

### Python (sync)

```python
from playwright.sync_api import sync_playwright
from playwright_cookie_blocker import block_cookie_dialogs

with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(bypass_csp=True)
    page = context.new_page()

    block_cookie_dialogs(page)

    page.goto("https://www.spiegel.de")
```

### Python (async)

```python
from playwright.async_api import async_playwright
from playwright_cookie_blocker import block_cookie_dialogs

async with async_playwright() as p:
    browser = await p.chromium.launch()
    context = await browser.new_context(bypass_csp=True)
    page = await context.new_page()

    await block_cookie_dialogs(page)

    await page.goto("https://www.spiegel.de")
```

## How It Works

The library replicates the behavior of the [I Still Don't Care About Cookies](https://github.com/OhMyGuus/I-Still-Dont-Care-About-Cookies) browser extension using native Playwright APIs:

1. **CSS injection** via `addInitScript()` runs before any page script executes. This hides the majority of consent dialogs immediately and persists across navigations.

2. **Network interception** via `page.route()` blocks requests to known consent management platforms (Sourcepoint, OneTrust, CookieBot, etc.) before they load.

3. **Domain-specific rules** are applied on `domcontentloaded`. Each domain can have custom CSS, shared CSS patterns, and JavaScript click handlers for dialogs that cannot be hidden with CSS alone.

4. **Iframe handling** via `framenavigated` events processes cookie dialogs rendered inside iframes.

5. **Fallback handler** runs on domains without a specific rule, scanning for common consent button patterns ("Accept", "OK", "Agree").

## Comparison with idcac-playwright

[idcac-playwright](https://github.com/apify/idcac) by Apify compiles the original browser extension into a single injectable script.

| Feature | This library | idcac-playwright |
|---------|-------------|-----------------|
| URL blocking | 1,740 tracking URL patterns blocked | Not included (removed during compilation) |
| Navigation survival | Automatic | Must re-inject after every navigation |
| Iframe support | Yes | No |
| Python support | Yes (sync and async) | No |
| Puppeteer support | No (Playwright only) | Yes (Playwright and Puppeteer) |
| Base extension | [I Still Don't Care About Cookies](https://github.com/OhMyGuus/I-Still-Dont-Care-About-Cookies) (actively maintained fork) | [I Don't Care About Cookies](https://www.i-dont-care-about-cookies.eu/) (acquired by Avast) |

## Note on `bypassCSP`

For reliable script injection, create the browser context with `bypassCSP: true`:

```js
const context = await browser.newContext({ bypassCSP: true });
```

```python
context = browser.new_context(bypass_csp=True)
```

Without this flag, Content Security Policy headers on some sites may prevent click handler scripts from executing.

## Used in Production

I use this library in production in my own projects:

* [TendiGo.de](https://tendigo.de): scrapes public tender documents across Germany from various websites
* [bwl.careers](https://bwl.careers): scrapes job listings from various company websites

Using this in your project? Open an issue to get it listed here.

## Credits

All cookie handling logic originates from the browser extension ecosystem. I ported it to work natively with Playwright APIs.

* **[I Still Don't Care About Cookies](https://github.com/OhMyGuus/I-Still-Dont-Care-About-Cookies)** by [OhMyGuus](https://github.com/OhMyGuus): actively maintained community fork, source of all rules, CSS, and handler scripts used in this library
* **[I Don't Care About Cookies](https://www.i-dont-care-about-cookies.eu/)** by Daniel Kladnik: the original browser extension (acquired by Avast in 2022)

## License

GPL-3.0. See [LICENSE](LICENSE).
