"""
How an LLM answer ended, added to the parse errors shown in the AI Analysis panel.
"""


def finish_details(response) -> str:
    """
    'finish_reason: length, completion_tokens: 8192, reasoning_tokens: 8192' as reported by the
    provider when the answer did not end normally; '' when it did (or nothing was reported).
    """
    meta = getattr(response, "response_metadata", None) or {}
    finish = meta.get("finish_reason")
    if not finish or finish == "stop":
        return ""
    usage = meta.get("token_usage") or {}
    parts = [f"finish_reason: {finish}"]
    if usage.get("completion_tokens") is not None:
        parts.append(f"completion_tokens: {usage['completion_tokens']}")
    reasoning = (usage.get("completion_tokens_details") or {}).get("reasoning_tokens") or usage.get("reasoning_tokens")
    if reasoning:
        parts.append(f"reasoning_tokens: {reasoning}")
    return ", ".join(parts)
