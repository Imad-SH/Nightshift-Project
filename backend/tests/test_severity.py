import pytest

from app.core import severity


@pytest.mark.parametrize("score,label", [
    (0, "info"), (3, "info"), (4, "low"), (6, "low"), (7, "medium"), (9, "medium"),
    (10, "high"), (12, "high"), (13, "critical"), (15, "critical"),
])
def test_bands(score, label):
    assert severity.label(score) == label


def test_clamp_handles_bad_and_out_of_range_values():
    assert severity.clamp(-4) == 0
    assert severity.clamp(99) == 15
    assert severity.clamp("12") == 12
    assert severity.clamp(None) == 0
    assert severity.clamp("not a number") == 0


def test_from_label_understands_common_words():
    assert severity.from_label("Critical") == 13
    assert severity.from_label(" HIGH ") == 10
    assert severity.from_label("warning") == 7
    assert severity.from_label("informational") == 2
    assert severity.from_label("something else") is None
    assert severity.from_label(5) is None


def test_from_number_rescales():
    assert severity.from_number(100, 100) == 15
    assert severity.from_number(50, 100) == 8
    assert severity.from_number(10, 10) == 15
    assert severity.from_number("x", 10) == 0


@pytest.mark.parametrize("score,level", [(15, 4), (13, 4), (12, 3), (10, 3), (9, 2), (7, 2), (6, 1), (0, 1)])
def test_soar_level_follows_the_same_bands(score, level):
    assert severity.soar_level(score) == level
