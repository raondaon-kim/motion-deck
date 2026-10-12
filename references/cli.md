# 명령어 레퍼런스 · 문제 해결

## md.py — 강의 영상 파이프라인

```
python md.py make projects/<name> [--redo STAGE] [--until STAGE] [--model MODEL] [--image-workers 5]
  STAGE        ingest | storyboard | assets | deck | narrate | build | qa | render | report
  --redo       해당 단계와 이후 단계를 강제로 다시 실행
  --until      해당 단계까지만 실행 (예: --until qa → 렌더 전 확인)
  --model      스토리보드 LLM 모델 (claude -p --model, 예: sonnet)
```
단계별 캐시 규칙은 `AGENTS.md` 4장.

## build.py — deck.json → HTML 한 장

```
python scripts/build.py deck.json -o out/deck.html [--offline] [--runtime path/to/motion-deck.js]
```
- 검증 ERROR(알 수 없는 type, 없는 이미지/모델, 콜아웃 대상 누락, 큐가 남은 at 등)가 있으면 빌드하지 않는다.
- `--offline`: 폰트를 받지 않고 시스템 폰트 사용.

## capture.py — 검수 · 시트 · 영상

```
python scripts/capture.py deck.html --out shots [옵션]
  --qa                 레이아웃 검수 → qa.json, ERROR 시 종료 코드 1
  --portrait           세로판(1080×1920)도 렌더/검수
  --timeline 0.4,1.2   각 슬라이드의 해당 시점 프레임 저장
  --slides 2,3         일부 슬라이드만(1부터)
  --video deck.mp4     전체 재생 영상(ffmpeg), --hold 1.5 슬라이드별 정지 시간
  --audio a.wav        내레이션 음성 합치기(sync.py 결과, 이때 --hold 기본 0)
  --subs c.srt         소프트 자막 트랙
  --workers N          병렬 브라우저 수 (기본: CPU 절반, 최대 6)
  --crf 20             화질(낮을수록 고화질·대용량)      --preset medium   x264 프리셋
  --frame-format png   무손실 프레임(기본 jpeg q95, 약 2배 느림)
  --scale 2            2배 해상도로 캡처
  --anchors            3D 모델 콜아웃 앵커 이름 출력
```
- 영상은 덱의 `theme.fps`(기본 12, 강의 24 권장)로 렌더하고 그대로 인코딩한다(12fps는 24로 균등 복제).
- 등장 애니메이션이 끝난 정지 구간은 한 장만 그리고 복사한다(보통 전체 프레임의 30~50%).
- 내레이션 영상에 `--slides`를 쓰면 음성과 어긋난다. 전체를 렌더한다.

## sync.py — TTS + 큐 정렬

```
python scripts/sync.py deck.json -o out/narr [옵션]
  --voice M1            Supertonic 목소리 M1–M5 / F1–F5     --speed 1.05   --steps 8 (품질)
  --lead 0.6 --tail 0.8 슬라이드마다 목소리 앞/뒤 여백(초)      --silent 3.0   내레이션 없는 슬라이드 길이
  --align whisper       (기본) 한 번에 합성 → faster-whisper 단어 시각을 대본에 정렬 + 무음 구간 보정
          segments      큐 사이를 따로 합성 → 큐 시각 정확, STT 불필요(문장 중간 큐에서는 억양이 끊길 수 있음)
          ratio         STT 없이 글자 비율로 추정(초안용)
  --whisper large-v3-turbo   --device cpu (기본)
  --redo 2,9            해당 슬라이드만 다시 합성(나머지는 캐시)
```
결과: `deck.resolved.json`(덱 옆), `narration.wav`, `captions.srt`, `timeline.json`(슬라이드별 시작·길이·큐·정렬 일치율 `coverage`).

대본 문법: `[[이름]]` 큐, `{표기|읽기}` 자막엔 표기·TTS는 읽기. 감싸지 않은 숫자는 `ko_numbers.py`가 한국어 읽기로 바꾼다(자막은 그대로). 요소의 `at`: `"@이름"`, `"@이름+0.2"`, `"@start"`, `"@end"`. 자세한 내용은 `deck-schema.md` "내레이션과 큐".

## 런타임 재빌드

```bash
cd runtime && npm install && npm run build    # dist/motion-deck.js 갱신
```
새 요소·스티커·프리셋·레이아웃 추가는 `extending.md`. 수정 후 회귀 확인 순서는 `AGENTS.md` 7장.

## 문제 해결

| 증상 | 원인 / 해결 |
|---|---|
| 화면 상단에 빨간 ERROR 띠 | 렌더 중 예외. 메시지대로 수정(3D 앵커 이름 오타가 흔함 → `--anchors`) |
| 한글이 기본 고딕으로 보임 | 오프라인 빌드였거나 폰트 다운로드 실패. 빌드 로그 `NOTE font ...` 확인, 또는 `theme.fonts`에 로컬 폰트 지정 |
| 3D가 안 보임 | 브라우저 WebGL 꺼짐. 헤드리스 검수는 SwiftShader로 동작 |
| 세로판에서 요소가 어긋남 | 해당 요소에 `"p": {...}`로 세로 전용 값 덮어쓰기 |
| capture.py가 Chromium을 못 찾음 | `playwright install chromium` 또는 `CHROME_PATH` |
| `unresolved cue '@x'` ERROR | 큐가 남은 deck.json을 빌드함 → `sync.py` 후 `*.resolved.json`을 빌드 (파이프라인은 자동) |
| sync.py가 whisper 단계에서 멈춤 | `--device cuda`에서 cuDNN/cuBLAS 누락. 기본값 cpu 사용 |
| 큐가 말보다 늦거나 빠름 | `timeline.json`의 coverage 확인. 숫자·영문은 `{표기|읽기}`, 또는 `--align segments` |
| codex / claude CLI를 못 찾음 | `CODEX_PATH` / `CLAUDE_PATH` 환경 변수로 실행 파일 지정 |
| 콘솔 한글 깨짐 | `PYTHONUTF8=1` |
| 대비 WARN | 파스텔 위 강조색 제목(2.8~3.0)은 대개 허용. ERROR(<2.0)는 반드시 수정 |
