# 디자인 플레이북

목차: 디자인 언어 · 덱 구성 · 레시피 9종 · 배치 규칙 · 대비 · 카피

## 디자인 언어 (이 스타일이 왜 그렇게 보이는가)

1. **크림 종이 + 잉크 한 색**: 배경은 paper 또는 파스텔 1색, 선과 글자는 ink. 강조는 accent(빨강) 하나뿐.
2. **스티커 레이어**: 블롭·도형은 평평한 색 + 오른쪽 아래 그림자. 그라데이션 없음.
3. **12fps 손떨림**: 정지 화면도 계속 미세하게 살아 있다. 그래서 요소를 더 움직일 필요가 없다.
4. **3D는 일러스트처럼**: 3단계 셀 셰이딩 + 굵은 외곽선. 화면(스크린)은 조명 없는 그림.
5. **안무는 배경 → 오브젝트 → 제목 → 본문 → 숫자 → 장식 → 주석** 순서로 2.5초 안에 끝난다.

## 덱 구성 (6~10장)

`cover → (feature ×3~5) → compare 또는 colors → specs → ending`.
feature 사이에서 `text-left` / `text-right`와 배경색을 번갈아 리듬을 만든다. 같은 배경색을 연속으로 쓰지 않는다.
슬라이드 번호 키커는 `"01 — LÉGER"`처럼 번호 + 짧은 영문/불문 라벨이 이 스타일에 잘 맞는다.

## 레시피

각 조각은 `elements` 배열 안에 넣는다. 좌표는 그대로 써도 되는 검증된 값이다.

### 1. cover (layout: hero, bg: paper)
```json
{ "type": "blob", "x": 1420, "y": 560, "r": 400, "color": "sky", "enter": "right" },
{ "type": "blob", "x": 160, "y": 1060, "rx": 420, "ry": 240, "color": "butter", "enter": "left" },
{ "type": "model", "id": "hero", "model": "laptop", "x": 1420, "y": 600, "height": 560, "rot": [22,-28,0], "rotFrom": [22,-120,0], "shadow": true },
{ "type": "kicker", "text": "LE CARNET NUMÉRIQUE" },
{ "type": "title", "lines": ["brand."], "role": "display", "size": 220, "track": -8, "anim": "pop" },
{ "type": "title", "lines": ["한 줄 정의"], "size": 60, "accent": 0, "mark": "squiggle" },
{ "type": "sticker", "shape": "star", "x": 1800, "y": 200 }
```
3D가 없으면 model 자리에 `image`(frame: sticker) 또는 큰 블롭 2개 + 스티커.

### 2. feature-stat (text-right, 파스텔 bg)
```json
{ "type": "blob", "x": 500, "y": 560, "r": 380, "color": "butter", "enter": "left" },
{ "type": "model", "id": "m", "model": "laptop", "x": 500, "y": 560, "height": 460, "rot": [8,62,0] },
{ "type": "kicker", "text": "01 — LÉGER" },
{ "type": "title", "lines": ["첫 줄", "강조할 둘째 줄"], "accent": 1 },
{ "type": "body", "text": "두세 줄 설명." },
{ "type": "stats", "items": [ {"label":"무게","value":"1.2","unit":"kg"}, {"label":"두께","value":"13.9","unit":"mm"} ] }
```

### 3. callout-diagram (text-left)
오브젝트 하나에 지시선 2~4개. 라벨은 오브젝트 **바깥**, 위·아래로 번갈아.
```json
{ "type": "model", "id": "side", "model": "laptop", "x": 1340, "y": 560, "height": 430, "rot": [16,66,0], "float": 6, "sway": 1.5 },
{ "type": "callout", "target": {"model":"side","anchor":"PortUSB1"}, "label": "USB-C ①", "sub": "40Gbps", "dx": -230, "dy": 190 },
{ "type": "callout", "target": {"model":"side","anchor":"PortUSB2"}, "label": "USB-C ②", "sub": "DISPLAY OUT", "dx": 240, "dy": 170, "ring": 40 }
```
콜아웃이 많으면 `float`/`sway`를 줄여야 지시선이 덜 흔들린다. 첫 번째(가장 중요한) 콜아웃에만 `ring`.

### 4. screen-showcase (text-left, bg butter)
화면 내용이 주인공. `textures`로 스크린샷을 입히고, 화면 밖으로 튀어나오는 스티커 3개를 `at` 1.4~1.8로.
```json
{ "type": "model", "id": "f", "model": "laptop", "x": 1310, "y": 600, "height": 620, "rot": [10,-8,0], "enter": "pop", "textures": {"Screen":"screen"} },
{ "type": "sticker", "shape": "cloud", "x": 940, "y": 300, "size": 60, "at": 1.4 }
```

### 5. bullets-flow (text-right) — 기능 나열, 2개 오브젝트 관계
`bullets` 3개 + `chips`. 두 모델 사이를 `arrow`로 잇는다.

### 6. colors / lineup (layout: top, bg paper)
같은 모델 3개, `at` 0 / 0.15 / 0.3, `seed` 0 / 1.3 / 2.6(부유 엇박). 이름 라벨은 블롭 **아래**(y≈985), 색 이름을 해당 색으로 쓰되 대비 경고가 나면 ink로.

### 7. specs (text-left, bg paper)
`title` 1줄 + `specs` 4~6행. 오른쪽에 모델을 작게, `float` 4.

### 8. quote (center)
`quote` + `by`. 배경에 큰 블롭 하나, 스티커 1개.

### 9. ending (center, bg paper)
```json
{ "type": "rain", "shapes": ["feather","star","feather","sparkle"], "colors": ["pink","lilac","sky","butter"], "count": 12 },
{ "type": "blob", "x": 960, "y": 1120, "rx": 1100, "ry": 260, "color": "peach", "shadow": 0.08 },
{ "type": "title", "lines": ["brand."], "role": "display", "size": 220, "track": -8, "anim": "pop" },
{ "type": "title", "lines": ["마무리 한 줄"], "size": 60, "accent": 0 },
{ "type": "text", "text": "2026.12 — DÉBUT", "role": "display", "size": 24, "track": 10 }
```

## 배치 규칙

- 비주얼 무게중심은 비주얼 영역 중앙(text-left면 x≈1340, text-right면 x≈480).
- 블롭은 오브젝트 뒤에 1개(크게) + 화면 모서리에 반쯤 잘린 1개. 3개 이상 쓰지 않는다.
- 모델 `height`: 단독 히어로 520~620, 텍스트와 함께 420~480, 3개 나열 280~320.
- 모델 회전은 정면보다 **비스듬히**(y ±20~35°, x 8~25°)가 3D감이 좋다. 측면 기능은 y 60~80°.
- 스티커는 오브젝트 가장자리에 반쯤 겹쳐 "화면 밖으로 나온" 느낌으로 둔다.
- 텍스트 컬럼 안에는 장식을 두지 않는다(겹침 QA에 걸리고 읽기 방해).

## 대비

QA의 contrast는 글자 뒤 **실제 픽셀**로 계산한다. 자주 걸리는 패턴과 해결:
- 진한 블롭(cobalt, tomato) 위의 ink 글자 → 라벨을 블롭 밖으로 빼거나 블롭을 연한 색으로.
- 파스텔 배경 위의 accent(빨강) 제목 → 2.8~3.0 정도로 WARN. 대개 허용. 신경 쓰이면 배경을 paper/peach로.
- 색 이름을 같은 색 계열 블롭 위에 → 라벨을 블롭 아래로.

## 카피 (한국어)

- 제목: 2줄, 줄당 12자 안팎. 둘째 줄이 핵심(accent).
- 본문: 2~3줄, 50~80자. 숫자는 본문에서 빼서 stats로.
- 키커/서브라벨: 영문 대문자는 짧게(2~3단어). 트래킹이 넓어서 길면 지저분해진다.
- 금지: 마케팅 수식어 나열, 한 장에 문장 4개 이상.
