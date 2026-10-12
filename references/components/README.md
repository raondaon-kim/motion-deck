# 도식 컴포넌트 (table · cards · flow · chart)

구조가 있는 내용은 새로 그리지 않고 아래 세 컴포넌트를 **데이터 + variant**만 바꿔서 쓴다.
각 컴포넌트 = 런타임 렌더러 1개 + 템플릿 1개 + 변형 + 가독성 한도(자동 검증) + 예시 라이브러리.

| 컴포넌트 | 렌더러 | 템플릿 | variant | 라이브러리 |
|---|---|---|---|---|
| 표 | `runtime/src/table.js` | `templates/lecture/table.json` | compare · matrix · before-after · steps | `library/table/` |
| 카드 | `runtime/src/diagrams.js` `drawCards` | `templates/lecture/cards.json` | icon · number | `library/cards/` |
| 흐름도 | `runtime/src/diagrams.js` `drawFlow` | `templates/lecture/flow.json` | linear · loop | `library/flow/` |
| 그래프 | `runtime/src/chart.js` | `templates/lecture/chart.json` | donut · bar · line · scatter | `library/chart/` |

표의 상세 규칙: [table.md](table.md) · 그래프: [chart.md](chart.md)

## 카드 (cards)

| variant | 언제 | 비고 |
|---|---|---|
| `icon` (기본) | 같은 급의 항목 2~4개 — 역할, 도구, 사례 | 카드마다 작은 아이콘 일러스트(Codex 생성) |
| `number` | 원칙, 체크리스트, 실패 사례 | 큰 번호 배지 01, 02…, **일러스트 생성 없음**(빠름). 한 줄의 카드는 같은 높이에 정렬 |

한도: 2~4장, 제목 ≤ 10자, 설명 ≤ 40자, icon이면 `art.prompt` 필수. 카드마다 `at`(큐) → 말할 때 한 장씩 등장.

## 흐름도 (flow)

| variant | 언제 | 비고 |
|---|---|---|
| `linear` (기본) | 한 방향 단계 (입력 → 처리 → 결과) | |
| `loop` | 반복·순환 (검수 → 반려 → 재작업) | `back` 연결선 1~2개 필수(뒤 노드 → 앞 노드), 점선 + 라벨 |

한도: 노드 3~6개, 라벨 ≤ 8자, 보조 문구 `sub` ≤ 12자, 되돌아가는 연결 ≤ 2개(라벨 ≤ 12자). 박스 높이는 라벨 줄 수와 보조 문구에 맞춰 자동으로 커진다.

## 동작 방식

1. **스토리보드 프롬프트**에 세 컴포넌트의 variant 설명·한도·라이브러리 예시(변형별 최신)가 들어간다 — "구조는 변형해서 쓰고 문구는 베끼지 말 것" (`pipeline/components.py` `prompt_block`).
2. **검증**: 한도를 넘으면 오류 문장이 그대로 LLM에 돌아가 수정된다 (`check`).
3. **수확**: `md.py make`가 끝나면 이번 강의의 표·카드·흐름도가 `library/<컴포넌트>/<hash>.json`에 저장된다 (같은 내용은 한 번만, variant가 없던 옛 스토리보드는 내용으로 추론).
4. 좋은 예시를 직접 넣으려면 같은 형식의 JSON을 해당 폴더에 추가한다. `project: "seed"`는 손으로 넣은 참고 예시.
