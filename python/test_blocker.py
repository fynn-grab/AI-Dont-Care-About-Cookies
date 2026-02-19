"""
Test: Cookie dialog blocking on 20+ websites
Run: python test_blocker.py
"""

import os
import sys
from pathlib import Path

# Add parent so we can import the package
sys.path.insert(0, str(Path(__file__).parent))

from playwright.sync_api import sync_playwright
from playwright_cookie_blocker import block_cookie_dialogs

TEST_URLS = [
    # Google & co
    "https://www.google.com",
    "https://www.youtube.com",
    # Social media
    "https://www.linkedin.com",
    "https://www.instagram.com",
    "https://www.reddit.com",
    # News / EU
    "https://www.bbc.com",
    "https://www.reuters.com",
    "https://www.spiegel.de",
    "https://www.lefigaro.fr",
    # E-commerce
    "https://www.amazon.de",
    "https://www.ebay.de",
    "https://www.booking.com",
    # Tech
    "https://stackoverflow.com",
    "https://github.com",
    # Streaming
    "https://www.spotify.com",
    "https://www.twitch.tv",
    # Various EU / GDPR heavy
    "https://www.theguardian.com",
    "https://www.lemonde.fr",
    "https://www.zeit.de",
    "https://www.orf.at",
    "https://www.nytimes.com",
]


def run_tests():
    screenshot_dir = Path(__file__).parent.parent / "screenshots" / "python"
    screenshot_dir.mkdir(parents=True, exist_ok=True)

    results = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            bypass_csp=True,
            locale="de-DE",
            timezone_id="Europe/Berlin",
        )

        for url in TEST_URLS:
            page = context.new_page()
            domain = url.replace("https://", "").replace("http://", "").replace("www.", "").split("/")[0]
            status = "OK"

            try:
                print(f"Testing: {url}")

                block_cookie_dialogs(page)
                page.goto(url, wait_until="load", timeout=30000)

                # Wait for click handlers
                page.wait_for_timeout(3000)

                screenshot_path = str(screenshot_dir / f"{domain}.png")
                page.screenshot(path=screenshot_path)

                print(f"  -> Screenshot saved: {screenshot_path}")
            except Exception as e:
                status = f"ERROR: {str(e)[:80]}"
                print(f"  -> Error: {str(e)[:120]}")
            finally:
                results.append({"url": url, "domain": domain, "status": status})
                page.close()

        browser.close()

    # Print summary
    print("\n--- Test Summary ---")
    ok_count = sum(1 for r in results if r["status"] == "OK")
    print(f"Total: {len(results)}")
    print(f"Success: {ok_count}")
    print(f"Errors: {len(results) - ok_count}")
    print()
    for r in results:
        mark = "PASS" if r["status"] == "OK" else "FAIL"
        print(f"  {mark} {r['domain']} - {r['status']}")


if __name__ == "__main__":
    run_tests()
