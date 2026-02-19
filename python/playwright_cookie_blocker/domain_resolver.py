"""Domain resolution and rule lookup - replicates getHostname() and getPreparedTab() from background.js"""

import re
from urllib.parse import urlparse


def clean_hostname(url: str):
    """Extract and clean hostname from URL, stripping www prefix."""
    try:
        if not url.startswith("http"):
            return None
        parsed = urlparse(url)
        hostname = parsed.hostname
        if not hostname:
            return None
        return re.sub(r"^w{2,3}\d*\.", "", hostname, flags=re.IGNORECASE)
    except Exception:
        return None


def get_host_levels(hostname: str) -> list:
    """Get domain hierarchy levels for a hostname."""
    if not hostname:
        return []
    parts = hostname.split(".")
    levels = []
    for i in range(len(parts), 1, -1):
        levels.append(".".join(parts[-i:]))
    return levels


def resolve_rule(hostname: str, host_levels: list, rules: dict):
    """Find the matching rule for a hostname, checking host levels."""
    if hostname in rules:
        return rules[hostname]
    for level in host_levels:
        if level in rules:
            return rules[level]
    return None
