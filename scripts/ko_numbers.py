"""Spell out every number in Korean for TTS (captions keep the digits).

Rules
- counters read with NATIVE numerals (1–99): 시(clock) 시간 개 명 번 가지 살 곳 권 장 잔 마리 대 달 줄 군데 사람 …
    9시 → 아홉 시 · 8시간 → 여덟 시간 · 3가지 → 세 가지 · 20개 → 스무 개 · 1번째 → 첫 번째
  100 and above always Sino:  240시간 → 이백사십 시간
- everything else is SINO:  15인 → 십오 인 · 2회 → 이 회 · 6주 → 육 주 · 2026년 → 이천이십육 년 · 30일 → 삼십 일
- months: 6월 → 유월, 10월 → 시월;  dates 11/30(월) → 십일월 삼십일 월요일
- ranges: 2~3번 → 두세 번 · 2~3회 → 이삼 회 · 1–7주차 → 일 주차에서 칠 주차
- decimals / units: 1.2kg → 일 점 이 킬로그램 · 25% → 이십오 퍼센트 · 13.9mm → 십삼 점 구 밀리미터
- clock: 9:30 → 아홉 시 삼십 분 · 9:00 → 아홉 시
"""
import re

D = ["영", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"]
N_TENS = ["", "열", "스물", "서른", "마흔", "쉰", "예순", "일흔", "여든", "아흔"]
N_ONES = ["", "한", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉"]
N_PAIRS = {(1, 2): "한두", (2, 3): "두세", (3, 4): "서너", (4, 5): "네다섯", (5, 6): "대여섯",
           (6, 7): "예닐곱", (7, 8): "일고여덟", (8, 9): "여덟아홉"}
NATIVE = {"시간", "시", "개", "명", "번째", "번", "가지", "살", "곳", "권", "장", "잔", "마리", "대", "달", "줄",
          "군데", "사람", "벌", "켤레", "송이", "그루", "채", "통", "걸음", "바퀴", "차례"}
SINO = {"개월", "주차", "주년", "주", "회", "차", "년", "월", "일", "분", "초", "인", "급", "부", "층", "원", "점", "위", "등",
        "학년", "학기", "강", "장면", "단계", "배", "퍼센트", "도", "세기", "명분"}
UNITS = {"%": "퍼센트", "kg": "킬로그램", "g": "그램", "km": "킬로미터", "m": "미터", "cm": "센티미터", "mm": "밀리미터",
         "GB": "기가바이트", "MB": "메가바이트", "TB": "테라바이트", "KB": "킬로바이트", "℃": "도", "°C": "도", "ml": "밀리리터", "L": "리터"}
WEEK = {"월": "월요일", "화": "화요일", "수": "수요일", "목": "목요일", "금": "금요일", "토": "토요일", "일": "일요일"}
COUNTERS = sorted(NATIVE | SINO, key=len, reverse=True)
UNIT_KEYS = sorted(UNITS, key=len, reverse=True)
_C = "|".join(map(re.escape, COUNTERS)); _U = "|".join(map(re.escape, UNIT_KEYS))
_RANGE = r"\s*[~∼–—]\s*"


def _four(n):
    s = ""
    for val, name in ((1000, "천"), (100, "백"), (10, "십")):
        d = n // val % 10
        if d: s += ("" if d == 1 else D[d]) + name
    return s + (D[n % 10] if n % 10 else "")


def sino(n):
    n = int(n)
    if n == 0: return "영"
    out = ""
    if n >= 10 ** 8: out += sino(n // 10 ** 8) + "억"; n %= 10 ** 8
    if n >= 10 ** 4:
        g = n // 10 ** 4; out += ("" if g == 1 and not out else _four(g)) + "만"; n %= 10 ** 4
    return out + (_four(n) if n else "")


def native(n, modifier=True):
    n = int(n)
    if not 1 <= n <= 99: return sino(n)
    if n == 20 and modifier: return "스무"
    ones = N_ONES[n % 10] if modifier else ["", "하나", "둘", "셋", "넷", "다섯", "여섯", "일곱", "여덟", "아홉"][n % 10]
    return N_TENS[n // 10] + ones


def month(n):
    n = int(n)
    return {6: "유월", 10: "시월"}.get(n, sino(n) + "월")


def with_counter(n, c):
    n = int(n)
    if c == "월": return month(n)
    if c == "번째": return ("첫" if n == 1 else native(n)) + " 번째"
    if c in NATIVE and n < 100: return f"{native(n)} {c}"
    return f"{sino(n)} {UNITS.get(c, c)}"


def _decimal(m):
    whole, frac, unit = m.group(1), m.group(2), m.group(3) or ""
    s = sino(int(whole.replace(",", ""))) + " 점 " + " ".join(D[int(d)] for d in frac)
    return s + (" " + UNITS.get(unit, unit) if unit else "")


def _range(m):
    a, b, c = int(m.group(1)), int(m.group(2)), m.group(3)
    if c in NATIVE and c != "번째" and (a, b) in N_PAIRS: return f"{N_PAIRS[(a, b)]} {c}"
    if c not in NATIVE and c not in ("월",) and b == a + 1 and a < 9: return f"{D[a]}{D[b]} {UNITS.get(c, c)}"
    return f"{with_counter(a, c)}에서 {with_counter(b, c)}"


def _date(m):
    mo, d, w = m.group(1), m.group(2), m.group(3)
    return f"{month(mo)} {sino(d)}일" + (f" {WEEK[w]}" if w else "")


def _clock(m):
    h, mi = int(m.group(1)), int(m.group(2))
    return f"{native(h)} 시" + (f" {sino(mi)} 분" if mi else "")


def spell_numbers(text):
    if not re.search(r"\d", text): return text
    t = re.sub(r"(?<=\d),(?=\d{3}(?!\d))", "", text)                                             # 1,200 -> 1200
    t = re.sub(r"(\d{1,2})/(\d{1,2})(?:\((월|화|수|목|금|토|일)\))?", _date, t)                 # 11/30(월)
    t = re.sub(r"(\d{1,2}):(\d{2})", _clock, t)                                               # 9:30
    t = re.sub(rf"(\d+){_RANGE}(\d+)\s*({_C}|{_U})", _range, t)                               # 2~3번, 1–7주차
    t = re.sub(rf"(\d[\d,]*)\.(\d+)\s*({_U})?", _decimal, t)                                  # 1.2kg
    t = re.sub(rf"(\d+)\s*({_U})(?![A-Za-z])", lambda m: f"{sino(m.group(1))} {UNITS[m.group(2)]}", t)  # 25%
    t = re.sub(rf"(\d+)\s*({_C})", lambda m: with_counter(m.group(1), m.group(2)), t)         # 9시, 15인
    t = re.sub(r"\d+", lambda m: sino(m.group(0)), t)                                         # bare numbers
    t = re.sub(r"\((월|화|수|목|금|토|일)\)", lambda m: " " + WEEK[m.group(1)], t)              # 20일(금)
    t = re.sub(rf"(?<=[가-힣]){_RANGE}(?=[가-힣])", "에서 ", t)                                  # 요일–이월 -> 에서
    return re.sub(r"[ \t]{2,}", " ", t)


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    tests = ["오전 9시부터 오후 7시 사이, 하루 8시간 기준", "6주 240시간 이상, 연속 30일", "11/30(월)–2/19(금)",
             "11월 20일(금)까지", "1–7주차 온라인 강의, Zoom 2회", "인가 정원 15인 이상, 보육교사 1급", "반복은 2~3번", "2~3회",
             "무게는 1.2kg, 두께 13.9mm", "점유율 25%", "2026년 6월 10일", "평가서 원본 1부·확인서 원본 2부", "20개, 21명, 3가지",
             "1번째와 2번째", "9:30 회의", "1,200원", "3일간 기록", "10월 1일"]
    for s in tests: print(f"{s:34} → {spell_numbers(s)}")
