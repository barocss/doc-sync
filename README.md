# @barocss/doc-sync

스키마를 주입받는 문서 전용 CRDT 라이브러리다. TypeScript 로 만들었고, CRDT·동기화·서버는 **의존성이 하나도 없다** (ProseMirror 연동만 prosemirror 패키지를 peer 로 쓴다). CRDT, 동기화 클라이언트, 서버(DocHub), ProseMirror 연결, 브라우저 데모가 들어 있다.
앞선 Yorkie 실험 저장소에서 시험한 생각("문서를 토큰 한 줄로")에서 출발했고, 이제 Yorkie·스키마 기반 문서 에디터와 떨어진 단독 라이브러리로 키운다. 이름은 `@barocss/doc-sync` 다 (2026-10-22 사용자 결정).
**새 세션은 [`HANDOFF.md`](HANDOFF.md) 부터 읽는다.**

**모노레포 구성**: 공개 API를 제공하는 라이브러리는 `packages/doc-sync` 하나다. `apps/demo`와 `benchmarks`는 각각 비공개 npm 워크스페이스다. 공유 예제 스키마는 `fixtures/demo-schema.ts`에 둔다. 기존 패키지 이름과 네 진입점을 유지한다. 라이브러리의 기존 `private: true` 설정도 배포 준비 전까지 유지한다.

**원격 사용자 표시**: 데모와 ProseMirror에서 사용자 색 선택 범위와 이름 커서를 표시한다. 전방·역방향·여러 문단 선택, 편집 후 위치 추적, 겹친 참여자를 지원한다. 데모의 범위는 같은 CRDT 줄(slot) 안으로 한정한다. 상세 규칙과 브라우저 결과는 [`HANDOFF.md` §5.5](HANDOFF.md#55-원격-사용자-선택-범위-2026-10-22)에 있다.

**비교 데모 입력 보존**: Slate·Lexical·ProseMirror를 함께 연결한 [`apps/demo/compat`](apps/demo/compat/README.md)는 토큰 기준 선택 복원과 IME 조합 초안을 사용한다. Chrome CDP로 원격 편집 중 입력과 커서를 검사했다. 기본 `/pm`의 IME 구현과 OS 한글 키보드 검증은 별도 범위다.

```ts
import {Doc, commands} from "@barocss/doc-sync";     // 핵심 — 의존성 없음
import {SyncClient, HttpTransport} from "@barocss/doc-sync/sync";
import {DocHub} from "@barocss/doc-sync/server";
import {PmBinding, buildPmSchema} from "@barocss/doc-sync/prosemirror";
```

CRDT 는 블록 종류를 모른다. **스키마를 바깥에서 주입**하고(스키마 기반 문서 에디터의 스키마처럼 `children` 으로 트리를 적는다), CRDT 는 스키마의
"모양" 몇 가지만 안다. 연산도 종류와 무관한 다섯 가지뿐이다. 새 블록 종류는 스키마만 고치면 된다.

```bash
npm install                  # 개발 의존성 (prosemirror-*, typescript, yjs — yjs 는 측정 비교용)
npm run dev                  # http://localhost:5410  (Node 22.18+, apps/demo/server.ts)
npm test                     # 시나리오 + 무작위 500 대본
FUZZ_SEEDS=3000 npm test     # 무작위 3000 대본 × 참여자 2·4
npm run typecheck
npm run bench:client         # SyncClient 로컬 편집 측정
npm run bench                # 단계 0 측정 — 같은 대본을 이 라이브러리와 Yjs 로 (benchmarks/)
```

데모 주소 뒤에 `?doc=이름` (문서), `?peers=1..4` (이 창의 참여자 수), `?observer=0` (서버 관찰자 없이), `?auto=1` (자동 입력)을 붙일 수 있다.

**여러 창 시험** — `http://localhost:5410/multi?n=10&doc=multi`

- 편집기 창 10개를 창마다 다른 호스트(`a.localhost` … `j.localhost`)로 띄운다. 브라우저는 같은 호스트로 HTTP/1.1 연결을 6개까지만 열기 때문이다 (한 창에서 탭을 여러 개 열어도 합쳐서 6개)
- 창마다 참여자 하나, 관찰자 없이 연결 하나만 쓴다. 창들은 자기 문서의 지문을 부모 창에 알리고, 부모 창은 서버 문서의 지문과 비교해 "모두 같은 문서"를 보여 준다
- "자동 입력 시작"을 누르면 열 창이 동시에 무작위로 글자·Enter·Backspace 를 친다. "끊기 → 자동 입력 → 잇기" 로 끊긴 동안의 편집 합치기도 볼 수 있다
- 결과(2026-10-22, 내장 브라우저): 자동 입력 20초 → 변경 373건, 열 창 + 서버 지문 하나로 모임. 모두 끊고 10초 입력(창마다 보낼 것 7~24건, 지문 11가지) → 잇자 6초 안에 514건으로 모두 같은 문서
- 화면 밖 iframe 은 브라우저가 타이머를 늦춰서, 아래쪽 창은 자동 입력이 덜 된다


## 어떻게 동작하나

### 1. 문서는 토큰 줄이다

```
¶root a b c d ¶9C C ¶9B B ¶9A A e f g h
```

토큰은 **글자 토큰**과 **노드 토큰**(블록을 여는 표지 ¶, 표, 행, 그림 …)이다. 블록 목록은 저장하지 않는다. 살아 있는 토큰을 앞에서부터 읽으며 그때그때 계산한다.

- Enter = 표지 하나 넣기
- Backspace 로 문단 합치기 = 표지 하나 지우기
- 블록 종류(제목·인용·목록 항목) = 표지의 속성 `$type`

줄은 본문 하나와, 노드마다 이름 붙은 **자리(slot)** 줄들이 있다 — 표의 `rows`·`cols`·`cell:행,열`, 상자·이미지 그릇의 `body`.
자리 줄 머리의 이름표는 주인 노드 이름표와 자리 이름에서 정해지므로, 줄을 만드는 연산이 따로 없다.

트리를 자르거나 노드를 옮기는 연산이 아예 없다. 그래서 Yorkie Tree 에서 본 문제 — 같은 경계를 동시에 자를 때 복제본마다 다른 노드를 옮기는 문제(§7.4, yorkie#2240) — 가 생길 자리가 없다.

### 2. 순서는 이름표로만 정한다 (RGA)

모든 토큰에는 바뀌지 않는 이름표 `lamport@참여자` 가 붙는다. 새 토큰은 "왼쪽 기준 토큰" 바로 뒤에 들어간다. 같은 기준 뒤에 동시에 들어간 토큰끼리는 이름표가 큰 쪽이 앞에 선다. 판단에 쓰는 값은 이름표뿐이라, 받는 순서가 달라도 모든 복제본에서 같은 줄이 나온다. 트리를 읽지 않는다.

### 3. 같은 자리 동시 Enter 는 새 줄 하나

표지에는 만든 쪽이 본 경계(왼쪽 토큰·오른쪽 토큰)가 적혀 있다. 같은 경계를 가진 살아 있는 표지가 여럿이면 순서상 첫 것만 문단을 연다. 나머지는 그 문단에 **흡수**된다(데모의 주황 ¶).

- 서로 모르고 같은 자리에서 친 Enter → 한 줄. 각자 그 줄에 친 글자는 모두 그 줄에 남는다.
- 상대의 Enter 를 본 뒤 친 Enter → 왼쪽 토큰이 달라 경계가 다르므로 따로 줄.

### 4. 지우기 장부와 되돌리기

토큰은 지워도 없애지 않는다. "나를 지운 연산들"과 "취소된 지우기들"을 기록하고, 취소되지 않은 지우기가 하나라도 남아 있으면 죽은 토큰(묘비)으로 친다.

되돌리기는 **참여자마다 따로** 있고, 과거로 돌아가는 것이 아니라 반대 연산을 새로 보내는 것이다.

- 넣은 것을 되돌리기 → 새 지우기
- 지운 것을 되돌리기 → **내가 한 그 지우기만** 취소
- 블록 종류·속성·서식을 되돌리기 → 지금 값이 **아직 내가 정한 값일 때만** 이전 값으로. 그 사이 남이 바꿨으면 남의 값을 덮지 않는다

그래서 B 가 `d` 를 지웠다 되돌리는 사이 A 가 `defgh` 를 지웠다면 `d` 는 계속 죽어 있다. 되돌리기가 보지 못한 남의 삭제까지 되살리는 문제(yorkie#2237)가 구조적으로 생기지 않는다.

편집기 쪽 다듬기:

- 이어 친 글자는 한 단위로 되돌린다 (1.5초 안, 커서가 이어질 때만)
- 되돌리기·다시하기 뒤 커서는 그 편집 전·후 자리로 간다 (자리는 토큰 이름표로 기억하므로 남의 편집에 밀리지 않는다)
- 선택한 글을 덮어 치기는 "지우기 + 넣기" 한 단위
- 최근 100단위까지. "기록 비우기" 로 버릴 수 있다 (GC 를 막던 핀도 함께 풀린다 — 아래 9)

### 5. 동기화: 서버의 순서가 곧 인과 순서

```
편집기 ─ 연산 ─▶ SyncClient ─ Change{actor, seq, ops} ─▶ POST ─▶ DocHub ─▶ JSONL 로그
   ▲                                                                 │
   └──────────── 남의 Change 적용 ◀── SSE ◀── serverSeq 붙여 퍼뜨림 ─┘
```

- 내 편집은 바로 내 문서에 적용한다. 서버를 기다리지 않는다.
- 서버는 받은 순서대로 `serverSeq` 를 붙인다. 누가 어떤 토큰을 기준으로 삼았다면 그 토큰은 이미 앞 번호로 로그에 있다. 그래서 참여자는 버전 벡터 없이 "마지막으로 받은 serverSeq" 하나만 기억한다.
- 내 Change 가 돌아오면 확인으로만 쓴다. CRDT 연산은 순서를 바꿔도 결과가 같아 되감기(rebase)가 필요 없다.
- 끊긴 동안 친 것은 쌓아 두었다가 이어지면 보낸다. 서버가 `(actor, seq)` 로 중복을 거르므로 다시 보내도 안전하다.
- 서버도 같은 CRDT 코드로 문서를 들고 있다. 새 참여자에게는 스냅숏을 준다. **클라이언트와 서버가 같은 코드라 교차 구현 불일치가 없다.**

### 6. 글자 서식 (굵게·기울임·밑줄·취소선)

서식은 범위가 아니라 **글자 토큰마다** 둔다. 글자 하나·서식 하나마다 LWW(이름표가 큰 쪽이 이김) 값이다.

- 서식 연산은 "내가 본 글자들의 이름표 목록 + 켜기/끄기"다. 그 사이 남이 범위 안에 넣은 글자는 바뀌지 않는다 — 보지 못한 글자에 서식을 입히지 않는다
- 같은 글자를 동시에 켜고 끄면 이름표가 큰 쪽 하나로 모든 복제본이 모인다
- 새로 치는 글자는 왼쪽 글자의 서식을 물려받는다. 선택 없이 ⌘B 를 누르면 다음에 칠 글자의 서식만 바꾼다
- Peritext 처럼 범위 끝 규칙(굵은 글 끝에서 이어 치면 굵게?)을 따로 정하지 않고 "왼쪽을 물려받는다" 하나로 단순하게 했다

### 7. 목록 편집 (저장 방식은 §11)

- Tab / Shift+Tab 으로 수준(`level` 0~4), 항목에서 친 Enter 는 같은 `listType`·같은 수준으로 이어진다 (스키마의 `inherit`)
- 빈 항목에서 Enter, 항목 맨 앞에서 Backspace → 한 수준 내어쓰기, 0 이면 그 줄의 기본 블록(문단)으로
- 번호는 저장하지 않고 화면에서 센다. 그래서 동시에 항목을 넣어도 번호가 꼬이지 않는다

### 8. 서버 적용은 한 덩어리

Change 하나에 연산이 여럿 들어 있다. 서버는 적용하기 전에 모든 연산의 기준 토큰·대상 토큰이 있는지 먼저 검사한다(같은 Change 안에서 앞 연산이 만든 토큰도 셈에 넣는다). 하나라도 틀리면 Change 전체를 409 로 거절하고 문서는 그대로다. 어중간하게 반쯤 적용된 서버 문서가 생기지 않는다.

### 9. GC — 묘비 압축

묘비를 줄에서 **빼지 않는다**. 빼면 RGA 의 "같은 기준 뒤 이름표 비교" 결과가 달라져 늦게 온 연산이 다른 자리에 들어간다. 대신 **안정된 묘비를 압축**한다.

- 내용·서식·지우기 장부를 버리고 자리만 남긴다 (데모의 점선 `▒`)
- 한 사람이 연달아 친 글자들의 묘비는 토큰 하나(`▒×N`)로 합친다. 연달아 친 글자는 이름표가 1씩 늘고 바로 앞 글자를 기준으로 삼으므로, 묶음 하나가 자리 판단에서 원래 글자들과 똑같이 행동한다

"안정"의 뜻: 죽었고, 이 묘비를 만든 지우기들이 모두 기준점 이하의 serverSeq 를 가진다. 기준점은 서버가 정한다.

```
기준점 = min over 참여자 ( 받은 곳 ack ,  되돌리기 핀 − 1 )
```

- **받은 곳(ack)**: 참여자가 "여기까지 받아 적용했다"고 알린 serverSeq. 그 뒤에 그 참여자가 보낼 연산은 그 지우기를 이미 본 상태라, 압축된 토큰을 기준으로 삼지 않는다
- **되돌리기 핀**: 내 되돌리기·다시하기가 취소할 수 있는 지우기 중 가장 이른 serverSeq. 되돌리면 살아나야 하므로 그 전까지만 압축한다
- 끊긴 참여자도 2분(lease) 동안은 기준점에 넣는다. 창을 닫으면 `sendBeacon` 으로 바로 빠진다
- ack 는 Change 와 **같은 줄에** 서서 차례로 나간다. ack 가 앞질러 가면 "아직 안 보낸 연산이 기댄 토큰"을 서버가 압축할 수 있다

GC 자체도 로그의 한 줄 `{serverSeq, gc: 기준점}` 이다. 모든 복제본이 로그의 같은 자리에서 같은 기준점으로 압축하므로 결과가 같다. 압축된 토큰을 기준으로 삼은 연산은 그 토큰(또는 묶음)에 그대로 붙는다. 서버는 압축할 묘비가 12개 이상 모이면 편집이 잦아든 뒤(0.8초) 스스로 GC 한다.

### 10. 스키마 주입과 모양

스키마는 `SyncClient` 를 만들 때 넣는다 (`new SyncClient(actor, transport, {schema})`). 서버도 같은 스키마로 검사하지만, 없어도 된다.

| 모양 | 뜻 | 데모 스키마의 종류 |
|---|---|---|
| `text` | 글을 담는 블록. 흐름 줄에서 표지가 열고 다음 표지까지가 안. `children` = 올 수 있는 inline | paragraph · heading1·2 · quote · list-item · image |
| `inline` | text 블록 안에서 글자 한 자리를 차지 | inline-image |
| `flow` | 블록이 흐르는 줄 하나를 가진 그릇. Enter 로 나누고 Backspace 로 합치는 곳 | content · table-cell-body · image-component · callout |
| `group` | 이어진 항목 블록을 묶어 **보이는** 그릇 (저장하지 않는다) | list |
| `grid` · `row` · `cell` | 표 · 표 행 · 표 칸. 칸의 `children` 은 칸 안 흐름 그릇 하나 | table · table-row · table-cell |
| `atom` | 안이 없는 블록 | divider |

```
content ─ paragraph(─ inline-image) · heading1 · heading2 · quote
        ─ list ─ list-item
        ─ table ─ table-row ─ table-cell ─ table-cell-body ─ paragraph · list · image-component
        ─ image-component ─ image ─ inline-image
                          ─ caption ─ caption-paragraph
        ─ callout ─ paragraph · heading2 · list · table · image-component
        ─ divider
```

연산은 종류와 무관한 다섯 가지다: 글자 넣기 `text`, 노드 넣기 `node`, 지우기 `del`, 지우기 취소 `undel`, 속성 쓰기 `set`
(블록 종류 `$type`, 블록·그림 속성, 글자 서식이 모두 `set`).

**검사는 바뀌지 않는 사실만 본다.** 서버는 스키마로 "이 줄에 이 종류가 올 수 있나", "이 속성 값이 맞나"를 검사한다. 이때 쓰는
것은 토큰이 어느 줄에 있는지, 노드가 태어날 때 무슨 종류였는지뿐이다. 지금 종류·살았나는 복제본마다 다를 수 있어서, 그것으로
거절하면 이미 자기 화면에 적용한 참여자와 서버가 갈라진다. 그래서 서버가 스키마 없이 돌아도(검사만 덜 할 뿐) 수렴은 같다.

모델 출력(`toJSON`)은 스키마의 종류 이름으로 된 트리다 — 스키마 기반 문서 에디터의 문서 JSON 과 같은 꼴.

### 11. 목록 — 저장은 평평하게, 보이기는 list > list-item

list-item 은 흐름 줄의 text 블록이고 `listType`·`level` 속성을 가진다. 모델을 계산할 때 이어진 list-item 을 `listType` 이 같은
것끼리 `list` 하나로 묶는다(스키마의 `group` 모양, `by: ["listType"]`).

`list` 를 진짜 그릇으로 저장하면, 항목이 목록에 들고 나는 것(빈 항목에서 Enter, 문단 ↔ 목록, 두 목록 사이의 문단 지우기)이 모두
**블록 옮기기**가 된다 — 이 연구 전체가 피해 온 바로 그 연산이다. 평평하게 두면 종류 바꾸기 하나다. 그래서 A 가 항목을 목록에서
빼는 사이 B 가 그 항목에 친 글이 그대로 남는다 (시험 있음). 스키마 기반 문서 에디터도 목록을 `listGroupId`·`listItemLevel` 속성으로 들고 있다.

### 12. 표 — 행 줄 × 열 줄, 칸은 이름표로

표 노드는 `rows` 줄(table-row 노드들)과 `cols` 줄(열 노드들)을 가진다. 칸은 따로 만들지 않는다 — (행, 열) 교차마다 `cell:행이름표,열이름표`
자리 줄이 있고, 그 줄이 table-cell-body 다. 행·열의 수는 스키마가 정하지 않는다. 넣을 때 고르고 나중에 더하고 뺀다.

- 칸을 **번호가 아니라 이름표로** 가리키므로, A 가 행을 더하는 사이 B 가 열을 더해도 칸이 엇갈리지 않는다. 두 사람이 서로 모르고 만든 행과 열이 만나는 칸도 바로 쓸 수 있다
- 열을 지우는 사이 남이 그 열의 칸에 쓰면: 열은 사라지고, 그 글은 묘비가 아니라 **안 보이는 칸에 살아 있다**. 열 지우기를 되돌리면 그 글까지 돌아온다
- 행이나 열이 하나도 안 남으면 표가 통째로 안 보인다 (두 사람이 남은 두 행을 하나씩 동시에 지운 경우)
- 칸 안도 흐름 줄이라 Enter·목록·이미지·같은 자리 동시 Enter 규칙이 본문과 똑같다
- 내가 있던 열을 남이 지우면 커서는 옆 칸으로 나온다

**칸 합치기 (colspan · rowspan)** — 칸에는 토큰이 없으므로 합치기는 표 노드의 속성으로 적는다:
`$span:왼쪽위행,왼쪽위열` = `{row: 끝 행, col: 끝 열}` (모두 이름표, LWW). 모델은 스키마 기반 문서 에디터처럼 full grid 로 낸다 — 모든 행에 모든
칸이 있고, 왼쪽 위 칸에 `colspan`·`rowspan`, 가려진 칸에 `spanned: true`.

- 크기를 개수가 아니라 **끝 이름표**로 적으므로, 합치는 사이 남이 그 사이에 넣은 열도 함께 덮인다. 끝 열을 지우면 줄어든다
- 왼쪽 위 칸의 행·열이 지워지면 그 합치기는 없어지고 가렸던 칸이 다시 보인다
- 겹치는 합치기를 동시에 하면 나중 이름표 것 하나만 받는다 (나머지는 버린다) — 모든 복제본에서 같은 결과
- 가려진 칸의 글은 지우지 않는다. 숨을 뿐이고 나누면 다시 보인다 (합칠 때 글을 옮기면 블록 옮기기가 된다). 가려진 칸에 있던 커서는 왼쪽 위 칸으로
- 편집기: 칸 안에서 "→ 합치기"·"↓ 합치기"·"나누기". Tab·화살표는 가려진 칸을 건너뛴다

**칸 속성 (backgroundColor)** — 같은 방식으로 표 노드에 `$cell:행,열|이름` 으로 적는다(LWW). 스키마의 table-cell 속성 가운데
`computed` 가 아닌 것을 쓸 수 있고(`backgroundColor` 는 `#rrggbb` 꼴 `pattern`), colspan·rowspan·spanned 는 계산값이라 직접 쓰면
거절된다. 색은 행·열 이름표에 붙어 있으므로 앞에 행·열이 들어와도 같은 칸에 남고, 열을 지웠다 되돌리면 색도 돌아온다.

표·이미지·구분선 바로 뒤에 자기 표지를 가진 블록이 없으면 **빈 자리**(virtual)가 하나 생긴다. 그래서 표 앞뒤에는 언제나 커서를
둘 곳이 있고, 표 바로 뒤로 동시에 들어온 글자도 갈 곳이 있다.

### 13. 이미지 — image-component > [image > inline-image, caption > caption-paragraph]

image-component 는 흐름 그릇이고, 그 줄에 image 블록과 caption-paragraph 블록이 이어진다.

- image 블록은 글자를 받지 않고(`text: false`) inline-image 하나를 담는다. inline-image 는 `src`·`width`·`height` 속성을 가진 inline 노드다
- 캡션은 목록과 같은 방식이다 — caption-paragraph 는 평평한 text 블록이고, 모델에서 이어진 것끼리 `caption` 하나로 묶는다
  (`group`, `by: []`). 캡션 끝 Enter 는 캡션 줄을 하나 더 만든다
- 글자를 받지 않는 블록에는 합치지 않는다: 캡션 맨 앞 Backspace, 그림 끝 Delete, 그림부터 캡션까지 지우기 모두 캡션 블록을 남긴다
- 문단 안에도 inline-image 를 넣을 수 있다 (글자 한 자리, 서식은 건너뛴다). 그림 크기를 동시에 바꾸면 나중 이름표 쪽으로 모인다

### 14. 편집 API — 모델 연산 다섯 가지 (`docs/edit-api.md`)

편집기는 모델 경로(`toJSON` 트리의 자식 번호, 스키마 기반 문서 에디터의 트리 경로(숫자 배열)와 같은 꼴)와 모델 노드로 말한다. CRDT 의 줄·토큰은 몰라도 된다.

```ts
doc.edit([
    {op: "delete", at: [0], count: 1},                                  // 문서 내용 통째로 바꾸기 꼴
    {op: "insert", at: [0], content: [{type: "paragraph", runs: [{text: "after", marks: {}}]}]},
]);
doc.edit([0, 1, 2].map(r => ({op: "insert", at: [1, r, 1], content: [{type: "table-cell"}]})));   // 행마다 칸 = 열 하나
doc.edit([{op: "update", at: [1, 0, 0], attrs: {colspan: 2, backgroundColor: "#dcfce7"}}]);
```

- `insert · delete · update · split · merge` 를 스키마 **모양**별로 전선 연산에 옮긴다 (`edit.ts`). 종류 이름은 보지 않는다
- 한 묶음 안에서 흐름의 첫 블록을 지우면 줄 머리는 "비운 자리"가 된다 — 다음 경로는 그 자리를 세지 않고, 맨 앞에 글 블록이 오면 채운다
- 행마다 같은 번호의 칸 넣기·지우기는 열 하나로 접는다. 한 행에만 와도 열 하나로 바로잡는다
- 편집기 명령(글자·Enter·Backspace·표 행/열·칸 합치기 …)은 `commands.ts` 가 편집 연산으로 만든다. 옛 편집 함수 18개를 옮긴 것이고,
  같은 상태에서 옛 함수와 나란히 34,001걸음을 돌려 모델 차이 0 을 확인한 뒤 옛 함수를 지웠다
- `edit()` 은 **normalize** 도 돌려준다 — 편집기가 이 묶음을 자기 모델에 그대로 적용했을 때와 CRDT 모델이 다르면 그 차이 (흐름은 글 블록으로 시작, 들쭉날쭉한 열, 합친 칸 사이의 열 …)

### 15. 받는 쪽 이벤트

`client.onModelEvents = (events, info) => …` — 남의 변경·되돌리기·스냅숏으로 모델이 바뀌면 앞 모델을 뒤 모델로 바꾸는 편집 연산을 준다.
편집기는 이것을 자기 모델에 적용하면 된다.

- 받기 전·후 모델을 비교해 만든다 (`model.ts` 의 diffModels). 글자 하나면 글자 하나 넣기, 열 하나면 행마다 칸 넣기
- 흐름은 펼친 항목 줄에서 비교하고, 연산마다 작업 사본에 적용해 다음 경로를 그 사본에서 구한다 — 목록이 붙었다 떨어져도 경로가 안 어긋난다
- 내보내기 전에 앞 모델에 적용해 **검산**하고, 틀리면 문서 통째 바꾸기로 **물러선다** (`info.fallback`)

### 16. 링크 — 값 서식

링크 주소는 글자마다의 값 서식 `link`(LWW)로 저장한다. 모델에서는 같은 주소로 이어진 글자를 `inline-hyperlink {url}` 하나로 묶어 보인다
(스키마의 `span` 모양 — 목록과 같은 "저장은 평평, 보이기는 묶음"). 새로 친 글자는 링크를 물려받지 않는다(`inherit` 없음). 주소 꼴은
스키마의 `pattern` 으로 검사한다 (`javascript:` 같은 것은 서버가 거절).

### 17. 커서와 선택

위치는 모델 경로(편집기)와 토큰 키(CRDT) 두 가지로 말한다. 경로는 남의 편집에 흔들리고 토큰 키는 흔들리지 않는다. 그래서 커서·선택의
시작·끝은 토큰 키로 들고 있다가 그릴 때 경로로 바꾼다 — `anchorAt(doc, path)` → 키, `pathAt(doc, key)` → 지금 경로.
남의 커서(presence)도 토큰 키로 주고받는다. 자세한 것은 `docs/edit-api.md` §11.

### 18. ProseMirror 연동 (`packages/doc-sync/src/pm/`, `/pm`)

편집 API 가 편집기를 모르므로 ProseMirror 도 같은 길로 붙는다. `/pm?doc=이름` 에서 데모 편집기(A)와 ProseMirror(P)가 같은 문서를 함께 편집한다.

- **스키마** (`pm/schema.ts`): 우리 스키마에서 ProseMirror 스키마를 뽑는다. 목록은 평평하다 — list_item 은 listType·level 속성을 가진 textblock
  (prosemirror-schema-list 의 그릇 목록을 쓰면 항목이 들고 날 때 노드 옮기기가 된다). 표는 prosemirror-tables 꼴(table·table_row·table_cell + colspan·rowspan), 링크는 값 하나짜리 mark
- **변환** (`pm/convert.ts`): 모델 ↔ ProseMirror 문서, 모델 경로 ↔ ProseMirror 위치. 우리 표는 full grid(가려진 칸 있음), ProseMirror 표는 가려진 칸이 없다 — 변환이 넣고 뺀다. 가려진 칸의 숨은 글은 바꾸기 전 모델에서 가져와 잃지 않는다
- **보내는 쪽** (`pm/binding.ts`): Step 을 하나씩 모델 연산으로. 한 블록 안 글(insert·delete), Enter(splitBlock → **split**), 블록 맨 앞 Backspace(join → **merge**), 블록 걸친 지우기, 서식(Add/RemoveMarkStep → update)은 뜻을 살려 옮기고, 나머지(종류 바꾸기·표 행/열·붙여 넣기)는 Step 앞·뒤 모델 비교로 옮긴다 — prosemirror-tables 의 열 넣기는 그러면 행마다 칸 넣기가 되어 CRDT 가 열 하나로 접는다. 옮긴 뒤 두 문서를 맞춰 보고, 다르면 우리 쪽을, 그래도 다르면(CRDT 규칙) ProseMirror 를 맞춘다
- **받는 쪽**: 남의 변경·되돌리기 → 새 문서와의 차이 구간만 바꾸는 transaction 하나 (`findDiffStart/End`). 내 커서는 ProseMirror 가 그 Step 을 따라 옮긴다. 남의 커서는 토큰 키 → 경로 → 위치로 장식(decoration)을 그린다
- **되돌리기**: ProseMirror history 대신 CRDT 의 참여자별 되돌리기 (`binding.undo()`)
- **y-prosemirror 와 다른 점**: Enter 를 문서 차이(앞 문단 줄이기 + 뒷글 다시 넣기)가 아니라 split 하나로 보낸다. 그래서 A 가 나누는 사이 B 가 뒷부분에 친 글자가 그대로 남고, 같은 자리 동시 Enter 는 새 줄 하나다 (시험 있음)
- 브라우저에서 번들러 없이 돌리려고 서버가 `node_modules` 의 ESM 을 내주고, `pm.html` 의 import map 이 이름을 잇는다

시험 (`packages/doc-sync/test/pm.test.ts`, `packages/doc-sync/test/pm-fuzz.ts`): 진짜 ProseMirror 상태·명령(splitBlock · joinBackward · deleteSelection · toggleMark · setBlockType · replaceSelectionWith(표) · addColumnAfter · addRowAfter · deleteColumn · deleteRow · mergeCells · splitCell)으로 무작위 편집 —
300 대본 × 참여자 2, 200 대본 × 참여자 3 모두 같은 문서 (편집기·CRDT·서버). Step 의 82% 가 뜻을 살려 옮겨졌고(글 4,324 · Enter 1,480 · 합치기 92 · 서식 489 · 범위 지우기 96), 18% 가 모델 비교(1,402). 문서 통째 바꾸기 0.

루트 명령은 각 워크스페이스로 작업을 전달한다. `npm run typecheck`는 라이브러리·시험·데모·벤치마크·공유 스키마를 함께 검사한다. `npm test`는 라이브러리와 데모 HTTP 통합 시험을 실행한다.

```text
packages/doc-sync/  라이브러리 src/와 test/
apps/demo/          데모 서버·UI·HTTP 통합 시험
benchmarks/         비교 엔진·대본·측정·results/
fixtures/           데모·시험 공유 스키마
docs/               설계·보고서·로드맵
data/               기존 데모 로그 (위치 유지)
```

`DATA_DIR=/절대/경로 PORT=5411 npm run dev`로 별도 로그 폴더와 포트를 사용할 수 있다. 기본 로그는 루트 `data/`다. 워크스페이스 명령의 상대 출력 경로는 해당 워크스페이스를 기준으로 한다. 예: `npm run bench -- --out-dir results/새이름`, `npm run bench:client -- --out results/새이름.json`.

## 파일

| 파일 | 하는 일 |
|---|---|
| `packages/doc-sync/src/crdt/ticket.ts` | 이름표와 Lamport 시계 |
| `packages/doc-sync/src/crdt/schema.ts` | 스키마 타입(모양·children·속성)과 스키마 자체 검사 |
| `packages/doc-sync/src/index.ts` | 핵심 입구 — `Doc`, `commands`, `History`, 스키마·모델 타입 (`sync/index.ts`·`server/index.ts`·`pm/index.ts` 도 입구) |
| `packages/doc-sync/src/crdt/doc.ts` | Doc — 줄과 자리, 연산 검사(스키마)·적용, 모델 계산(블록·표·합치기), 압축, `edit()` |
| `packages/doc-sync/src/crdt/model.ts` | 모델 쪽 순수 함수 — 모양 정리, 편집 연산 적용, 모델 비교 |
| `packages/doc-sync/src/crdt/edit.ts` | 편집 연산 → 전선 연산 컴파일, 경로 ↔ 위치 ↔ 토큰 키 |
| `packages/doc-sync/src/crdt/commands.ts` | 편집기 명령 → 편집 연산 |
| `packages/doc-sync/src/crdt/history.ts` | 참여자별 되돌리기·다시하기 (이어 치기 묶기, 커서, 속성은 내 값일 때만, 핀) |
| `fixtures/demo-schema.ts` | 데모 편집기의 스키마 — 블록 종류는 여기에만 있다 (시험도 쓴다) |
| `packages/doc-sync/src/sync/protocol.ts` | Change·Envelope(변경 또는 GC)·Ack·이벤트·Transport |
| `packages/doc-sync/src/sync/client.ts` | SyncClient — 문서·되돌리기·연결, 끊김 동안 쌓기, ack·핀을 변경과 같은 줄로 |
| `packages/doc-sync/src/sync/http-transport.ts` | 브라우저 전송 (SSE + fetch) |
| `packages/doc-sync/src/server/hub.ts` | DocHub — 순서 매기기·한 덩어리 적용·퍼뜨리기, 참여자별 받은 곳·핀, 기준점·GC (전송과 무관) |
| `apps/demo/server.ts` | 데모 서버 — Node http, JSONL 영속, `.ts` 를 타입만 벗겨 브라우저에 내줌 |
| `apps/demo/ui/*` | 데모: 스키마를 읽는 작은 편집기(한글 IME, 표·이미지·목록), 줄별 토큰 들여다보기, 시나리오, 자동 입력, 여러 창 시험(`multi.html`) |
| `docs/edit-api.md` | 설계 메모 — 편집 함수를 모델 연산 다섯 가지(insert·delete·update·split·merge)로, 스키마 기반 문서 에디터 연결까지 |
| `docs/report.html` | 지금까지의 보고서 |
| `docs/roadmap.html` | "쓸 만한 것" 로드맵 — 단계 0~7, 결정 지점, 위험 |
| `benchmarks/*` | 단계 0 측정 — 편집 대본(trace), 엔진 감싸기(이 라이브러리·Yjs), 측정(run), CPU 프로파일용(profile). 결과는 `benchmarks/results/` |
| `packages/doc-sync/test/harness.ts` | 메모리 안 네트워크 — 오르내림을 손으로 흘려 "누가 언제 무엇을 보았나"를 만든다 |
| `packages/doc-sync/test/scenarios.test.ts` | S1~S9 + 끊김·늦은 참여자·문단 종류 |
| `packages/doc-sync/test/features.test.ts` | 서식·목록·되돌리기 다듬기·GC·서버 원자성 |
| `packages/doc-sync/test/tables.test.ts` | 표·빈 자리·구분선·이미지·스키마 검사·다른 스키마 주입·스키마 없는 서버 |
| `packages/doc-sync/test/edit.test.ts` | 편집 API — 경로 왕복, 스키마 기반 문서 에디터의 모델 연산 묶음 꼴, 열 접기, 링크, 받는 쪽 이벤트, 선택 |
| `packages/doc-sync/src/pm/*` | ProseMirror 연동 — 스키마 뽑기, 모델 ↔ 문서·경로 ↔ 위치 변환, Step ↔ 모델 연산 (binding) |
| `apps/demo/ui/pm.html`, `pm-app.ts` | 데모 편집기 × ProseMirror 데모 (`/pm`) |
| `packages/doc-sync/test/pm.test.ts`, `packages/doc-sync/test/pm-fuzz.ts` | ProseMirror 연동 시험 — 같은 자리 Enter, Enter 의도 보존, 열 접기, 되돌리기, 서식·링크, 무작위 |
| `packages/doc-sync/test/fuzz-core.ts`, `packages/doc-sync/test/fuzz.test.ts` | 무작위 동시편집 — 본문·칸·상자 안에서 편집, 표·행·열·이미지·구분선 넣고 지우기, 끊고 잇기, 일부만 흘리기, 아무 때나 GC |

## 시험 결과

- 2026-10-23 로드맵 후속 통합(변경 전 `6f15291`): 안전한 최대 8개 글 블록의 원격 비교를 좁혔다. 확장 시험은 코어 233 + 데모 10, compat 31, 타입 검사 통과다. Chrome 기본 30 + 새 10단계와 compat 회귀 104개도 확인했다. 10만 자 2블록 수신 p95는 31.330~46.928→1.653~1.739ms, 8블록은 36.132~44.818→3.917~6.410ms다. 화면 지연 수치와 다르며 9개 이상·구조·undo/redo는 기존 경로다. [측정 보고서](benchmarks/results/remote-multiblock-2026-10-23/report.md), [HANDOFF §5.14](HANDOFF.md#514-로드맵-우선-작업-여러-글-블록의-원격-비교-2026-10-23)에 있다. 최종 재시험과 main 통합은 [§5.15](HANDOFF.md#515-여러-글-블록-원격-비교-최종-확인과-main-통합-2026-10-23)를 따른다.

- 2026-10-23 최종 통합(`6f15291`): 문단 모델 재사용, 데모 Paint 개선, 의도 보존 명세·41개 회귀, 연속 서식 undo·redo 수정과 19개 회귀를 포함한다. 확장 시험은 코어 204 + 데모 10, compat 31, 타입 검사 통과다. 당시 소스와 같은 해시의 Chrome 기본 30개·집중 26단계·compat 104개 회귀 및 연산 기록 30개도 확인했다. 최종 확인과 검증 범위는 [HANDOFF §5.13](HANDOFF.md#513-전체-변경-최종-확인과-main-통합-2026-10-23)에 있다. 아래 성능 수치는 각 보고서의 당시 소스에서 측정한 값이다.

- 2026-10-23 화면 Paint 개선: 최상위 일반 문단의 격리 범위를 좁혔다. 조합 중 문단과 제목·목록·인용·중첩 구조는 기존 표시 방식을 유지한다. 최종 10만 자 Chrome p95는 111.7/120.4→69.5/68.5ms, 변경 전 소스 재실행은 108.1/121.9ms다. 외부 부하와 측정 범위는 [보고서](benchmarks/results/screen-paint-2026-10-23/report.md), 인수인계는 [HANDOFF §5.10](HANDOFF.md#510-화면-paintprepaint-비용-개선-2026-10-23)에 있다. 측정 당시 미커밋 소스이며, 최종 통합은 §5.13을 따른다.

- 2026-10-23 화면 지연 개선(측정 당시 기준 `f9370df` 위 소스): 바뀌지 않은 문단 모델을 재사용한다. 10만 자 Chrome 대본에서 화면 지연 p95는 데모→PM 246.5→124.1ms, PM→데모 260.4→120.2ms였다. 당시 확장 시험은 코어 144 + 데모 10, 실패 0이었다. [측정 조건·범위](benchmarks/results/screen-latency-2026-10-23/report.md), [HANDOFF §5.9](HANDOFF.md#59-화면-지연의-문단-모델-재계산-개선-2026-10-23)를 본다.

- 2026-10-23 main 통합 변경: 단일 블록 수신 비교, 큰 붙여넣기 캐시 처리, Unicode undo, PM 내부 변환 재사용, 명세·성질 시험·장기 CI 기반을 추가했다. 통합 전 확장 시험(`FUZZ_SEEDS=3000 PM_SEEDS=300`)은 코어 138개 + 데모 10개 통과다. 로컬 8 shard·각 8복제본에서 총 1,000,021 wire Op를 검증했다. bounded 문서 묶음 시험이며 실제 CI 2주 관측과 다르다. [실행 현황](docs/roadmap-status.md), [HANDOFF §5.8](HANDOFF.md#58-main-통합-전-최종-확인-2026-10-23), [새 기준 측정](benchmarks/results/roadmap-2026-10-23/report.md)을 본다. 실제 화면 성능과 G0/G1은 별도 판정이다.

- 입력 수정 통합 검증(2026-10-22): `FUZZ_SEEDS=3000 PM_SEEDS=300 npm test` **113/113**, `npm test --prefix apps/demo/compat` **31/31**, 타입 검사·빌드 통과. Chrome 입력 84개 항목과 일반 회귀 20개, 연산 기록 30개를 확인했다. 실행 방법·지원 범위는 [`HANDOFF.md`](HANDOFF.md) §5.6, 최종 기록은 로컬 `output/validation/ime-cursor-fix-20261022/validation.json`에 있다. 이전 모노레포·Presence 검증 기록은 §5.4~5.5에 보존했다.
- 시나리오 14개: 같은 자리 동시 Enter, 그 뒤 글자, 혼자 끝에서 두 번, 끝에서 동시, 넷이 동시(동기화 순서 세 가지), Enter 대 뒷부분 입력, 걸친 범위 삭제, Enter 되돌리기 대 남의 글자, 되돌리기 대 동시 삭제, 문단 종류 동시 변경, 끊긴 동안 편집, 늦게 들어온 참여자
- 기능 15개: 서식 3 · 목록 4 · 되돌리기 3 · GC 4 · 서버 원자성 1
- 표·스키마 30개: 표 9 · 칸 합치기 6 · 칸 배경색 3 · 빈 자리·구분선 2 · 이미지 3 · 캡션 3 · 스키마 검사 1 · 다른 스키마(할 일 목록) 주입 1 · 스키마 없는 서버 1 · 표 GC 1
- ProseMirror 7개: 같은 자리 동시 Enter, Enter 의도 보존, addColumnAfter → 열 하나, 되돌리기, 서식·링크, 무작위 100 대본 × 참여자 2·3 (`PM_SEEDS` 로 바꿀 수 있다)
- 편집 API 13개: 경로 왕복, 스키마 기반 문서 에디터의 문서 내용 통째로 바꾸기·표 넣기 꼴, 열 접기(모든 행·한 행만), 열 지우기, update·merge, 링크 2, 받는 쪽 이벤트, 선택
- 무작위 3000 대본 × 참여자 2·4 × GC 끄고·켜고: 모든 참여자와 서버가 같은 문서 (갈림·오류 0). **거울 검사** — 참여자마다 편집 연산과 받는 쪽 이벤트로만 바뀌는 "편집기 쪽 모델"을 두고 매번 비교: 받는 쪽 이벤트 판마다 8만~21만 개, 어긋남 0, 검산 실패 0, normalize 가 붙은 내 편집 판마다 8~9번. 대본의 반은 표가 있는 문서에서 시작하고, 편집은 칸·상자 안에서도 한다 (300 대본 중 128 은 끝까지 표가 남는다). 칸 합치기·나누기도 섞는다 (600 대본 중 33 은 끝까지 합친 칸이 남는다)
  - 클라이언트가 만든 연산을 서버 검사가 거절한 일도 0 — 거절되면 하네스에서 오류로 잡힌다
  - GC 를 켠 대본에서 실제로 압축이 일어난다: 참여자 2 — GC 1500번·글자 5899자리, 참여자 4 — 1091번·4027자리
- 대조군 (시험이 고장을 잡는지, 스키마 이전 판에서 잼):

  | 일부러 망가뜨린 것 | 갈린 대본 (1000 중, 참여자 2 / 4) |
  |---|---|
  | RGA 규칙 | 300 중 175 |
  | GC 기준점에서 되돌리기 핀 빼기 | 28 / 41 |
  | GC 기준점에서 받은 곳(ack) 빼기 | 124 / 165 |

- 브라우저 (세 참여자, 실제 SSE): 시나리오 넷, 직접 입력, 끊고 잇기, 한글 입력, 서버 재시작 뒤 복구, 굵게와 물려받기, 리스트 들여쓰기·내어쓰기, 단어 단위 되돌리기·다시하기, GC 시나리오(토큰 12 → 7, `▒×6`)
- 브라우저 (스키마 판): 표 시나리오 둘 — 행·열 동시 추가 뒤 교차 칸에 쓰기(3×3), 열 지우기 대 칸 입력 뒤 되돌리기('!!' 와 함께 복원). 칸 합치기(→·↓ 로 2×2, 세 참여자 모두 rowSpan·colSpan 2), 칸 배경색, 이미지 넣기(커서가 캡션으로 가고, 빈 캡션엔 안내 글), 캡션 쓰기, 글 안 그림, 번호 목록 + 수준. 세 참여자 모두 같은 문서

## 아직 없는 것

| 없는 것 | 왜 / 어떻게 |
|---|---|
| 행·열 속성 | 행 높이·열 너비는 행·열 노드의 속성으로 얹으면 된다 (아직 안 함) |
| 합칠 때 글 모으기 | 지금은 가려진 칸의 글을 숨기기만 한다. 왼쪽 위 칸으로 모으려면 글을 복사해야 하는데, 그 사이 남이 그 칸에 친 글이 갈린다 |
| "하나만, 꼭 있는" 자식 | image 하나·caption 하나를 스키마로 적지 못한다 (`min`·`max`). 지금은 편집 함수가 지킨다 — image 에서 Enter 를 막고, 캡션이 그림에 합쳐지지 않게 한다. 손으로 만든 연산이면 두 번째 image 나 캡션 없는 그림이 생길 수 있다 |
| 검사의 정밀도 | 검사는 줄 단위다 — "이 줄의 어느 text 종류든 받으면 통과". 그래서 캡션이 있는 이미지 그릇 줄은 글자를 받고, image 블록에 글자를 넣는 손으로 만든 연산을 서버가 거르지 못한다 (편집 함수는 막는다). 블록 단위로 거르려면 "그 토큰이 어느 블록 안인가"가 복제본마다 같아야 하는데, 그건 지금 상태라 갈린다 (§10) |
| 스키마 기반 문서 에디터 연결 | 지금은 데모 편집기. 모델 출력이 그 에디터의 문서 JSON 꼴이니, 에디터의 모델 연산 ↔ 이 연산 변환기를 붙이면 된다 |
| 인증·권한·여러 서버 | 데모 수준. 문서 단위로 한 서버에 붙이는 라우팅이면 수평 확장이 된다 |
| 성능 | 자리 색인·블록 캐시와 SyncClient 로컬 검산 비용을 줄였다. 원격 모델 비교와 PM 전체 변환 비용은 남아 있다. 수정 전후 원자료와 모노레포 비교는 `HANDOFF.md` §5.1~5.4에 있다 |
| 오래 끊긴 참여자 | lease(2분)가 지나면 기준점에서 빠진다. 그 뒤 돌아와 끊긴 동안의 되돌리기로 이미 압축된 묘비를 살리려 하면 갈릴 수 있다. 그런 참여자에게 스냅숏부터 다시 받게 하는 처리가 아직 없다 |
| 링크·글자 색 같은 값 서식 | 지금 서식은 켜기/끄기뿐. 같은 글자별 LWW 로 값 서식도 얹을 수 있다 |
