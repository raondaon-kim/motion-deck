# motion-deck

손그림 일러스트 + 툰 셰이딩 3D가 움직이는 **단일 파일 HTML 프레젠테이션**을 `deck.json` 하나로 만드는 도구 겸 AI 에이전트 스킬.

- 손그림 선·종이 질감(기본은 떨림 없음, `boil: true`로 12fps 손떨림), 찢긴 종이 전환, 텍스트 자동 배치·자동 안무
- 3D 모델(프리셋 phone/laptop, 도형 조합, GLB)을 툰 셰이딩 + 잉크 외곽선으로 렌더, 3D 지점에 지시선
- 세로 화면(1080×1920) 자동 대응, 고해상도 대응, 사용 글자만 담은 폰트 서브셋
- 자동 검수(겹침·화면 이탈·실제 픽셀 대비), PNG 시트, MP4 출력
- **내레이션 영상**: 대본에 큐를 찍으면 TTS(Supertonic) 음성에 맞춰 요소가 등장하는 MP4 + 자막(SRT)

결과물 HTML은 외부 요청 없이 오프라인에서 열린다. 편집 가능한 PowerPoint가 필요한 용도에는 맞지 않는다.

---

## 1. 요구 사항

| 항목 | 용도 | 필수 |
|---|---|---|
| Python 3.9+ | 빌드·검수 스크립트 | ✅ |
| `pip install -r requirements.txt` | playwright, Pillow, fontTools, brotli | ✅ |
| `playwright install chromium` | 헤드리스 렌더링(검수·시트·영상) | 검수 시 ✅ |
| ffmpeg | `--video` MP4 출력 | 선택 |
| `supertonic`, `faster-whisper`, `numpy`, `soundfile` | 내레이션 영상(`sync.py`) | 선택 |
| Node.js 18+ | 런타임 수정 후 재빌드할 때만 | 선택 |
| 인터넷 | 빌드 시 Google Fonts 서브셋 다운로드 | 선택(`--offline` 가능) |

```bash
pip install -r requirements.txt
playwright install chromium
```

## 2. 빠른 시작

```bash
# 예제 빌드 → out/folio.html
python scripts/build.py examples/folio/deck.json -o out/folio.html

# 검수: 가로/세로 시트 + qa.json (ERROR가 있으면 종료 코드 1)
python scripts/capture.py out/folio.html --out out/shots --qa --portrait
```

`out/folio.html`을 브라우저로 연다.
조작: `←` `→` / 클릭(왼쪽 30%는 이전) / 스와이프 · `F` 전체화면 · `R` 현재 슬라이드 다시 재생 · URL `#3`으로 3번 슬라이드.

빌드된 예제는 `examples/folio/folio.html`에도 들어 있다(설치 없이 바로 열어 보기).

## 3. 내 덱 만들기

1. `examples/folio/`를 복사한다.
2. `deck.json`의 `meta`, `slides`를 바꾼다. 이미지는 `assets/`에 넣고 `assets.images`에 키로 등록.
3. 빌드 → 검수 → `out/shots/sheet_L.png` 확인 → 고치기를 ERROR 0이 될 때까지 반복.

최소 예:
```json
{
  "meta": { "title": "AI 교육 안내", "brand": "AX.", "label": "INTERNAL — 2026" },
  "slides": [
    { "layout": "hero", "bg": "paper", "elements": [
      { "type": "blob", "x": 1420, "y": 560, "r": 400, "color": "sky" },
      { "type": "kicker", "text": "AI TRAINING" },
      { "type": "title", "lines": ["일하는 방식이", "바뀝니다"], "accent": 1, "mark": "squiggle" },
      { "type": "sticker", "shape": "star", "x": 1700, "y": 260 }
    ]},
    { "layout": "text-left", "bg": "mint", "elements": [
      { "type": "kicker", "text": "01 — WHY" },
      { "type": "title", "lines": ["반복 업무는", "AI에게"], "accent": 1 },
      { "type": "bullets", "items": ["보고서 초안 작성", "회의록 정리", "데이터 요약"] },
      { "type": "stats", "items": [ { "label": "절감 시간", "value": "6", "unit": "시간/주" } ] }
    ]}
  ]
}
```
텍스트 요소에는 좌표를 주지 않는다(레이아웃 컬럼에 자동으로 쌓임). 좌표는 가로 1920×1080 기준.

전체 필드: `references/deck-schema.md` · 슬라이드 레시피: `references/design-playbook.md` · 3D: `references/models.md`

## 4. 스크립트 옵션

**build.py**
```
python scripts/build.py deck.json -o out/deck.html [--offline] [--runtime path/to/motion-deck.js]
```
- 검증 ERROR(알 수 없는 type, 없는 이미지/모델, 콜아웃 대상 누락 등)가 있으면 빌드하지 않는다.
- `--offline`: 폰트를 받지 않고 시스템 폰트 사용.

**capture.py**
```
python scripts/capture.py deck.html --out shots [옵션]
  --qa               레이아웃 검수 → qa.json, ERROR 시 종료 코드 1
  --portrait         세로판(1080×1920)도 렌더/검수
  --timeline 0.4,1.2 각 슬라이드의 해당 시점 프레임 저장
  --slides 2,3       일부 슬라이드만(1부터)
  --video deck.mp4   전체 재생 영상(ffmpeg), --hold 1.5 슬라이드별 정지 시간
  --audio a.wav      내레이션 음성 합치기(sync.py 결과, 이때 --hold 기본 0)
  --subs c.srt       자막 트랙 넣기(소프트 자막, 플레이어에서 켜고 끔)
  --crf 20           영상 화질(낮을수록 고화질·대용량, 23이면 약 절반)
  --frame-format png 무손실 프레임 전달(기본 jpeg q95보다 약 2배 느림)
  --scale 2          2배 해상도로 캡처
  --anchors          모델별 콜아웃 앵커 이름 출력
```
Chromium을 못 찾으면 환경 변수 `CHROME_PATH`에 실행 파일 경로를 지정한다.

## 5. 내레이션 강의 영상 (TTS 싱크)

슬라이드에 `narration`을 쓰고, 요소의 `at`을 큐(`"@이름"`)로 지정한다. 문법은 `references/deck-schema.md` "내레이션과 큐".

```json
{ "narration": "첫 번째 특징은 [[light]]가볍다는 점입니다. 무게는 [[w]]{1.2kg|일 점 이 킬로그램}입니다.",
  "elements": [ { "type": "title", "lines": ["가방 속", "한 권의 노트처럼"], "at": "@light" },
                { "type": "stats", "items": [...], "at": "@w" } ] }
```

```bash
pip install supertonic faster-whisper numpy soundfile

# 1) TTS + 큐 시각 계산 → deck.resolved.json, narration.wav, captions.srt
python scripts/sync.py examples/lecture/deck.json -o out/lecture/narr --voice M1

# 2) 빌드·검수 (resolved 파일을 빌드)
python scripts/build.py examples/lecture/deck.resolved.json -o out/lecture/lecture.html
python scripts/capture.py out/lecture/lecture.html --out out/lecture/shots --qa --portrait

# 3) 영상 (음성 + 자막 트랙 포함)
python scripts/capture.py out/lecture/lecture.html --out out/lecture/shots --video out/lecture/lecture.mp4     --audio out/lecture/narr/narration.wav --subs out/lecture/narr/captions.srt
```

**sync.py 옵션**
```
--voice M1            Supertonic 목소리 M1–M5 / F1–F5      --speed 1.05   --steps 8 (품질)
--lead 0.6 --tail 0.8 슬라이드마다 목소리 앞/뒤 여백(초)       --silent 3.0   내레이션 없는 슬라이드 길이
--align whisper       (기본) 한 번에 합성 → faster-whisper 단어 시각을 대본에 정렬 + 무음 구간으로 보정
        segments      큐 사이를 따로 합성 → 큐 시각 정확, STT 불필요(문장 중간 큐에서는 억양이 끊길 수 있음)
        ratio         STT 없이 글자 비율로 추정(초안용)
--whisper large-v3-turbo   --device cpu (기본. Windows에서 cuDNN이 없으면 cuda는 멈출 수 있음)
--redo 2,9            해당 슬라이드만 다시 합성(나머지는 캐시 재사용 — 대본·목소리 설정이 같으면 자동 재사용)
```
- 결과 `timeline.json`에 슬라이드별 시작/길이, 큐 시각, 정렬 일치율(`coverage`)이 남는다. 일치율 60% 미만이면 WARN.
- 영상은 덱의 `theme.fps`(기본 12, 강의는 `project.json`의 `"fps": 24` 권장)로 렌더해 그대로 인코딩(12fps는 24fps로 균등 복제)(x264 `--crf 20`, tune animation ≈ 36초에 20MB, `--crf 23`이면 절반). 렌더 속도는 프레임당 약 0.14초(36초 영상 ≈ 1분). 슬라이드 사이 전환 0.5s는 음성 트랙에 무음으로 들어가 싱크가 어긋나지 않는다.
- 기본값은 손떨림 없음(`boil: false`). 모델 부유까지 줄이려면 `theme.motion: "calm"`, 등장 후 완전 정지는 `"still"`.
- `capture.py --video`에 `--slides`를 쓰면 음성 트랙과 어긋난다. 내레이션 영상은 전체를 렌더한다.

## 5-1. 완전 자동 파이프라인 (원자료 → 강의 MP4)

프로젝트 폴더에 `project.json`과 `sources/`만 넣고 명령 하나로 끝까지 만든다.

```bash
python md.py make projects/agent-orchestration            # 전체 실행 (바뀐 단계만 다시)
python md.py make projects/agent-orchestration --redo storyboard   # 해당 단계부터 강제 재실행
python md.py make projects/agent-orchestration --until build       # 중간까지만
```

`project.json`: `title`, `color`(기준 색 하나 → 팔레트 자동), `voice`(M1–M5/F1–F5), `brand`, `label`, `length`, `audience`, `templates`(기본 `lecture`), `palette`(덮어쓸 색만), `speed`.

| 단계 | 하는 일 | 엔진 | 결과 (build/) |
|---|---|---|---|
| ingest | md·txt·pdf·pptx·docx 텍스트 추출 | 결정적 | source.md |
| storyboard | 내레이션·템플릿 선택·빈칸 채우기·큐 | `claude -p` (실패 시 API) | storyboard.json, script.md |
| assets | 일러스트 병렬 생성 → 흰 배경 제거 | Codex 이미지 생성 | assets/*.png |
| deck | 템플릿 펼치기 + 팔레트 + 배경 순환 | 결정적 | deck.json |
| narrate | TTS + 큐 정렬 | Supertonic + faster-whisper | narr/ |
| build · qa | 단일 HTML + 자동 검수 | 결정적 | lecture.html, shots/ |
| render | 병렬 브라우저 렌더 + 음성·자막 | Playwright × N + ffmpeg | lecture.mp4 |
| report | 품질 리포트 | — | report.html |

- `storyboard.json`을 직접 고치면 원자료가 바뀌지 않는 한 그대로 쓰인다(이후 단계만 다시).
- 에셋은 프롬프트별로 캐시. 하나만 다시 만들려면 `build/assets/<키>.png`를 지우고 다시 실행.
- 도식 컴포넌트: 표(`table`: compare · matrix · before-after · steps), 카드(`cards`: icon · number), 흐름도(`flow`: linear · loop), 그래프(`chart`: donut · bar · line · scatter)를 `variant`로 변형해서 쓴다. 완성된 강의의 도식은 `library/<컴포넌트>/`에 쌓여 다음 강의의 참고 예시가 된다 → `references/components/README.md`
- 템플릿: `templates/lecture/*.json` (cover · section · concept-left/right/hero · bullets-art · cards · flow · quote · summary · ending). 형식은 `pipeline/deck.py` 상단 주석.

## 6. AI 에이전트에서 쓰기

저장소 루트에 에이전트용 작업 규칙이 들어 있다. 이 폴더를 그대로 열면 각 도구가 자동으로 읽는다.

| 파일 | 읽는 도구 | 내용 |
|---|---|---|
| `AGENTS.md` | Codex CLI, Cursor, 기타 AGENTS.md 지원 에이전트 | 공통 규칙: 환경, 명령, 파이프라인·캐시, 컴포넌트 재사용, 런타임 수정 규칙, 품질 기준, 함정 |
| `CLAUDE.md` | Claude Code | `@AGENTS.md`를 불러오고 Claude Code 전용 지침만 추가 |
| `SKILL.md` | claude.ai Skills / Claude Code 스킬 | 덱(deck.json) 한 장을 만드는 워크플로 |

| 환경 | 설치 |
|---|---|
| Claude Code · Codex CLI · 기타 | 이 폴더를 작업 디렉터리로 연다(다른 곳에서 쓸 때는 폴더째 복사 — 경로는 모두 상대 경로). CLI가 PATH에 없으면 `CODEX_PATH`·`CLAUDE_PATH` 지정 |
| claude.ai | Settings → Capabilities → Skills → 이 폴더를 zip으로 업로드 (SKILL.md 기준) |
| Claude Code 스킬로만 | `~/.claude/skills/motion-deck/` 또는 프로젝트 `.claude/skills/motion-deck/`에 복사 |

AGENTS.md를 지원하지 않는 에이전트에는 시스템 프롬프트에 다음 한 줄을 넣는다.
```
motion-deck 저장소에서 일할 때는 먼저 motion-deck/AGENTS.md를 읽고 그 규칙을 따른다.
```

에이전트에게 읽힐 문서 순서: `SKILL.md` → `references/design-playbook.md` → `references/deck-schema.md` → (필요 시) `models.md` / `extending.md`.
역할을 나눈 파이프라인(Planner → Author → Builder → Inspector → Critic) 구성은 `references/pipeline.md`.

## 7. 폴더 구조

```
motion-deck/
├── README.md              (이 파일)
├── SKILL.md               에이전트용 워크플로
├── requirements.txt
├── references/            deck-schema · design-playbook · models · extending · pipeline
├── runtime/
│   ├── dist/motion-deck.js  빌드된 런타임(Three.js 포함). build.py가 HTML에 인라인
│   ├── src/                 core · text · shapes · elements · three-layer · presets · main
│   └── package.json
├── scripts/               build.py · capture.py · sync.py(TTS 싱크)
└── examples/
    ├── folio/             예제 8장(deck.json, assets, 빌드 결과, 시트)
    └── lecture/           내레이션 예제 3장(큐 사용)
```

## 8. 런타임 수정

```bash
cd runtime
npm install
npm run build        # dist/motion-deck.js 갱신
```
새 요소·스티커·프리셋·레이아웃을 추가하는 방법은 `references/extending.md`. 수정 후에는 예제를 다시 빌드하고 `--qa --portrait`로 회귀 확인.

## 9. 문제 해결

| 증상 | 원인 / 해결 |
|---|---|
| 화면 상단에 빨간 ERROR 띠 | 렌더 중 예외. 메시지대로 수정(앵커 이름 오타가 가장 흔함 → `--anchors`로 확인) |
| 한글이 기본 고딕으로 보임 | 오프라인 빌드였거나 폰트 다운로드 실패. 빌드 로그의 `NOTE font ...` 확인, 또는 `theme.fonts`에 로컬 폰트 파일 지정 |
| 3D가 안 보임 | 브라우저 WebGL 꺼짐. 헤드리스 검수는 SwiftShader로 동작 |
| 세로판에서 요소가 어긋남 | 해당 요소에 `"p": {...}`로 세로 전용 값 덮어쓰기 |
| capture.py가 Chromium을 못 찾음 | `playwright install chromium` 또는 `CHROME_PATH` 지정 |
| `unresolved cue '@x'` ERROR | 큐가 남은 deck.json을 빌드함 → `sync.py` 실행 후 `*.resolved.json`을 빌드 |
| sync.py가 whisper 단계에서 멈춤 | `--device cuda`에서 cuDNN/cuBLAS DLL 누락. 기본값 `--device cpu` 사용 |
| 큐가 말보다 늦거나 빠름 | `timeline.json`의 coverage 확인. 숫자·영문은 `{표기|읽기}`로 읽는 법을 지정, 또는 `--align segments` |
| 콘솔 한글 깨짐 | 스크립트가 UTF-8로 출력. 그래도 깨지면 `PYTHONUTF8=1` |
| 대비 WARN | 파스텔 배경 위 빨간 제목(2.8~3.0)은 대개 허용. ERROR(<2.0)는 반드시 수정 |

## 라이선스 / 출처

- 런타임에 Three.js(MIT)가 번들되어 있다.
- 디자인 방향은 re-presentation.jp의 HTML 슬라이드 샘플(plume. Product Guide)을 분석해 일반화한 것이며, 원본 코드·에셋·폰트는 포함하지 않는다.
