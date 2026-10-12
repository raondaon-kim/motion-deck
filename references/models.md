# 3D 모델

3가지 방법. 어떤 방법이든 모델은 bbox 중심이 원점으로 정렬되고, 툰 셰이딩 + 잉크 외곽선이 자동 적용된다.
단위 권장: 1 unit = 10mm(실측 비율을 지키면 specs 수치와 그림이 어긋나지 않는다).

## 1. 프리셋

```json
"models": { "laptop": { "preset": "laptop" }, "phone": { "preset": "phone" } }
```

| 프리셋 | 파트(colors/textures 대상) | 앵커(콜아웃 대상) |
|---|---|---|
| `phone` | Body, Screen, Island, LensRing, Lens, Flash, Port | Body, Screen, Island, CameraBump, Lens1~3, LensRing1~3, Flash, VolumeUp, VolumeDown, Power, Port, Speaker, Mic, Front, Back |
| `laptop` | Body, Screen, Keys, Trackpad, Camera, Logo, Port | Base, Lid, Keys, Trackpad, Screen, Camera, Logo, PortUSB1, PortUSB2, Audio |

요소에서 색/화면 바꾸기:
```json
{ "type": "model", "id": "a", "model": "phone", "x": 760, "y": 560, "height": 420, "rot": [6,-18,4],
  "colors": { "Body": "cobalt" }, "textures": { "Screen": "app" } }
```
`textures` 값: assets 이미지 키, 또는 `{"gradient": ["sky", "lilac"]}`.
스크린샷 비율: phone 675×1455, laptop 1120×730 근처로 만들면 늘어나지 않는다.

방향: 앞면 +Z, 위 +Y. phone 카메라는 뒷면 → 카메라를 보이려면 `rot` y≈180±30.

## 2. 도형 조합 (models.X.shapes)

간단한 제품(박스, 카드, 컵, 스피커…)은 도형으로 충분하다.
```json
"models": {
  "speaker": { "shapes": [
    { "id": "Body", "kind": "cylinder", "size": [3, 3, 8], "color": "#E14A48" },
    { "id": "Grill", "kind": "cylinder", "size": [3.05, 3.05, 5], "pos": [0, -0.8, 0], "color": "#1E1B2E", "part": "Grill" },
    { "id": "Button", "kind": "cylinder", "size": [0.6, 0.6, 0.2], "pos": [0, 4.05, 0], "color": "#F5D25E" },
    { "id": "Top", "kind": "group", "pos": [0, 4, 0], "children": [ ... ] }
  ], "anchors": { "Bass": [0, -2, 3] } }
}
```
| kind | size | 비고 |
|---|---|---|
| `slab` | [w,h,d], `radius`(모서리) | 둥근 사각형 판(기기 본체용). 앞뒤 ±d/2 |
| `roundRect` | [w,h], `radius` | 평면(+Z를 봄), UV 0~1 → 화면/라벨에 텍스처 |
| `box` | [w,h,d] | |
| `sphere` | [r] | |
| `cylinder` | [rTop, rBottom, h] | 축이 Y. 앞을 보게 하려면 `rot` [90,0,0] |
| `cone` | [r,h] · `torus` [r,tube] · `capsule` [r,len] · `disc` [r] · `plane` [w,h] | |
| `group` | — | `children`, 회전 축(힌지) 만들 때 |

공통: `id`(앵커 이름), `part`(색/텍스처 그룹, 기본=id), `pos`, `rot`(도), `scale`, `color`,
`shade: "flat"`(조명 없는 데칼 — 화면·키보드·렌즈), `outline`(기본: 입체 도형 true, 평면 false).
평면 데칼은 붙일 면에서 0.003 이상 띄운다(z-fighting은 런타임이 polygonOffset으로 추가 보정).

## 3. GLB (Blender 등)

```json
"models": { "earbud": { "src": "assets/earbud.glb", "outlineMin": 0.04, "anchors": { "Tip": [0, -1.2, 0] } } }
```
- 원본 머티리얼의 base color와 텍스처는 유지되고, 셰이딩만 툰으로 바뀐다.
- 파트 이름 = 머티리얼 이름(없으면 메시 이름). 앵커 = 노드 이름(바운딩박스 중심).
- 외곽선: 전체 대각선의 `outlineMin`(4%)보다 작은 메시는 외곽선을 생략(작은 구멍이 뭉개지지 않게). 끄려면 `"outline": false`.

Blender 내보내기 체크리스트:
1. 실측 스케일(1 unit = 10mm면 Scene Unit Scale 0.01 + 실제 mm 치수), 정면이 +Y(Blender) → glTF에서 +Z로 변환되도록 기본 설정(+Y Up) 유지.
2. Apply All Transforms. 모디파이어는 Apply.
3. 콜아웃할 부위는 **별도 오브젝트로 분리하고 이름을 영문 PascalCase로**(PortUSB, LensMain…).
4. 색을 바꿀 부위는 머티리얼 이름으로 묶는다(Body, Screen…).
5. 폴리곤은 모델당 2만~5만 tri 이내(단일 HTML에 base64로 들어간다). Draco 압축은 쓰지 않는다(런타임에 디코더 없음).
6. 내보낸 뒤 `capture.py --anchors`로 이름 확인.

## 배치 수학 (디버깅용)

카메라는 FOV 30°, z=40 고정. z=0 평면에서 1 unit ≈ 50.4 px(가로판 기준).
`height`는 **회전 전** bbox 높이를 px로 맞춘 값이라, 크게 기울이면 화면상 높이는 달라진다.
`pin`: 특정 앵커를 정확히 (x,y)에 고정(원근 보정 2회 반복). 손가락 끝, 렌즈 중심 같은 정렬에 쓴다.
