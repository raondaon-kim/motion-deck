# AGENTS.md — motion-deck

손그림 스타일 모션 슬라이드(HTML 한 장)와 **내레이션 강의 영상(MP4)** 을 만드는 도구.
사람이 넣는 것은 `projects/<이름>/project.json` + `sources/` 뿐이고, 나머지(대본·스토리보드·일러스트·음성·싱크·검수·렌더)는 파이프라인이 만든다.
이 문서는 이 저장소에서 일하는 모든 에이전트(Codex, Claude Code, 기타)용 작업 규칙이다. 경로는 모두 저장소 루트 기준 상대 경로.

---

## 1. 환경

| 도구 | 용도 | 확인 |
|---|---|---|
| Python 3.10+ | 전 단계 | `python --version` |
| `pip install -r requirements.txt` | playwright, Pillow, fontTools, brotli | |
| `playwright install chromium` | 헤드리스 렌더·검수 | |
| ffmpeg | MP4 인코딩 | `ffmpeg -version` |
| Node 18+ | 런타임 재빌드(`runtime/`) | `cd runtime && npm install` |
| `pip install supertonic faster-whisper numpy soundfile opencv-python PyMuPDF python-pptx` | TTS · 큐 정렬 · 배경 제거 · 원자료 추출 | |
| Codex CLI (`npm i -g @openai/codex`, 로그인, `image_generation` 기능) | 일러스트 생성 | `codex features list` |
| Claude Code CLI (`claude`) 또는 `ANTHROPIC_API_KEY` | 스토리보드 작성 | `claude --version` |

환경 변수(필요할 때만): `CODEX_PATH`, `CLAUDE_PATH`(CLI가 PATH에 없을 때), `CHROME_PATH`(Chromium 위치), `PYTHONUTF8=1`(Windows 콘솔 한글).

## 2. 자주 쓰는 명령

```bash
# 강의 영상 전체 (바뀐 단계만 다시 실행됨)
python md.py make projects/<name>
python md.py make projects/<name> --until qa          # 렌더 전까지 (빠른 확인)
python md.py make projects/<name> --redo render       # 특정 단계부터 강제 재실행

# 덱 하나를 직접 (파이프라인 밖)
python scripts/build.py deck.json -o out/deck.html
python scripts/capture.py out/deck.html --out out/shots --qa [--portrait]
python scripts/sync.py deck.json -o out/narr          # 내레이션·큐가 있는 덱 → deck.resolved.json
python scripts/capture.py out/deck.html --out out/shots --video out/x.mp4 --audio out/narr/narration.wav --subs out/narr/captions.srt

# 런타임 수정 후
cd runtime && npm run build                           # dist/motion-deck.js 갱신 (dist는 저장소에 포함)
```

## 3. 저장소 지도

```
md.py                  오케스트레이터: ingest → storyboard → assets → deck → narrate → build → qa → render → report
pipeline/              ingest(원자료 추출) · storyboard(LLM) · llm(claude -p / API) · assets(Codex+배경 제거)
                       deck(템플릿 펼치기) · palette(기준 색→팔레트) · components(도식 규칙·라이브러리) · report
templates/lecture/     슬라이드 레시피 JSON + _set.json(타이포 스케일·폰트·minText)
library/<component>/   완성된 강의에서 수확한 표·카드·흐름도·그래프 예시 (다음 스토리보드의 참고)
runtime/src/           캔버스 런타임: core · text · shapes · elements · diagrams · table · chart · three-layer · main
scripts/               build.py(검증·인라인) · capture.py(QA·시트·병렬 렌더) · sync.py(TTS·큐 정렬)
references/            deck-schema · design-playbook · models · extending · pipeline · components/*.md
projects/<name>/       project.json · sources/ · build/(전부 생성물)
examples/              folio(쇼케이스, boil:true) · lecture(내레이션 예제)
```

## 4. 파이프라인과 캐시 — 무엇이 무엇을 다시 만드나

`build/state.json`에 단계별 입력 해시가 있다. 입력이 같으면 건너뛴다.

| 단계 | 다시 실행되는 조건 | 비용 |
|---|---|---|
| ingest | `sources/` 파일 변경 | 즉시 |
| **storyboard** (LLM) | `source.md` 또는 project의 title·length·audience·brief 변경, `--redo storyboard` **만** | 2~4분 |
| assets (Codex) | 프롬프트가 바뀐 그림만 (그림별 캐시) | 장당 30~45초, 5개 병렬 |
| deck | 스토리보드·템플릿·팔레트로 펼친 결과가 바뀔 때 | 즉시 |
| narrate | deck.json 변경 (TTS·정렬은 슬라이드별 캐시, 대본이 같으면 재사용) | 처음 2~3분 |
| build | deck.resolved.json · **런타임 dist** · build.py 변경 | 즉시 |
| qa / render | HTML · 음성 · capture.py 변경 | 렌더 2~4분 |

- **스토리보드는 템플릿을 바꿔도 다시 만들지 않는다**(손으로 고친 내용 보존). 다시 만들 때는 이전 버전이 `build/history/`에 백업된다. `build/history/`는 지우지 않는다.
- 한 슬라이드 음성만 다시: `python scripts/sync.py ... --redo 2,9` 또는 `build/narr/slides/slide_NN.*` 삭제.
- 그림 하나만 다시: `build/assets/<key>.png` 삭제 후 `make`.
- `storyboard.json`을 직접 고쳐도 된다(원자료가 그대로면 유지된다). 수치·문구 교정은 여기서.

## 5. 새 강의 만들기

```json
// projects/<name>/project.json
{ "title": "강의 제목", "color": "#2E6BE6", "voice": "M1", "fps": 24,
  "brand": "AX.", "label": "AI WORK 101", "length": "4min", "audience": "대상",
  "brief": "제작 요구 사항(장면 순서, 꼭 넣을 도식, 강조점)", "templates": "lecture",
  "font": "Noto Sans KR", "palette": { "accent": "#..." } }
```
- `sources/`: md · txt · pdf · pptx · docx 섞어서 넣는다.
- `brief`는 스토리보드 LLM에 그대로 전달된다. 원하는 도식(표·그래프 종류)은 여기에 명시한다.
- 결과: `build/lecture.mp4`, `build/report.html`(영상·시트·싱크·QA·팔레트·에셋·소요 시간).

## 6. 콘텐츠 모델 — 새로 만들지 말고 재사용·변형

**템플릿**(`templates/lecture/*.json`): cover · section · concept-left/right/hero · bullets-art · cards · flow · table · chart · quote · summary · ending.
LLM은 템플릿 이름과 빈칸(slots)만 채운다. 좌표·색은 레시피가 정한다(`{slot}`, `{slot@}`=큐, `$soft`/`$accent`=팔레트 역할, `"$merge"`=객체 빈칸 펼치기).

**도식 컴포넌트**(`pipeline/components.py`, 문서 `references/components/`): 렌더러 1 + 템플릿 1 + variant + 한도 검증 + 라이브러리.

| 컴포넌트 | variant | 핵심 한도 |
|---|---|---|
| table | compare · matrix(✓✗△) · before-after · steps | 2~3열(matrix 4), 2~5행, 칸 ≤22자 |
| cards | icon(일러스트) · number(번호, 생성 없음) | 2~4장, 제목 ≤10자, 설명 ≤40자 |
| flow | linear · loop(되돌아가는 연결) | 노드 3~6, 라벨 ≤8자 |
| chart | donut · bar(묶음·전후 delta) · line(marks) · scatter(zone) | y축 하나, 계열 ≤2, 예시 수치 정직성 |

- 새 표현이 필요하면 순서대로: ① 기존 variant로 해결 → ② 기존 컴포넌트에 variant 추가 → ③ 새 컴포넌트(렌더러+템플릿+`COMPONENTS` 항목+문서). 덱마다 코드를 새로 짜지 않는다.
- `md.py make`가 끝나면 도식이 `library/`에 수확되고, 다음 스토리보드 프롬프트에 variant별 예시로 들어간다(구조만 변형, 문구 복사 금지).

## 7. 런타임을 고칠 때

- 수정 후 반드시 `cd runtime && npm run build`. `md.py`는 dist 해시가 바뀌면 HTML을 다시 빌드한다.
- **결정성**: 시간에 따른 모든 변화는 `t`/`S.tick`/`jit()`의 함수. `Math.random`·`Date.now` 금지(캡처·정지 프레임 판정이 깨진다).
- 텍스트는 반드시 `text()`/`animText()`로 그린다(QA가 박스를 본다). `ctx.fillText` 직접 호출 금지.
- 크기·간격·등장 방식은 하드코딩하지 말고 `S.theme.type`(타이포 스케일)을 읽는다. 기본값은 원래 모습, 강의값은 `templates/lecture/_set.json`.
- 요소의 길이(`dur`)는 실제 마지막 변화 시점까지 포함해야 한다(정지 프레임 복사 최적화가 이 값을 믿는다).
- 차트 색은 `palette.py chart_series`(검증된 순서)만 쓴다. 색을 바꾸면 dataviz `validate_palette.js`로 검증한다(CVD ΔE ≥ 8, 정상 시각 ≥ 15).
- 회귀 확인(필수): `examples/folio` 빌드 + `capture.py --qa --portrait`(ERROR 0) → `projects/*`를 `md.py make ... --until qa`(ERROR 0) → 시트 PNG를 **직접 열어 본다**.

## 8. 품질 기준 (납품 전)

- QA ERROR 0 (겹침·화면 이탈·대비·런타임). WARN은 판단해서 남길 수 있다.
- 시트(`build/shots/sheet_L.png`)를 눈으로 확인. 숫자만 보고 끝내지 않는다.
- 싱크: 큐 앞뒤 프레임을 영상에서 뽑아 요소가 말과 함께 나오는지 확인(`ffmpeg -ss <초> -i lecture.mp4 -frames:v 1`).
- 가독성(1080p): 본문·목록 40px, 카드 설명·캡션 32px, 최소 28px(페이지 번호 등 chrome 제외). 마지막 줄에 단어 하나 금지(균형 줄바꿈).
- **데이터 정직성**: 원자료에 없는 수치는 `data_source: "example"` → 화면에 "예시 수치", 내레이션에 "예시/예를 들어". 수치는 내레이션 주장과 일치해야 한다(가장 큰 몫이라 말하면 실제로 가장 커야 함) — 자동 검사가 못 잡으므로 스토리보드를 읽고 확인한다.
- 건강·법률 등 주의사항이 원자료에 있으면 빠짐없이 넣는다.

## 9. 알려진 함정

- **Windows 콘솔 한글 깨짐**: 스크립트는 UTF-8로 출력한다. 직접 실행하는 Python은 `PYTHONUTF8=1`.
- **faster-whisper `--device cuda`가 멈춘다**(cuDNN/cuBLAS 누락 시 오류 없이 정지). 기본값 cpu 유지.
- `python -I`(격리 모드)는 사용자 site-packages를 못 읽어 numpy 등이 없다고 나온다 — 저장소 코드는 일반 모드로 실행.
- `md.py make` 전체 실행은 10분을 넘길 수 있다. 셸 타임아웃이 있는 환경에서는 백그라운드로 돌리고 `build/make.log`를 본다.
- 여러 줄 패치를 heredoc 안 Python 문자열로 넣으면 `\n`·따옴표가 깨지기 쉽다. 파일로 쓰거나 편집 도구를 쓴다.
- 실행 중인 `md.py`는 끝날 때 `state.json`을 덮어쓴다. 상태를 손으로 바꾸려면 실행이 끝난 뒤에.
- ffmpeg에 `-shortest`를 쓰지 않는다(저프레임 입력에서 영상이 일찍 잘린다). 길이는 `-t`로 고정.

## 10. 하지 말 것

- 덱마다 런타임 JS를 고치거나 덱 전용 코드를 만들지 않는다(→ 6장의 순서).
- 텍스트를 이미지로 넣지 않는다(일러스트 프롬프트에도 "no text").
- 듀얼 y축, 생성된 9번째 색, 모든 점에 숫자 라벨 — 차트 금지 패턴.
- 확인 없이 `projects/*/build/history/`, `library/` 삭제.
- 사용자 요청 없이 커밋·푸시.
