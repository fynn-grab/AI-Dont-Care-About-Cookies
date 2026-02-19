"""
Playwright Cookie Blocker
Blocks cookie consent dialogs using rules from "I Still Don't Care About Cookies"

Replicates the exact flow from the original extension's background.js:
1. Common CSS injected early (before page scripts execute)
2. URL blocking via page.route()
3. On domcontentloaded: embedsHandler -> domain-specific rules -> default click handler fallback
4. On framenavigated: iframe handling

Usage (sync):
    from playwright_cookie_blocker import block_cookie_dialogs
    block_cookie_dialogs(page)
    page.goto("https://example.com")

Usage (async):
    from playwright_cookie_blocker import block_cookie_dialogs
    await block_cookie_dialogs(page)
    await page.goto("https://example.com")
"""

import asyncio
from pathlib import Path

from .domain_resolver import clean_hostname, get_host_levels, resolve_rule
from .rules_data import block_urls, commons, common_js_handlers, rules

__all__ = ["block_cookie_dialogs"]

# Data directory (bundled within the Python package)
_DATA_DIR = Path(__file__).parent / "data"

# Cache
_common_css_content = None
_handler_script_cache = {}


def _get_common_css():
    global _common_css_content
    if _common_css_content is None:
        css_path = _DATA_DIR / "css" / "common.css"
        _common_css_content = css_path.read_text(encoding="utf-8")
    return _common_css_content


def _get_handler_script(filename):
    if filename not in _handler_script_cache:
        script_path = _DATA_DIR / "js" / filename
        _handler_script_cache[filename] = script_path.read_text(encoding="utf-8")
    return _handler_script_cache[filename]


def _should_block_url(url, host_levels):
    """Check if a URL should be blocked. Replicates blockUrlCallback() from background.js."""
    clean_url = url.split("?")[0]

    # Grouped filters (keyword-based groups for fast matching)
    common_groups = block_urls.get("common_groups", {})
    for group, group_filters in common_groups.items():
        if group in url:
            for f in group_filters:
                r = f.get("r", "")
                q = f.get("q", False)
                e = f.get("e")

                if (q and r in url) or (not q and r in clean_url):
                    if e and host_levels:
                        if any(level in e for level in host_levels):
                            continue
                    return True

    # Ungrouped common filters
    for f in block_urls.get("common", []):
        r = f.get("r", "")
        q = f.get("q", False)
        e = f.get("e")

        if (q and r in url) or (not q and r in clean_url):
            if e and host_levels:
                if any(level in e for level in host_levels):
                    continue
            return True

    # Site-specific filters
    specific = block_urls.get("specific", {})
    for level in host_levels:
        if level in specific:
            for rule_url in specific[level]:
                if rule_url in url:
                    return True

    return False


def _activate_domain_sync(page_or_frame, hostname, host_levels):
    """Apply domain-specific rules. Replicates activateDomain() from background.js."""
    rule = resolve_rule(hostname, host_levels, rules)
    if not rule:
        return False

    status = False

    if "s" in rule:
        try:
            page_or_frame.add_style_tag(content=rule["s"])
        except Exception:
            pass
        status = True

    if "c" in rule:
        common_css = commons.get(str(rule["c"]))
        if common_css:
            try:
                page_or_frame.add_style_tag(content=common_css)
            except Exception:
                pass
        status = True

    if "j" in rule:
        handler_name = common_js_handlers.get(str(rule["j"]))
        if handler_name:
            try:
                script = _get_handler_script(handler_name + ".js")
                page_or_frame.add_script_tag(content=script)
            except Exception:
                pass
        status = True

    return status


async def _activate_domain_async(page_or_frame, hostname, host_levels):
    """Apply domain-specific rules (async). Replicates activateDomain() from background.js."""
    rule = resolve_rule(hostname, host_levels, rules)
    if not rule:
        return False

    status = False

    if "s" in rule:
        try:
            await page_or_frame.add_style_tag(content=rule["s"])
        except Exception:
            pass
        status = True

    if "c" in rule:
        common_css = commons.get(str(rule["c"]))
        if common_css:
            try:
                await page_or_frame.add_style_tag(content=common_css)
            except Exception:
                pass
        status = True

    if "j" in rule:
        handler_name = common_js_handlers.get(str(rule["j"]))
        if handler_name:
            try:
                script = _get_handler_script(handler_name + ".js")
                await page_or_frame.add_script_tag(content=script)
            except Exception:
                pass
        status = True

    return status


def _do_the_magic_sync(page):
    """Replicates doTheMagic() from background.js (sync)."""
    try:
        url = page.url
        if not url or not url.startswith("http"):
            return

        hostname = clean_hostname(url)
        if not hostname:
            return

        host_levels = get_host_levels(hostname)

        # Embeds handler (always)
        try:
            page.add_script_tag(content=_get_handler_script("embedsHandler.js"))
        except Exception:
            pass

        # Domain-specific rules
        activated = _activate_domain_sync(page, hostname, host_levels)

        if not activated:
            # Fallback: default click handler
            try:
                page.add_script_tag(content=_get_handler_script("0_defaultClickHandler.js"))
            except Exception:
                pass
    except Exception:
        pass


async def _do_the_magic_async(page):
    """Replicates doTheMagic() from background.js (async)."""
    try:
        url = page.url
        if not url or not url.startswith("http"):
            return

        hostname = clean_hostname(url)
        if not hostname:
            return

        host_levels = get_host_levels(hostname)

        # Embeds handler (always)
        try:
            await page.add_script_tag(content=_get_handler_script("embedsHandler.js"))
        except Exception:
            pass

        # Domain-specific rules
        activated = await _activate_domain_async(page, hostname, host_levels)

        if not activated:
            # Fallback: default click handler
            try:
                await page.add_script_tag(content=_get_handler_script("0_defaultClickHandler.js"))
            except Exception:
                pass
    except Exception:
        pass


def _do_the_magic_for_frame_sync(frame):
    """Handle a single iframe. Replicates onCompleted for frameId > 0."""
    url = frame.url
    if not url or url == "about:blank" or not url.startswith("http"):
        return

    try:
        hostname = clean_hostname(url)
        if not hostname:
            return

        host_levels = get_host_levels(hostname)

        try:
            frame.add_style_tag(content=_get_common_css())
        except Exception:
            pass

        try:
            frame.add_script_tag(content=_get_handler_script("embedsHandler.js"))
        except Exception:
            pass

        activated = _activate_domain_sync(frame, hostname, host_levels)

        if not activated:
            try:
                frame.add_script_tag(content=_get_handler_script("0_defaultClickHandler.js"))
            except Exception:
                pass
    except Exception:
        pass


async def _do_the_magic_for_frame_async(frame):
    """Handle a single iframe (async). Replicates onCompleted for frameId > 0."""
    url = frame.url
    if not url or url == "about:blank" or not url.startswith("http"):
        return

    try:
        hostname = clean_hostname(url)
        if not hostname:
            return

        host_levels = get_host_levels(hostname)

        try:
            await frame.add_style_tag(content=_get_common_css())
        except Exception:
            pass

        try:
            await frame.add_script_tag(content=_get_handler_script("embedsHandler.js"))
        except Exception:
            pass

        activated = await _activate_domain_async(frame, hostname, host_levels)

        if not activated:
            try:
                await frame.add_script_tag(content=_get_handler_script("0_defaultClickHandler.js"))
            except Exception:
                pass
    except Exception:
        pass


def _is_async(obj):
    """Detect if a Playwright object is from the async API."""
    return "async_api" in type(obj).__module__


# --- Route handlers ---

def _route_handler_sync(route):
    request = route.request
    url = request.url
    resource_type = request.resource_type

    if resource_type in ("script", "stylesheet", "xhr", "fetch"):
        referer = request.headers.get("referer", url)
        hostname = clean_hostname(referer)
        host_levels = get_host_levels(hostname) if hostname else []

        if _should_block_url(url, host_levels):
            route.abort()
            return

    route.fallback()


async def _route_handler_async(route):
    request = route.request
    url = request.url
    resource_type = request.resource_type

    if resource_type in ("script", "stylesheet", "xhr", "fetch"):
        referer = request.headers.get("referer", url)
        hostname = clean_hostname(referer)
        host_levels = get_host_levels(hostname) if hostname else []

        if _should_block_url(url, host_levels):
            await route.abort()
            return

    await route.fallback()


# --- Page setup ---

def _build_css_init_script():
    """Build a JS script that injects common.css into the page at document start."""
    import json
    common_css = _get_common_css()
    # JSON.stringify safely escapes the CSS for embedding in JS
    css_json = json.dumps(common_css)
    return f"""(() => {{
        const style = document.createElement('style');
        style.setAttribute('data-idcac', '1');
        style.textContent = {css_json};
        (document.head || document.documentElement).appendChild(style);
    }})();"""


# Cache the built script
_css_init_script = None


def _get_css_init_script():
    global _css_init_script
    if _css_init_script is None:
        _css_init_script = _build_css_init_script()
    return _css_init_script


def _setup_page_sync(page):
    """Set up cookie blocking on a page (sync)."""
    page.add_init_script(_get_css_init_script())

    page.on("domcontentloaded", lambda: _do_the_magic_sync(page))
    page.on("framenavigated", lambda frame: (
        _do_the_magic_for_frame_sync(frame) if frame != page.main_frame else None
    ))


async def _setup_page_async(page):
    """Set up cookie blocking on a page (async)."""
    await page.add_init_script(_get_css_init_script())

    # For async, we need to properly schedule coroutines from event handlers
    def on_domcontentloaded():
        asyncio.ensure_future(_do_the_magic_async(page))

    def on_framenavigated(frame):
        if frame != page.main_frame:
            asyncio.ensure_future(_do_the_magic_for_frame_async(frame))

    page.on("domcontentloaded", on_domcontentloaded)
    page.on("framenavigated", on_framenavigated)


# --- Main API ---

def block_cookie_dialogs(target):
    """
    Block cookie consent dialogs on a Playwright Page or BrowserContext.

    Automatically detects sync vs async Playwright API.
    For async API, await the return value.

    Args:
        target: A Playwright Page or BrowserContext (sync or async)

    Examples:
        # Sync
        block_cookie_dialogs(page)
        page.goto("https://example.com")

        # Async
        await block_cookie_dialogs(page)
        await page.goto("https://example.com")

        # Context-level (all pages)
        block_cookie_dialogs(context)
    """
    if _is_async(target):
        return _block_cookie_dialogs_async(target)
    else:
        return _block_cookie_dialogs_sync(target)


def _block_cookie_dialogs_sync(target):
    is_context = hasattr(target, "new_page")

    if is_context:
        context = target
        context.route("**/*", _route_handler_sync)
        context.on("page", lambda page: _setup_page_sync(page))
        for page in context.pages:
            _setup_page_sync(page)
    else:
        page = target
        page.route("**/*", _route_handler_sync)
        _setup_page_sync(page)


async def _block_cookie_dialogs_async(target):
    is_context = hasattr(target, "new_page")

    if is_context:
        context = target
        await context.route("**/*", _route_handler_async)

        async def on_new_page(page):
            await _setup_page_async(page)

        context.on("page", lambda page: asyncio.ensure_future(on_new_page(page)))

        for page in context.pages:
            await _setup_page_async(page)
    else:
        page = target
        await page.route("**/*", _route_handler_async)
        await _setup_page_async(page)
