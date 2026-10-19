"""
The common severity scale shared by every alert source.

Alerts carry a 0-15 score (the scale Wazuh uses natively, stored in the
`rule_level` column). Each SIEM connector maps its native severity onto it, so
AI-scan thresholds, statistics, auto-escalation and SOAR severity mapping all
read the same value whatever produced the alert.
"""
from typing import Any, Optional

MIN_SCORE = 0
MAX_SCORE = 15

# Lower bound of each band, highest first
BANDS = (
    (13, "critical"),
    (10, "high"),
    (7, "medium"),
    (4, "low"),
    (0, "info"),
)

# Representative score for a label, used when a source reports words, not numbers
_LABEL_SCORES = {
    "critical": 13, "crit": 13, "fatal": 13, "emergency": 13, "alert": 13,
    "high": 10, "severe": 10, "error": 10, "major": 10,
    "medium": 7, "moderate": 7, "warning": 7, "warn": 7,
    "low": 4, "minor": 4, "notice": 4,
    "info": 2, "informational": 2, "information": 2, "debug": 0, "none": 0,
}


def clamp(score: Any) -> int:
    try:
        return max(MIN_SCORE, min(MAX_SCORE, int(round(float(score)))))
    except (TypeError, ValueError):
        return MIN_SCORE


def label(score: Any) -> str:
    """'info', 'low', 'medium', 'high' or 'critical' for a 0-15 score."""
    s = clamp(score)
    for lower_bound, name in BANDS:
        if s >= lower_bound:
            return name
    return "info"


def from_label(text: Any) -> Optional[int]:
    """Score for a severity word such as 'High' or 'warning'; None if unrecognized."""
    if not isinstance(text, str):
        return None
    return _LABEL_SCORES.get(text.strip().lower())


def from_number(value: Any, scale_max: float) -> int:
    """Rescale a number from a 0..scale_max range onto 0-15."""
    try:
        v = float(value)
    except (TypeError, ValueError):
        return MIN_SCORE
    if scale_max <= 0:
        return clamp(v)
    return clamp(v / scale_max * MAX_SCORE)


def soar_level(score: Any) -> int:
    """1 (low) to 4 (critical), the severity scale used by TheHive and Flowintel."""
    return {"critical": 4, "high": 3, "medium": 2}.get(label(score), 1)
