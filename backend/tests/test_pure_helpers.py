"""Pure-function unit tests — no FastAPI app boot, no DB, no heavy ML imports.

Tests here exercise helpers that have no side effects or external dependencies.
They run in < 1 second total.
"""
import pytest


# ─── safe_header ──────────────────────────────────────────────────────────────

def test_safe_header_strips_emojis():
    from main import safe_header
    # ✅ U+2705 — outside Latin-1, must be removed
    assert safe_header("✅ done") == "done"


def test_safe_header_keeps_ascii():
    from main import safe_header
    assert safe_header("hello world 123") == "hello world 123"


def test_safe_header_empty_returns_ok():
    from main import safe_header
    # If all chars stripped, function returns "ok" so the header is never empty
    assert safe_header("✅🎉") == "ok"


def test_safe_header_strips_uzbek_cyrillic():
    from main import safe_header
    # ў (U+045E) and ҳ (U+04B3) are > 256 — must be stripped
    result = safe_header("ўқиш ҳақида")
    assert all(ord(c) < 256 for c in result)


def test_safe_header_handles_non_string():
    from main import safe_header
    assert safe_header(42) == "42"
    assert safe_header(None) == "None"


# ─── _detect_lang_quick (readtime helper) ─────────────────────────────────────

def test_detect_lang_english():
    from main import _detect_lang_quick
    assert _detect_lang_quick("Hello world, this is plain English text.") == "en"


def test_detect_lang_russian_cyrillic():
    from main import _detect_lang_quick
    assert _detect_lang_quick("Привет мир, это русский текст для проверки.") == "ru"


def test_detect_lang_chinese():
    from main import _detect_lang_quick
    # Long enough CJK text so the 30% threshold is crossed
    assert _detect_lang_quick("这是中文测试文本，用于检测语言。" * 3) == "zh"


def test_detect_lang_empty_defaults_to_en():
    from main import _detect_lang_quick
    assert _detect_lang_quick("") == "en"


# ─── _parse_schedule ──────────────────────────────────────────────────────────

def test_parse_schedule_basic():
    from main import _parse_schedule
    result = _parse_schedule("Dushanba: Matematika 8:00, Fizika 10:00")
    assert len(result) == 1
    day, lessons = result[0]
    assert day.lower().strip() == "dushanba"
    assert len(lessons) == 2
    # Each lesson is (num, subject, time_str)
    subjects = [l[1] for l in lessons]
    times    = [l[2] for l in lessons]
    assert any("Matematika" in s for s in subjects)
    assert "8:00" in times
    assert "10:00" in times


def test_parse_schedule_multiple_days():
    from main import _parse_schedule
    text = (
        "Dushanba: Algebra 9:00\n"
        "Seshanba: Ingliz tili 10:30\n"
        "Chorshanba: Tarix 14:00\n"
    )
    result = _parse_schedule(text)
    assert len(result) == 3
    days = [d.lower().strip() for d, _ in result]
    assert "dushanba" in days
    assert "seshanba" in days
    assert "chorshanba" in days


def test_parse_schedule_empty():
    from main import _parse_schedule
    assert _parse_schedule("") == []
    assert _parse_schedule("   \n\n   ") == []


# ─── _translit_ltr / _translit_rtl ────────────────────────────────────────────

def test_translit_ltr_uzbek_latin_to_cyrillic():
    from main import _translit_ltr
    # Basic Latin → Cyrillic transliteration
    result = _translit_ltr("salom")
    # "salom" → "салом" (specific letters may vary by implementation)
    assert len(result) >= 5
    assert any("Ѐ" <= c <= "ӿ" for c in result)


def test_translit_rtl_cyrillic_to_latin():
    from main import _translit_rtl
    result = _translit_rtl("салом")
    # → should produce Latin output
    assert any("a" <= c.lower() <= "z" for c in result)
    assert not any("Ѐ" <= c <= "ӿ" for c in result)


# ─── _READTIME_WPM constants ──────────────────────────────────────────────────

def test_readtime_wpm_table_has_expected_languages():
    from main import _READTIME_WPM
    for lang in ("en", "ru", "uz", "zh", "ja", "ar"):
        assert lang in _READTIME_WPM, f"missing lang in WPM table: {lang}"
        assert _READTIME_WPM[lang] > 0


def test_readtime_cjk_uses_chars_not_words():
    """CJK languages count chars/min, not words/min — verify table values are realistic."""
    from main import _READTIME_WPM, _CJK_LANGS
    for lang in _CJK_LANGS:
        # Chars/min for CJK is typically > 200 (vs ~250 words/min for English)
        assert _READTIME_WPM[lang] >= 200


# ─── _SCHEDULE_DAY_IDX mapping ────────────────────────────────────────────────

def test_photo3x4_formal_crop_keeps_shoulder_room():
    from main import _photo3x4_crop_rect

    face = {
        "bbox": (400, 220, 220, 260),
        "keypoints": {"left_eye": (460, 310), "right_eye": (560, 310)},
    }
    formal = _photo3x4_crop_rect(1200, 1600, face, "formal")
    tight = _photo3x4_crop_rect(1200, 1600, face, "tight")

    formal_w, formal_h = formal[2] - formal[0], formal[3] - formal[1]
    tight_h = tight[3] - tight[1]
    assert formal_h > tight_h
    assert abs((formal_w / formal_h) - 0.75) < 0.02


def test_photo3x4_face_maps_into_output_frame():
    from main import _map_face_to_crop

    face = {"bbox": (400, 220, 220, 260), "keypoints": {}, "detector": "test"}
    mapped = _map_face_to_crop(face, (300, 120, 750, 720), (354, 472))
    x, y, w, h = mapped["bbox"]

    assert 0 <= x < 354
    assert 0 <= y < 472
    assert w > 0 and h > 0


def test_schedule_day_idx_all_uzbek_days():
    from main import _SCHEDULE_DAY_IDX
    # Dushanba=0 (Monday) ... Yakshanba=6 (Sunday)
    assert _SCHEDULE_DAY_IDX["dushanba"]  == 0
    assert _SCHEDULE_DAY_IDX["juma"]      == 4
    assert _SCHEDULE_DAY_IDX["yakshanba"] == 6


def test_schedule_day_idx_english_mirror():
    from main import _SCHEDULE_DAY_IDX
    assert _SCHEDULE_DAY_IDX["monday"] == _SCHEDULE_DAY_IDX["dushanba"]
    assert _SCHEDULE_DAY_IDX["sunday"] == _SCHEDULE_DAY_IDX["yakshanba"]
