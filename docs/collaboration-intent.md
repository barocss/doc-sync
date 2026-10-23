# 동시편집 의도 보존 규칙

2026-10-23 현재 구현 기준이다. 기존 동시편집 정책을 설명하고, 삭제·서식·삽입·undo가 겹치는 사례의 기대 결과를 정한다. 이 문서는 새 병합 정책을 도입하지 않는다.

**수렴**은 같은 유효 연산을 받은 복제본들이 같은 모델을 만드는 성질이다. **의도 보존**은 정해 둔 편집 의미를 병합 결과가 유지하는 성질이다. 수렴만으로 글의 의미나 모든 사용자의 희망을 만족시키지는 못한다. 아래 사례는 사람이 합의한 문서 의미 전체를 검증하는 시험이 아니다.

## 1. 읽는 방법과 전제

예시는 처음에 일반 글자인 ASCII `abc` 또는 `abcd`에서 시작한다. `X`와 `Y`는 새 글자다. 굵기가 없다는 뜻은 모델의 `marks`에 `bold: true`가 없다는 뜻이다.

- **동시**: 각 사용자가 상대 변경을 받기 전에 같은 기준 상태에서 연산을 만든다. 벽시계의 같은 밀리초를 뜻하지 않는다.
- **관측 후**: 앞 변경을 해당 복제본이 적용한 뒤 다음 연산을 만든다. 이 인과 순서는 전달 순서 시험에서도 유지한다.
- 숫자 위치는 연산을 만드는 시점의 모델 경로다. 생성된 삭제·서식은 그때 지정한 토큰 ID를 대상으로 한다. 수신 시 바뀐 숫자 위치의 글자를 다시 고르지 않는다.
- undo는 각 actor의 해당 편집 기록을 취소한다. 기준 문서의 입력과 시험할 행동을 같은 기록으로 묶지 않는다.
- history 기록과 대상 토큰이 유지되는 범위다. 기록을 비운 뒤의 GC, lease 만료 복구와 세션 간 undo 복원은 이 표의 보장이 아니다.

저장 위치 `Pos.o`는 UTF-16 토큰 단위다. 아래 고정 사례는 ASCII를 쓴다. 이 결과를 grapheme 단위 편집이나 실제 OS IME 결과로 확대하지 않는다. 문자 단위의 한계는 [상태 명세](spec.md#문자-단위의-알려진-제한)에 있다.

## 2. 기존 규칙

### 2.1 삭제와 서식은 별도 상태다

삭제는 토큰에 삭제 ID를 추가한다. 서식은 토큰의 속성에 쓰기 Ticket을 기록한다. 삭제된 미압축 토큰에도 유효한 서식 쓰기를 적용할 수 있다. 숨겨진 글자에 Bold를 적용해도 글자가 살아나지는 않는다. 해당 삭제를 취소하면 그때의 서식으로 다시 보인다.

다른 actor도 같은 글자를 지웠다면 한쪽 삭제만 취소해도 숨김 상태가 유지된다. 삭제 undo는 자기 기록의 삭제 ID만 취소한다.

### 2.2 범위는 생성 시 지정한 ID 집합이다

삭제·서식 범위는 연산 생성 시 해당 Doc에서 본 대상이다. 범위 안에 다른 사용자가 동시에 넣은 새 ID를 소급해서 삭제하거나 서식 지정하지 않는다. 삽입 undo도 자신의 삽입 ID만 지운다. 그 ID를 기준으로 다른 사람이 넣은 글자는 유지한다.

서식은 일반적인 “앞으로 이 구간에 들어올 모든 글자”라는 지속 규칙이 아니다. 이 선택은 기존 `features.test.ts`의 동시 서식·삽입 계약을 유지한다.

### 2.3 새 입력의 서식은 생성 시 정한다

기본 문자열 입력은 **그 연산을 생성하는 Doc에서 당시 본 왼쪽 글자**의 상속 가능한 서식을 읽어 삽입 연산에 담는다. 수신 시 왼쪽 글자의 최신 서식을 다시 읽지 않는다. 블록 맨 앞에는 같은 블록의 왼쪽 글자가 없으므로 이 상속을 하지 않는다. 명시한 marks는 기본 상속보다 우선한다.

데모 스키마의 Bold·Italic 등은 상속한다. 링크는 기본 상속 대상이 아니다. 스키마가 다른 소비자는 그 스키마의 `inherit` 계약을 따라야 한다. 근거는 `commands.ts`의 `insertText`, `edit.ts`의 `insertUnits`, `model.ts`의 `inheritedMarks`, `doc.ts`의 `text` 적용이다.

따라서 동시 삽입과 서식을 관측한 뒤의 삽입은 결과가 다를 수 있다. 이미 새 ID가 갖게 된 서식은 원래 글자에 대한 다른 actor의 서식 undo 대상에 포함되지 않는다.

### 2.4 같은 속성은 Ticket으로 결정한다

서식 키가 다르면 함께 적용할 수 있다. 같은 글자에 Bold와 Italic을 쓰면 둘 다 남는다. 같은 키의 다른 값은 큰 Ticket의 쓰기가 이긴다. Lamport 번호를 먼저, 같으면 actor 문자열을 비교한다. 도착 속도나 실제 시각을 비교하는 규칙이 아니다.

같은 값의 독립 쓰기도 다른 쓰기 ID다. 화면이 그대로여도 현재 쓰기의 소유권은 바뀔 수 있다.

### 2.5 서식 undo·redo는 현재 알고 있는 쓰기를 검사한다

`History.SetStep`은 대상 토큰과 속성 키마다 편집 전·후의 상태를 기록한다. 각 상태에는 값과 쓰기 Ticket이 있다. 현재 Ticket이 undo의 편집 후 상태 또는 redo의 편집 전 상태와 정확히 같을 때만 값을 쓴다. redo는 해당 대상의 undo가 실제 적용된 경우에만 가능하다.

같은 `History` 안에서 실제 이전 Ticket이 일치한 연속 쓰기는 상태 참조를 공유한다. 성공한 undo·redo는 복원한 상태의 Ticket을 새 연산 ID로 갱신한다. 이 연결로 켜기→끄기→undo→undo와 그 반대 redo를 순서대로 수행한다. 상태의 값은 바꾸지 않는다.

- 다른 쓰기를 **이미 받은 뒤** 앞선 서식을 undo하면 현재 Ticket이 달라 그 대상을 건너뛴다. 같은 값의 새 쓰기도 보호한다. 범위 일부만 달라졌다면 나머지 대상만 취소한다.
- 새 기록의 실제 이전 Ticket이 다르면 상태 연결을 끊는다. actor 이름이나 값만 같다는 이유로 연결하지 않는다. 같은 actor의 미기록 쓰기와 독립 `History`의 쓰기도 구분한다.
- undo는 그 행동 전에 관측한 값을, redo는 그 행동의 값을 **새 Ticket으로** 쓴다. 과거 모델을 덮어쓰거나 과거의 경쟁 쓰기 중에서 승자를 다시 뽑지 않는다.
- 아직 받지 못한 원격 쓰기와 undo가 경쟁하면 로컬 검사만으로 그 쓰기를 보호할 수 없다. 둘은 일반 LWW 규칙으로 합쳐진다.
- 이 조건은 모든 사람의 서식 의도를 계속 누적해서 보존한다는 보장이 아니다. 아래 I04의 승자 undo 규칙도 유지한다.

## 3. 회귀 사례 행렬

각 행은 `packages/doc-sync/test/intent-preservation.test.ts`의 같은 ID와 연결된다. 중간 상태도 시험한다. 아래 문단에서 강조한 글자와 실제 시험의 전체 `NodeJSON`·marks가 일치해야 한다.

| ID | 초기 상태와 행동 | 병합 및 취소의 기대 결과 |
|---|---|---|
| I01 | `abc`. A가 `c` 삭제, B가 `c` 또는 `bc`를 Bold, C가 `b/c` 사이에 일반 `X`를 동시 삽입 | `c`는 숨겨지고 `X`는 일반 글자로 남는다. B가 `bc`를 고른 경우 살아 있는 `b`는 굵다. A undo 후 `c`는 B의 서식으로 복원된다. B를 먼저 undo하면 삭제는 유지된다. A/B 둘 다 undo하면 일반 `abXc`다. 각 기록의 redo로 처음 병합 결과를 복원한다. |
| I02 | `abcd`. A가 `bc` 삭제, B가 `c` 삭제, C가 `b/c` 사이에 `X` 삽입 | 처음 `aXd`. A만 undo하면 `abXd`, B만 undo하면 `aXd`. 두 삭제를 모두 취소하면 `abXcd`. 새 `X`는 다른 actor의 삭제·undo 대상이 아니다. |
| I03 | I01의 `bc` 서식 사례를 병합한 뒤, C가 살아 있는 `b`의 Bold를 true 또는 false로 다시 쓰고 A/B가 이를 받음 | A/B의 undo·redo는 C의 값과 쓰기 Ticket을 덮어쓰지 않는다. 둘 다 undo한 뒤 true이면 `b`만 굵은 `abXc`, false이면 일반 `abXc`다. 같은 값의 새 쓰기와 C의 `X`도 유지한다. |
| I04 | A/B가 같은 일반 글자들에 독립적으로 `bold=true` 쓰기 | 같은 Lamport의 actor B가 승자다. 패자 A의 undo는 건너뛴다. 승자 B의 undo는 B가 본 일반 상태를 새로 쓴다. A의 패자 Bold를 재선출하지 않는다. 두 undo 순서 모두 일반 글자가 된다. |
| I05 | `abc`. A가 `bc`를 Bold. B가 이를 받은 뒤 `b/c` 사이에 `X` 삽입 | `bXc`가 굵다. A 서식 undo 후 원래 `b/c`는 일반 글자지만 B가 태어날 때 상속한 `X`는 굵게 남는다. B 삽입 undo는 `X`만 지운다. 둘 다 undo하면 일반 `abc`다. |
| I06 | `abcd`. A가 `bc`를 Bold, B가 `cd`를 Italic | `b`는 Bold, `c`는 Bold+Italic, `d`는 Italic이다. 한쪽 undo는 자기 키만 취소한다. 둘 다 undo하면 일반 `abcd`, redo하면 두 서식을 복원한다. |
| I07 | `ab`. A가 사이에 `X` 삽입. B가 이를 받은 뒤 `X` 뒤에 `Y` 삽입하고 `X`를 Bold | 병합은 `X`만 굵은 `aXYb`다. A undo는 `aYb`, A redo는 `X`만 굵은 `aXYb`다. B의 `Y`와 X에 쓴 서식 Ticket은 유지한다. |
| I08 | `abc`. A가 `bc`의 Bold=true, B가 같은 대상의 Bold=false를 독립 쓰기 | 같은 Lamport에서는 actor B의 false가 이겨 일반 `abc`다. 서버 수락 순서를 바꿔도 B의 값과 쓰기 Ticket으로 모인다. |
| I09 | 다른 사용자의 쓰기를 받기 전에 서식 undo를 생성 | undo도 새 속성 쓰기다. 미수신 쓰기와의 경쟁은 Ticket LWW를 따른다. “원격 쓰기면 무조건 보호”를 기대하지 않는다. |
| I10 | `abcd`. 같은 `b/c` 경계를 본 A/B가 동시 Enter | `ab│cd` 한 번의 분할로 보인다. 한쪽 표지 undo 후에도 분할이 남고, 둘 다 undo하면 `abcd`다. 한쪽 또는 양쪽 redo 뒤에도 `ab│cd`다. 관측한 뒤 새 Enter는 별도 분할이라는 기존 규칙을 유지한다. |

I04는 사람의 모든 의도를 만족시키는 결과라는 뜻이 아니다. 현재 LWW와 조건부 undo가 정한 결과를 명시한다. 반대로 I05의 `X` 서식을 A undo로 지우면 B가 실제로 만든 삽입 속성을 덮어쓰게 된다. 이 두 사례를 구분한다.

### 3.1 I09의 구체적인 링크 경쟁

일반 글자 `b`에 URL0을 적용하고 모두 받는다. 취소할 사용자 U가 URL1로 바꾼 뒤 모두 받는다. 그다음 상대가 URL2 쓰기를 만들고, U는 그 쓰기를 받기 전에 undo를 만들어 URL0을 쓴다. 이 단계의 두 쓰기는 실제 같은 Lamport 번호다.

- U가 actor `Z`, 상대가 `A`이면 undo의 Ticket이 커서 URL0이 남는다. U redo는 URL1을 쓴다.
- U가 actor `A`, 상대가 `Z`이면 상대 URL2가 남는다. U redo는 현재 소유권이 달라 건너뛰며 URL2를 유지한다.

각 경우 두 서버 수락 순서를 검사한다. URL0/1/2는 시험의 `https://zero.example`, `https://one.example`, `https://two.example`다. 이 사례는 “서식 undo가 미수신 원격 변경도 항상 보존한다”는 보장이 없음을 명시한다.

## 4. 시험의 관측 관계와 판정

독립 사례는 기준 문서를 모두 받은 뒤 각 로컬 Doc에서 연산을 먼저 생성한다. 그다음 `commit` 호출 순서만 바꿔 서버 수락 순서를 바꾼다. 같은 actor의 FIFO나 기준 토큰 생성보다 앞선 의존 연산 적용을 허용하지 않는다. 관측 후 입력 사례에서는 앞 변경을 먼저 전달한다.

시험은 다음을 함께 검사한다.

1. 최초 삭제·서식 대상이 기준 상태의 의도한 ID인지 확인한다.
2. 실제 서버 수락 순서가 해당 실행의 계획과 같은지 확인한다.
3. 병합·각 undo·각 redo 뒤에 고정한 전체 모델과 marks를 비교한다.
4. 모든 클라이언트와 hub 모델, pending 0, snapshot의 새 해석 결과를 확인한다.
5. 서식 소유권 사례에서는 값만 비교하지 않고 쓰기 Ticket도 확인한다.

두 복제본이 같은 잘못된 모델을 만드는 것만으로 통과하지 않는다. 허용된 연산 순열의 유한한 사례이며 모든 스케줄에 대한 증명은 아니다.

```sh
node --test packages/doc-sync/test/intent-preservation.test.ts packages/doc-sync/test/history-format.test.ts
FUZZ_SEEDS=3000 PM_SEEDS=300 npm test
npm test --prefix apps/demo/compat
npm run typecheck
```

Node 22.19.0을 사용한다. 기본 `npm test`도 새 `.test.ts`를 포함한다. 추가된 사례 수와 최신 실행 기록은 [HANDOFF §5.12](../HANDOFF.md#512-연속-서식-undoredo-수정-2026-10-23)에 있다.

## 5. 연속 서식 undo·redo 회귀

일반 `ab`에서 A가 `a`의 Bold를 켜고, 끄고, 두 번 undo하면 일반 `ab`로 돌아온다. 이어 두 번 redo하면 굵은 `a`를 거쳐 다시 일반 `ab`가 된다. 이전 구현에서는 첫 undo가 만든 새 Ticket을 오래된 기록이 인식하지 못해 두 번째 undo를 건너뛰었다. 이 결함을 수정했다. 수정 전 기본 3개 실패와 수정 후 실행 자료는 HANDOFF §5.12에 있다.

`packages/doc-sync/test/history-format.test.ts`는 다음 19개 실행을 검사한다. HF07은 true/false 두 경우다.

| ID | 고정 회귀 범위 |
|---|---|
| HF01–HF03 | 켜기·끄기 반복 undo/redo, 한 commit 안의 연속 쓰기, 겹친 범위의 서로 다른 이전 값 |
| HF04–HF06 | 서로 다른 서식 키, 링크 값·제거, 블록 종류의 연속 변경 |
| HF07–HF09 | 관측한 원격 같은 키의 부분 쓰기, undo 사이 같은 값 쓰기, 다른 키 보존 |
| HF10–HF11 | 같은 actor의 미기록 쓰기와 독립 History를 자기 기록으로 취급하지 않음 |
| HF12–HF14 | 새 분기의 redo 폐기, clearHistory, 깊이 100의 오래된 기록 폐기 |
| HF15–HF16 | 그룹 내부의 부분 겹침, 원격 이전 값을 복원한 뒤 오래된 로컬 소유권을 되살리지 않음 |
| HF17–HF18 | 같은 키의 undo 후 새 분기, 성공한 undo 뒤 원격 부분 쓰기를 보존하는 redo/undo 반복 |

각 단계의 고정 전체 모델을 모든 client와 hub에서 비교하고 pending 0과 snapshot 재해석을 확인한다. 원격 쓰기 보존 사례는 값과 실제 Ticket을 함께 검사한다. 상태 참조 캐시는 해당 History에만 있으며 wire·snapshot에 넣지 않는다. 기록 폐기 시 참조를 해제하고 clear는 스택과 캐시를 비운다. 그룹 수 100이 모든 문서의 절대 메모리 상한이라는 뜻은 아니다.

저장소 루트에서 재현할 수 있다. 마지막 출력은 일반 `ab`이며 `bold: true`가 남지 않아야 한다.

```sh
node --input-type=module <<'JS'
import {MemoryNet} from './packages/doc-sync/test/harness.ts';
import * as cmd from './packages/doc-sync/src/crdt/commands.ts';
const net = new MemoryNet(), a = net.add('A'), b = net.add('B');
a.connect(); b.connect();
try {
  await net.settle();
  a.commit(cmd.insertText(a.doc, {b: 0, o: 0}, 'ab'), null);
  await net.settle();
  for (const value of [true, false]) {
    a.commit(cmd.setMark(a.doc, {b: 0, o: 0}, {b: 0, o: 1}, 'bold', value));
    await net.settle();
  }
  a.undo(); await net.settle();
  a.undo(); await net.settle();
  console.log(JSON.stringify(a.doc.toJSON()));
} finally {
  a.disconnect(); b.disconnect();
}
JS
```

## 6. 이 명세로 완료 처리하지 않는 범위

- 선택 없는 Bold는 데모의 로컬 `typingMarks`다. 코어의 빈 범위 `setMark`는 기존 글자를 바꾸지 않는다. 다음 입력·커서 이동·IME에서의 UI 상태는 이 코어 시험의 증거가 아니다.
- 링크의 기본 비상속, Unicode undo, 구조/표/숨은 칸, 같은 자리 Enter와 GC pin에는 기존 별도 시험이 있다. 새 행렬이 그 전체 범위를 대신하지 않는다.
- 수정한 History의 Chrome 회귀 범위는 HANDOFF §5.12에 기록한다. CDP 조합 입력을 실제 OS IME 시험으로 확대하지 않는다. 화면 성능은 이번 수정에서 재측정하지 않았으며 이전 측정은 해당 소스의 과거 근거다.
- 의미가 반대인 편집을 모두 만족시키는 자동 병합, 충돌 검토 UI·제안 모드, 기록의 장기 보존, lease 만료 복구와 전체 제품 의도 보존 승인은 포함하지 않는다.
