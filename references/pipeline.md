# 멀티에이전트 파이프라인 구성

단일 에이전트는 SKILL.md 워크플로를 그대로 따르면 된다. 이 문서는 오케스트레이터(LangGraph 등)로 역할을 나눌 때의 계약이다.

## 노드

```
 Planner ──▶ Author ──▶ Builder ──▶ Inspector ──▶ Critic ──┐
   ▲                       ▲                               │ fix list
   │                       └──────── Author(patch) ◀───────┘
   └─ (Critic가 구조 문제 판정 시만)                    pass ▶ Exporter
```

| 노드 | 입력 | 출력 | 도구/모델 |
|---|---|---|---|
| Planner | 브리프, 원자료 | `storyboard.md`(표: #, 레시피, 제목 2줄, 비주얼, 강조) | 텍스트 LLM. design-playbook.md 레시피 목록만 컨텍스트에 |
| Author | storyboard, deck-schema.md, playbook 레시피, 예제 deck.json | `deck.json` | 텍스트 LLM(구조화 출력). JSON만 출력 |
| Builder | deck.json | `deck.html` 또는 ERROR 목록 | `build.py` (결정적, LLM 없음) |
| Inspector | deck.html | `qa.json`, `sheet_L.png`, `sheet_P.png` | `capture.py --qa --portrait` (결정적) |
| Critic | qa.json + 시트 이미지 + storyboard | `{verdict, fixes:[{slide, element_id, change, reason}]}` | **비전 모델 필수**. 숫자로 안 잡히는 것(밋밋함, 리듬, 비주얼 무게중심, 의미 없는 장식) 판정 |
| Author(patch) | deck.json + fixes | 수정된 deck.json | JSON patch 형태로 최소 수정 |
| Exporter | deck.html | 최종 html, mp4(선택) | `capture.py --video` |

## 상태(State)

```python
{ "brief": str, "storyboard": str, "deck": dict, "build_errors": list,
  "qa": dict, "sheets": [path], "fixes": list, "round": int }
```

## 루프 규칙

- Builder ERROR → Critic를 건너뛰고 바로 Author(patch)로(에러 메시지를 그대로 전달).
- Inspector ERROR 0 + Critic `pass` → 종료. 최대 3라운드. 3라운드 후 남은 WARN은 보고서로 넘긴다.
- Critic의 수정은 **요소 단위**(slide index + element id + 바꿀 필드)로만. "전체적으로 더 예쁘게" 같은 지시는 무효.
- 같은 수정이 2라운드 연속 나오면 그 요소는 레시피 기본값으로 되돌린다(진동 방지).

## Critic 체크리스트 (프롬프트에 넣을 것)

1. 슬라이드마다 시선이 가장 먼저 가는 곳이 제목인가, 비주얼인가 — 의도와 맞는가
2. 비주얼 영역이 비어 보이거나(오브젝트 너무 작음) 넘치는가(잘림)
3. 연속된 슬라이드의 레이아웃/배경색이 반복되는가
4. 장식이 메시지를 가리키는가, 그냥 흩뿌려졌는가
5. 콜아웃 라벨이 오브젝트 위에 올라가 있지 않은가
6. 세로판에서 비주얼이 텍스트와 겹치거나 너무 작지 않은가

## 모델 라우팅 팁

- Author는 스키마가 엄격해서 중간급 모델도 잘 한다(예제 deck.json을 few-shot으로 주면 안정적). 비용 큰 모델은 Critic에.
- Author 출력은 JSON 파싱 → `build.py`의 검증 ERROR를 그대로 되먹임하면 1~2회 안에 수렴한다.

## 회귀 세트

`examples/` 아래 덱들을 골든 세트로 두고, 런타임을 고칠 때마다 전부 빌드 + `--qa`. ERROR 수와 시트를 이전 결과와 비교한다(시트는 픽셀 diff보다 육안/비전 모델 비교가 실용적 — 12fps 떨림 때문에 시점이 같으면 결정적이지만 런타임 변경 시 미세 차이가 정상).
