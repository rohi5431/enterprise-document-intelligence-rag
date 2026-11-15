"""
app/config.py — Convenience re-export shim
===========================================
All application code should import from ``app.core.config``.
This module exists as a top-level alias for tooling / legacy compatibility.
"""

from app.core.config import Settings, get_settings, settings  # noqa: F401

__all__ = ["Settings", "get_settings", "settings"]
