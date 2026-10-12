# 확장하기

순서: (1) 기존 요소 조합 → (2) `custom` 요소 → (3) 런타임에 정식 요소 추가.
덱 하나에서만 필요한 표현은 (2)에서 멈춘다. 두 번째 덱에서도 필요하면 (3)으로 올린다.

## custom 요소

```json
{ "type": "custom", "at": 1.2, "dur": 0.8, "code": "const {S, fill, stroke, blobPath, jit, E} = md; const r = 60*E.outBack(p); if (r<=0) return; const b = blobPath(el.cx, el.cy, r, r, 9); fill(b, 'mint'); stroke(b, 4);", "cx": 1500, "cy": 300 }
```
- 함수 시그니처: `(md, el, t, p)` — `md`는 런타임 API, `el`은 이 요소 JSON(임의 필드 추가 가능), `t`는 슬라이드 시간(12fps로 양자화), `p`는 at~at+dur 진행률 0~1.
- 좌표는 논리 좌표(가로 1920×1080 / 세로 1080×1920). `md.S.portrait`, `md.S.W`, `md.S.H`로 분기.
- 세로 자동 매핑은 custom 요소에 적용되지 않는다(직접 분기).
- 텍스트를 그리면 `md.text(...)`를 쓴다 → QA가 박스를 인식한다. `ctx.fillText` 직접 호출은 QA 사각지대.

### md API 요약

| 범주 | 함수 |
|---|---|
| 상태 | `S` (ctx, W, H, portrait, tick, theme, images, models), `color(key)` |
| 수학 | `clamp`, `lerp`, `prog(t,a,b)`, `quant(t)`, `E.outBack/outExpo/outCubic/inOutCubic/outElastic`, `hash`, `jit(a,b,amp)`(12fps 손떨림), `mulberry(seed)` |
| 경로 | `blobPath(x,y,rx,ry,seed,amt,n)`, `smoothClosed(pts)`, `trimPath(pts,p)` → [Path2D, end], `fill(path,c)`, `stroke(path,w,c)`, `sticker(path,c,{shadow,dx,dy})`, `withT(x,y,rot,scale,fn)`, `inkA(alpha)` |
| 텍스트 | `font(role,size,weight)`, `text(str,x,y,opt)`, `animText(kind,str,x,y,p,opt)`, `wrap(str,font,maxW)`, `measure(str,font)` |
| 장식 | `STICKERS.star/sparkle/cloud/sun/moon/heart/feather/dot/flower(x,y,size,seed,color,scale,rot)`, `squiggle`, `underline`, `scribble`, `arrow`, `leader`, `halftone` |

손그림 느낌의 핵심 규칙: 모든 좌표 흔들림은 `jit(seed, index, amp)`로 만든다(`Math.random` 금지 — 캡처가 비결정적이 되고 boil이 깨진다).

## 런타임에 정식 요소 추가

```
runtime/src/
  core.js         상태, 이징, 해시/jit, blob/trim/sticker 경로
  text.js         폰트 체인, 측정, 줄바꿈, wipe/rise/pop/fade
  shapes.js       STICKERS + 선 장식
  elements.js     LAYOUTS, BLOCKS(텍스트 스택), RENDER(절대 요소), 자동 타이밍, drawSlide
  three-layer.js  툰/외곽선 셰이더, 도형 빌더, GLB, place/project
  presets.js      phone/laptop 도형 정의
  main.js         부팅, 해상도, 종이 질감, chrome, 전환, 입력, window.__md(캡처 API)
```

- **스티커 추가**: `shapes.js`의 `STICKERS`에 `(x,y,r,seed,c,sc,rot)` 함수 추가 → `build.py`의 `STICKERS` 집합에도 이름 추가.
- **절대 요소 추가**: `elements.js`의 `RENDER`에 `{phase:'back'|'decor'|'callout', layer, dur, draw(el,t,p,item)}` 추가. 크기 필드 이름이 `SIZE_KEYS`에 있으면 세로 매핑 때 같이 축소된다. 텍스트를 그리면 `text()`/`animText()` 사용. `build.py`의 `ABS`/`REQUIRED`에 등록.
- **텍스트 블록 추가**: `BLOCKS`에 `(el,x,y,cw,align,ctx) → {h, dur, draw(t,p,local)}`. `h`가 정확해야 스택이 안 겹친다. `GAP`, `build.py`의 `STACK`에 등록.
- **프리셋 추가**: `presets.js`에 `{shapes, anchors}` 반환 함수. `build.py`의 `PRESETS`에 등록.
- **레이아웃 추가**: `LAYOUTS`에 `{L:{col,vis,align,valign}, P:{...}}`. `build.py`의 `LAYOUTS`에 등록.

재빌드:
```bash
cd runtime && npm install && npm run build   # dist/motion-deck.js 갱신
```
그다음 `examples/folio`를 빌드 + `capture.py --qa --portrait`로 회귀 확인(ERROR 0, 시트 육안 비교).
