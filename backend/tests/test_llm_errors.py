"""How an LLM answer ended, as added to the parse errors shown to analysts (app/agents/llm_errors.py)."""
from types import SimpleNamespace

from app.agents.llm_errors import finish_details


def _answer(meta):
    return SimpleNamespace(response_metadata=meta)


def test_cut_answer_reports_the_provider_figures():
    meta = {"finish_reason": "length", "token_usage": {"completion_tokens": 8192, "completion_tokens_details": {"reasoning_tokens": 8192}}}
    assert finish_details(_answer(meta)) == "finish_reason: length, completion_tokens: 8192, reasoning_tokens: 8192"
    # Some providers put reasoning_tokens at the top level of the usage
    meta = {"finish_reason": "length", "token_usage": {"completion_tokens": 4096, "reasoning_tokens": 900}}
    assert finish_details(_answer(meta)) == "finish_reason: length, completion_tokens: 4096, reasoning_tokens: 900"
    assert finish_details(_answer({"finish_reason": "content_filter"})) == "finish_reason: content_filter"


def test_normal_or_unknown_ending_adds_nothing():
    assert finish_details(_answer({"finish_reason": "stop", "token_usage": {"completion_tokens": 300}})) == ""
    assert finish_details(_answer({})) == ""
    assert finish_details(None) == ""
    assert finish_details("plain string answer") == ""
