# deck.json 스키마

목차: 최상위 · theme · 슬라이드 · 레이아웃 · 타이밍 · 텍스트 스택 요소 · 절대 배치 요소 · 세로 덮어쓰기 · 색

## 최상위

```json
{
  "meta":   { "title": "...", "lang": "ko", "brand": "folio.", "label": "PRODUCT GUIDE — 2026",
              "chrome": true, "portrait": true, "hint": "...", "maxScale": 2 },
  "theme":  { ... },
  "assets": { "images": { "screen": "assets/screen.png" } },
  "models": { "laptop": { "preset": "laptop" } },
  "slides": [ { ... } ]
}
```
- `meta.brand`: 좌상단 로고 텍스트(첫/마지막 장에서는 숨김). `meta.label`: 우상단 라벨.
- `meta.chrome`: `false`면 로고·라벨·페이지번호·점 전부 끔. 객체로 일부만: `{"dots": false}`.
- `meta.portrait: false` → 세로 화면에서도 가로판을 레터박스로 표시.
- 경로는 deck.json 기준 상대경로. 이미지는 png/jpg/webp/svg.

## theme (모두 선택)

```json
{
  "ink": "#1E1B2E", "paper": "#F4EEE3", "paper2": "#FBF7F0", "accent": "#C23A3C", "letterbox": "#1E1B2E",
  "palette": { "tomato": "#EF5B3F", "butter": "#F5D25E", "sage": "#A9C49A", "sky": "#A8CBEA", "lilac": "#C8B6E6",
               "pink": "#F5B6C1", "cobalt": "#2E45B8", "peach": "#F7BFA0", "mint": "#BFE3D0" },
  "fonts": { "display": { "family": "DM Sans" }, "body": { "family": "Noto Sans KR" } },
  "fps": 12, "jitter": 1, "boil": false, "motion": "full", "paperTexture": 0.9,
  "transition": "paper", "transitionDur": 0.45,
  "toon": { "steps": [90, 170, 255], "outline": 5.5, "light": 2.3, "ambient": 0.9 }
}
```
- palette는 기본값에 **병합**된다(추가만 하면 됨).
- fonts: Google Fonts 이름이면 빌드 때 사용 글자만 받아온다. 로컬 파일: `{"family":"Pretendard","files":{"500":"fonts/Pretendard-Medium.otf","700":"fonts/Pretendard-Bold.otf"}}` (fontTools로 서브셋). display 폰트에 한글이 없으면 자동으로 body 폰트로 폴백.
- `boil`: **기본 `false`** — 선·블롭·3D 외곽선·종이 결이 프레임마다 떨리지 않는다(손그림 모양은 유지). `true`면 12fps line boil(셀 애니메이션식 떨림)을 켠다. 쇼케이스·홍보용.
- `jitter`: 손그림 불규칙함의 세기(0=매끈, 1=기본, 2=과장). `boil:true`일 때는 떨림 폭이기도 하다.
- `motion`: **등장이 끝난 뒤의 모든 잔움직임을 한 번에 조절**(선 떨림, 3D 외곽선 일렁임, 모델 부유·흔들림, 해/꽃 스티커 회전, 종이 결 이동). 등장 애니메이션은 영향 없음.

  | 값 | 효과 | 쓰임 |
  |---|---|---|
  | `full` (기본) | 모델 부유·스티커 회전 그대로(떨림은 `boil`이 따로 결정) | 기본 |
  | `calm` | 떨림 절반, 모델 부유 35% | 강의·설명 영상 |
  | `still` | 등장 후 완전 정지(손그림 형태는 유지) | 오래 머무는 화면, 인쇄용 캡처 |
  | `0`~`1` | 잔움직임 크기만 비율로(떨림은 `jitter`로 따로) | 미세 조정 |

  `rain`(계속 떨어지는 장식)은 그 자체가 움직임이라 `motion`과 무관하다. 정지 화면이 필요하면 rain을 빼거나 `count`를 줄인다.
- `transition`: `paper` | `fade` | `none`.

### theme.type — 글자 크기·간격·서브텍스트 등장 (타이포 스케일)

모든 값은 가로 1920×1080 기준 px. 생략한 키는 기본값(원래 모습)을 쓴다. 강의 템플릿 세트(`templates/lecture/_set.json`)는 교육용 값을 넣는다.

| 키 | 기본 | 강의 세트 | 대상 |
|---|---|---|---|
| `kicker` | 22 | 28 | 제목 위 영문 라벨 |
| `body` / `bodyLh` | 32 / 1.6 | 40 / 1.8 | 본문 크기 / 줄 간격 배수 |
| `bullet` / `bulletLh` | 32 / 1.75 | 40 / 2.0 | 목록 |
| `caption` / `captionLh` | 28 / 1.5 | 32 / 1.6 | 카드 설명, 흐름도 보조 문구 |
| `cardTitle` | 40 | 44 | 카드 제목 |
| `quoteBy`, `calloutSub` | 28, 19 | 34, 24 | 인용 출처, 콜아웃 보조 라벨 |
| `gapTitle`, `gapBody` | 40, 44 | 60, 56 | 제목→다음 블록, 본문→다음 블록 간격 |
| `subAnim` | `rise` | `lift` | 서브텍스트 등장 방식(`lift` = 페이드+살짝 상승, 클립 없음) |
| `subStagger`, `bulletStagger`, `subDur` | .12, .16, .45 | .22, .4, .6 | 줄/항목 간 지연, 한 줄 등장 시간(초) |
| `overlap` | .55 | .85 | 앞 블록 진행률 몇 %에서 다음 블록 시작 |

- 본문·카드·흐름도 문구는 **균형 줄바꿈**: 줄 수는 그대로, 마지막 줄에 단어 하나만 남지 않게 폭을 맞춘다.
- `meta.minText`(강의 세트 28): QA가 이보다 작은 텍스트를 WARN (페이지 번호 등 chrome은 18 기준).
- 폰트: `theme.fonts`. 파이프라인에서는 `project.json`의 `"font"`(기본 강의 세트 `Noto Sans KR`) 하나로 제목·본문·영문 라벨을 모두 같은 Google Fonts 고딕으로 맞춘다. 예: `"Noto Sans KR"`, `"IBM Plex Sans KR"`, `"Gothic A1"`, `"Nanum Gothic"`.
- `fps`: 기본 12. 강의는 `project.json`의 `"fps": 24` 권장(렌더·싱크·전환이 모두 이 값을 따른다).

## 슬라이드

```json
{ "layout": "text-left", "bg": "peach", "textY": null, "textStart": 0.25, "chrome": true, "elements": [ ... ] }
```
- `bg`: 색(팔레트 키/테마 키/hex).
- `textY`: 텍스트 스택 시작 y를 고정(기본은 세로 중앙 정렬). `textStart`: 첫 텍스트 등장 시각.
- `duration`: 슬라이드 길이(초)를 고정. 생략하면 마지막 요소 종료 + 0.25s. 내레이션 덱에서는 `sync.py`가 음성 길이로 채운다.
- `narration`: 이 슬라이드의 내레이션 대본(문자열 또는 문자열 배열). 아래 "내레이션과 큐" 참고. 빌드·렌더에는 영향 없고 `sync.py`만 읽는다.

## 레이아웃

| layout | 가로: 텍스트 컬럼 / 비주얼 영역 | 쓰임 |
|---|---|---|
| `text-left` (기본) | x120 w760 / 오른쪽 880–1920 | 기능 설명, 콜아웃 |
| `text-right` | x1060 w760 / 왼쪽 0–1000 | 리듬 바꾸기 |
| `hero` | x140 w860, 제목 기본 120px / 오른쪽 | 표지 |
| `center` | 가운데 정렬 w1400 / 전체 | 인용, 엔딩 |
| `top` | 상단 가운데 / 아래 330–1080 | 비교, 색상 라인업 |
| `full` | 텍스트 스택 없음 / 전체 | 비주얼만 (텍스트는 x,y 지정) |

세로(1080×1920)에서는 텍스트가 상단(y≈210부터, center는 세로 중앙), 비주얼 영역은 하단으로 **비율 유지** 축소 이동한다.

## 타이밍 (자동, 필요할 때만 덮어씀)

- 모든 요소: `at`(시작 초), `dur`(길이 초). 생략하면 자동.
- 자동 순서: 배경 단계(blob/model/image/rain/halftone, 0.02s부터 0.06s 간격) → 텍스트 스택(0.25s부터, 앞 블록의 55% 지점에서 다음 시작) → 장식(텍스트가 거의 끝날 때부터 0.14s 간격) → 콜아웃(1.0s부터 0.22s 간격).
- 슬라이드 길이는 마지막 요소 종료 + 0.25s. 이후에도 모델 부유·스티커 떨림은 계속된다.

## 텍스트 스택 요소 (좌표 없이 쓰면 컬럼에 순서대로 쌓임)

공통: `color`, `gap`(다음 블록과 간격 px), `at`, `dur`. `x`,`y`를 주면 절대 배치(y는 블록 **상단**), 이때 `w`(줄바꿈 폭, 기본 700), `align`.

| type | 필드 | 기본 |
|---|---|---|
| `kicker` | `text`, `size` 22, `track` 8, `anim` rise | 섹션 번호·영문 라벨 |
| `title` | `lines`[] 또는 `text`(자동 줄바꿈), `accent`: 줄 인덱스(들) → accent 색, `mark`: `squiggle`\|`underline`\|`circle`(accent 줄에), `markColor`, `size` 84(hero 120), `weight` 700, `role` body\|display, `track` 1, `lh` 1.24, `anim` wipe\|pop\|rise\|fade | |
| `body` | `lines`[] 또는 `text`, `size` 32, `lh` 1.6, `alpha` .88, `maxWidth` | 줄마다 0.12s 간격 rise |
| `bullets` | `items`[], `bullet`(스티커 이름, sparkle), `bulletColor`, `size` 32 | |
| `stats` | `items`: [{`label`,`value`,`unit`,`color`}], `size` 150 | 값은 글자별 pop. 폭이 넘치면 자동 축소 |
| `specs` | `rows`: [[키, 값], ...], `size` 26, `rowHeight` 66, `keyWidth` .3 | 행마다 손그림 밑줄 |
| `quote` | `text`/`lines`, `by`, `size` 56 | |
| `chips` | `items`[], `colors`[] | 블롭 모양 태그 |
| `text` | `text`/`lines`, `size`, `weight`, `role`, `anim`, `align`, `track`, `alpha` | 범용 |
| `spacer` | `h` | 여백 |

`anim`: `wipe`(좌→우 클립) · `rise`(아래서 올라옴) · `pop`(글자별 튕김) · `fade` · `none`.

## 절대 배치 요소 (가로 1920×1080 좌표)

| type | 필드 (기본값) | 단계 |
|---|---|---|
| `blob` | `x`,`y`, `r` 또는 `rx`/`ry`, `color` butter, `seed`, `enter`: grow\|left\|right\|up\|down\|none, `shadow` .12, `outline`, `wobble` .025, `layer` back | back |
| `model` | `model`(models 키), `id`(콜아웃 대상이면 필수), `x`,`y`, `height` px(모델 bbox 높이 기준; `fit:"width"`면 폭), `rot` [x,y,z] **도**, `rotFrom`(등장하며 회전), `enter`: rise\|drop\|left\|right\|pop\|none, `float` 12px, `sway` 4°, `spin` °/s, `seed`(부유 위상), `colors` {파트: 색}, `textures` {파트: 이미지키 또는 {"gradient":[...]}}, `pin`(이 앵커를 x,y에 고정), `shadow`(망점 그림자) | back(3d) |
| `image` | `src`(assets 키), `x`,`y`(중심), `w`, `h`, `rot`°, `frame`: sticker\|polaroid\|none, `radius` 18, `enter`: pop\|rise\|fade\|left\|right | back |
| `sticker` | `shape`: star\|sparkle\|cloud\|sun\|moon\|heart\|feather\|dot\|flower, `x`,`y`, `size` 40, `color`, `rot`°, `seed` | decor |
| `squiggle` | `x`,`y`,`w` 300,`amp` 12,`waves` 3,`width` 6,`color` accent | decor |
| `underline` | `x`,`y`,`w`,`width` 7,`color` | decor |
| `scribble` | `target`(아래 참조) 또는 `x`,`y`; `r` 80, `color` | decor |
| `arrow` | `from` [x,y], `to` [x,y], `bend` .2, `color`, `width` | decor |
| `callout` | `target`, `label`, `sub`(영문 소문자 라벨 권장), `dx` -220, `dy` -160(라벨 위치 = 대상 + dx,dy), `align`(자동: dx<0이면 right), `ring` 반지름(대상에 동그라미), `ringColor`, `size` 30 | callout |
| `halftone` | `x`,`y`,`rx`,`ry`,`alpha` | back |
| `rain` | `shapes`[], `colors`[], `count` 14, `zone` [x,y,w,h] | back(계속 내림) |
| `custom` | `code`: JS 문자열 → `references/extending.md` | decor |

`target`: `{"model": "<model 요소 id>", "anchor": "PortUSB1", "dx": 0, "dy": 0}` 또는 `[x, y]`.
`anchor` 대신 `"point": [x,y,z]`(모델 로컬 좌표)도 가능. 앵커 이름은 `capture.py --anchors`.

`layer`(blob/image/sticker 등): `back`(3D 뒤) | `front`(3D 앞).

## 내레이션과 큐 (TTS 싱크)

```json
{ "layout": "text-right", "narration": "무게는 [[w]]{1.2kg|일 점 이 킬로그램}, 두께는 [[t]]{13.9mm|십삼 점 구 밀리미터}입니다.",
  "elements": [ { "type": "stats", "at": "@w", "items": [ ... ] },
                { "type": "sticker", "shape": "feather", "x": 860, "y": 860, "at": "@t+0.3" } ] }
```
- `[[이름]]`: 큐. 바로 다음 단어를 **말하기 시작하는 시각**.
- `{표기|읽기}`: 자막에는 `표기`, TTS는 `읽기`를 읽는다. 숫자·단위·영문 약어에 쓴다(`{USB-C|유에스비 씨}`).
- 요소의 `at`: `"@w"`, `"@w+0.2"`, `"@w-0.3"`. 내장 큐 `@start`(목소리 시작), `@end`(목소리 끝).
- 요소의 `dur`: `"@t"` → 큐 t까지 지속(`t - at`으로 변환).
- 텍스트 스택에서 한 요소에만 `at`을 주면 뒤 요소들은 그 시각을 기준으로 자동으로 이어진다.
- 큐가 남은 deck.json은 `build.py`가 거부한다 → `scripts/sync.py`가 만드는 `*.resolved.json`을 빌드한다.
- 한 요소 안의 항목(예: stats의 값 2개)을 따로 큐에 맞출 수는 없다. 따로 맞추려면 요소를 나눈다.

## 세로 덮어쓰기 `p`

자동 매핑이 어색한 요소만:
```json
{ "type": "callout", "target": {"model":"side","anchor":"PortUSB1"}, "label": "USB-C", "dx": -230, "dy": 190,
  "p": { "dx": 180, "dy": -330 } }
```
`p`의 키는 세로에서 그대로 덮어쓴다. `p.x`/`p.y`는 세로 캔버스(1080×1920) 절대 좌표. 슬라이드의 `p.textY`도 가능.

## 색

어디서나: 팔레트 키(`butter`), 테마 키(`ink` `paper` `paper2` `accent`), 또는 CSS 색(`#hex`, `rgb()`).
