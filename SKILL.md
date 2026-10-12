---
name: motion-deck
description: 손그림 일러스트 + 툰 셰이딩 3D가 움직이는 단일 파일 HTML 프레젠테이션(모션 덱)을 deck.json만 작성해서 만든다. "HTML 프레젠테이션", "모션 슬라이드", "애니메이션 덱", "제품 소개/가이드 슬라이드", "슬라이드를 영상으로" 같은 요청, 또는 편집용 PPTX가 아니라 보는 맛이 중요한 발표·홍보·쇼케이스 자료를 만들 때 사용. 결과물은 키보드/클릭/스와이프로 넘기는 HTML 한 장(+ 선택적으로 PNG 시트, MP4)이다. 편집 가능한 PowerPoint가 필요하면 이 스킬이 아니라 pptx 계열을 쓴다.
---

# motion-deck

슬라이드를 코드로 짜지 않는다. **deck.json(데이터)만 쓰고**, 렌더링·애니메이션·손떨림·전환·세로 대응·검수는 런타임과 스크립트가 맡는다.

```
brief ─▶ storyboard.md ─▶ deck.json ─▶ build.py ─▶ deck.html ─▶ capture.py --qa ─▶ (고치기 반복) ─▶ 납품
                                                                   └ sheet_L.png / qa.json
```

## 무엇이 자동으로 되는가 (직접 구현하지 말 것)

- 12fps "on twos" 프레임, 손그림 선·종이 질감 multiply (떨림 line boil은 기본 꺼짐, `theme.boil: true`로 켬)
- 텍스트 스택 자동 배치(레이아웃 프리셋)와 등장 순서 자동 안무
- 3D 모델 툰 셰이딩(3단계) + 흔들리는 잉크 외곽선, 3D 지점에 붙는 지시선(callout)
- 찢어진 종이 전환, 키보드/클릭/스와이프/해시(#3) 이동, F 전체화면, R 다시 재생
- 세로 화면(1080×1920) 자동 전환: 텍스트는 상단 컬럼, 비주얼은 하단으로 비율 유지 매핑
- 고해상도(devicePixelRatio) 대응, 덱에 쓰인 글자만 담은 폰트 서브셋

## 워크플로

### 1. Brief → storyboard.md (짧게)

슬라이드 6~10장. 한 장에 메시지 하나. 표로 먼저 합의한다.

| # | 레시피 | 메시지(제목 2줄) | 비주얼 | 강조 |
|---|---|---|---|---|
| 1 | cover | 브랜드 + 한 줄 | 3D/이미지 히어로 | — |
| 2 | feature-stat | 가볍다 | 측면 3D | 숫자 2개 |

레시피 목록과 JSON 조각은 `references/design-playbook.md`. 처음이면 반드시 읽는다.

### 2. deck.json 작성

- 스키마 전체: `references/deck-schema.md` (요소 타입, 필드, 기본 타이밍)
- 출발점: `examples/folio/deck.json`을 복사해서 바꾼다. 빈 파일에서 시작하지 않는다.
- 좌표는 항상 **가로 1920×1080 기준**. 세로는 자동 매핑되며, 어긋나는 요소만 `"p": {...}`로 덮어쓴다.
- 텍스트 요소(kicker/title/body/stats/…)에는 좌표를 주지 않는다 → 레이아웃 컬럼에 자동으로 쌓인다.
- 3D 모델이 필요하면 `references/models.md` (프리셋 phone/laptop, 도형 조합, GLB).

카피 규칙(한국어 기준): 제목 줄당 12자 안팎, 2줄. 본문 2~3줄, 문장은 짧고 평서형. 숫자는 stats로 따로 뺀다.

### 3. 빌드

```bash
python scripts/build.py deck.json -o out/deck.html          # 폰트를 Google Fonts에서 서브셋으로 받음
python scripts/build.py deck.json -o out/deck.html --offline  # 네트워크 없을 때(시스템 폰트)
```
`ERROR`가 나오면 빌드가 멈춘다. 메시지가 가리키는 필드를 고친다(알 수 없는 type, 없는 이미지 키, 콜아웃 대상 id 누락 등).

### 4. 검수 루프 (생략 금지)

```bash
python scripts/capture.py out/deck.html --out out/shots --qa --portrait
```
- `out/shots/sheet_L.png`, `sheet_P.png`를 **직접 열어서 본다**. 숫자만 보고 끝내지 않는다.
- `qa.json` / 콘솔: `ERROR`는 0이 될 때까지 고친다. `WARN`은 판단해서 남겨도 된다.

| 체크 | 의미 | 보통의 해결 |
|---|---|---|
| overlap | 텍스트끼리 겹침(페이지 번호 등 chrome 포함) | callout `dx/dy` 조정, 텍스트 줄이기 |
| offcanvas / margin | 화면 밖 / 가장자리 40px 이내 | 좌표 이동, 세로는 `p` 덮어쓰기 |
| contrast | 글자색 vs 실제 뒤 픽셀 대비(하위 10%) | 블롭 위치·색 변경, 라벨을 블롭 밖으로 |
| small | 18px 미만 | 크기 키우기 |
| runtime | 렌더 중 예외(화면 상단 빨간 띠로도 표시) | 메시지대로 수정(앵커 이름 등) |

모델 앵커 이름은 `python scripts/capture.py out/deck.html --anchors`로 확인한다.
빌드 과정을 보려면 `--timeline 0.4,1.2` (각 시점 프레임 저장).

### (선택) 내레이션 영상

강의·설명 영상처럼 음성에 맞춰 요소가 등장해야 하면:
1. 슬라이드마다 `narration`을 쓰고 등장 시점에 `[[큐]]`를 찍는다. 숫자·영문은 `{표기|읽기}`.
2. 요소의 `at`을 `"@큐"`로 바꾼다. 텍스트 스택은 첫 요소에만 줘도 뒤가 따라온다.
3. 기본값(떨림 없음)으로 충분. 모델 부유도 줄이려면 `theme.motion: "calm"`.
4. `python scripts/sync.py deck.json -o out/narr` → `deck.resolved.json`을 빌드·검수(4단계 그대로).
5. `capture.py ... --video out/lecture.mp4 --audio out/narr/narration.wav --subs out/narr/captions.srt`
6. 영상에서 큐 시점 앞뒤 프레임을 뽑아 실제로 맞는지 본다. `timeline.json` coverage < 0.6이면 대본/읽기 표기를 고친다.

### 5. 납품

- 기본: `deck.html` 한 파일 (오프라인 동작, 외부 요청 없음)
- 요청 시: `--video deck.mp4` (ffmpeg 필요), 시트 PNG, 세로판 PNG

## 하지 말 것

- 런타임 JS를 덱마다 고치지 않는다. 필요한 표현이 없으면 먼저 `custom` 요소(`references/extending.md`)로 해결하고, 반복되면 런타임에 정식 요소로 추가한 뒤 번들을 다시 만든다.
- 텍스트를 이미지로 넣지 않는다(검수·서브셋·세로 대응이 모두 깨진다).
- 한 장에 스티커를 4개 넘게 뿌리지 않는다. 장식은 메시지를 가리키는 데만 쓴다.
- 대비 경고를 무시하고 진한 블롭 위에 진한 글자를 두지 않는다.

## 파일

- `runtime/dist/motion-deck.js` — 빌드된 런타임(Three.js 포함). `runtime/src/` 소스, 재빌드는 `references/extending.md`
- `scripts/build.py`, `scripts/capture.py`, `scripts/sync.py`(TTS 싱크)
- `references/deck-schema.md` · `design-playbook.md` · `models.md` · `extending.md` · `pipeline.md`(멀티에이전트 구성)
- `examples/folio/` — 8장 예제(모든 요소 타입 사용) · `examples/lecture/` — 내레이션·큐 예제
