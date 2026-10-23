# Doc Sync 상태 및 동기화 명세

상태: 2026-10-23 구현 기준 초안. 이 문서는 현재 계약과 알려진 제한을 기록한다. 독립 검토 완료, 제품 연동 승인, 배포 승인 또는 2주 연속 운영 성공을 뜻하지 않는다. 공개 패키지는 `@barocss/doc-sync` 하나다. 데모와 벤치마크는 비공개 작업 공간이다.

## 1. 범위와 용어

- `Doc`: 토큰 줄과 시계를 가진 복제본이다.
- `Item`: 글자, 노드 또는 줄 머리 토큰이다. 삭제된 토큰도 순서 기준으로 남는다.
- `Ticket`: `{lamport: number, actor: string}`이다. Lamport 번호를 먼저 비교하고, 같으면 actor 문자열을 비교한다. 키는 `lamport@actor`다.
- `Change`: 한 actor가 보낸 wire 연산 묶음이다. `seq`는 actor별 1부터 증가한다.
- `Envelope`: 서버 로그의 항목이다. `serverSeq`는 문서별 1부터 증가한다. 편집 또는 GC 기준점을 담는다.
- 모델: 스키마로 저장 상태를 해석한 `NodeJSON`이다. 저장 토큰 목록과 다르다.

구현 근거는 `packages/doc-sync/src/crdt/{doc,ticket,history,model}.ts`, `src/sync/{protocol,client}.ts`, `src/server/hub.ts`다. 스키마는 소비자가 주입한다. 코어는 데모의 구체적인 문단·표 종류를 내장하지 않는다.

## 2. 상태와 순서

각 줄은 머리 토큰과 RGA 순서의 토큰 목록을 가진다. 본문 머리는 `0@~root`다. 노드의 `body`, `rows`, `cols`, `cell:행키,열키` 자리는 주인 ID와 자리 이름으로 머리 ID를 결정한다. 별도의 자리 생성 연산은 없다.

각 토큰은 ID, 삽입 기준 `origin`, 종류, 태어난 노드 종류 `born`, 경계, LWW 속성, 삭제 ID 집합과 취소 ID 집합을 가진다. 같은 기준 뒤에 동시에 삽입한 토큰은 큰 Ticket 쪽을 먼저 둔다. 인과 의존 연산은 기준 토큰보다 나중에 적용해야 한다. `Doc.apply`는 임의 순서의 의존 연산을 보관하는 네트워크 버퍼가 아니다.

토큰이 압축되지 않았고 취소되지 않은 삭제가 하나도 없을 때만 살아 있다. 같은 글자에 A와 B의 삭제가 있으면 A의 삭제만 취소해도 글자는 살아나지 않는다. 속성은 토큰과 키별로 가장 큰 쓰기 Ticket의 값이 이긴다.

## 3. Wire 연산 다섯 가지

| `t` | 필드 | 효과 |
|---|---|---|
| `text` | `id`, `origin`, `text`, 선택 `marks` | 문자열의 각 UTF-16 code unit을 연속 ID로 삽입한다. 첫 토큰 뒤의 각 토큰은 바로 앞 토큰을 기준으로 삼는다. |
| `node` | `id`, `origin`, `type`, 선택 `boundary`, `attrs` | 노드 표지를 삽입한다. text 모양 노드는 경계를 가져야 한다. |
| `del` | `at`, `ids` | 대상마다 삭제 ID `at`를 추가한다. |
| `undel` | `at`, `cancels`, `ids` | 대상마다 지정한 삭제 ID만 취소한다. |
| `set` | `at`, `ids`, `key`, `value` | 대상 속성에 LWW 값을 쓴다. 글자 서식과 노드 속성, `$type`, 표 내부 키도 이 연산을 쓴다. |

이미 저장된 삽입 ID와 중복 삭제·취소·속성 쓰기는 다시 전달되어도 같은 상태를 유지해야 한다. 이 성질은 유효하고 동일한 연산의 재전송에 대한 것이다. 같은 ID에 다른 내용을 담은 악성 요청을 허용한다는 뜻은 아니다.

노드 이동과 트리 절단 연산은 없다. 연속 글자를 하나의 실제 저장 항목으로 바꾸거나 wire를 이진 형식으로 바꾸는 변경도 이 명세에 포함하지 않는다.

## 4. 모델과 편집 계약

`Doc.toJSON()`은 살아 있는 저장 상태와 스키마를 읽는다. text·flow·grid·atom 모양을 해석하고 목록 묶음, 기본 속성, 인접 run, 표 칸과 span을 정규화한다. 모델에 삭제 장부나 압축 묘비를 노출하지 않는다. 표의 합친 칸 아래 내용은 저장에 남지만 가려진다. 합치기가 내용을 수집하거나 이동하지 않는다.

Enter는 text 노드 표지를 삽입한다. 같은 왼쪽·오른쪽 경계를 본 동시 Enter 표지는 한 보이는 블록으로 흡수한다. 앞선 Enter를 본 뒤 다시 Enter를 하면 경계가 달라지므로 별도 블록이다. 문단 합치기는 표지를 지운다. 가상 빈 블록과 full-grid 해석은 모델 정규화의 일부다.

모델 편집은 `insert`, `delete`, `update`, `split`, `merge`를 사용한다. 경로는 모델 자식 번호와 text 안의 자리다. 내 편집은 wire 연산과 필요할 때 정규화 편집을 낸다. 원격 변경·undo·redo·snapshot·reset은 `onModelEvents` 구독자가 있을 때 모델 편집 이벤트를 낸다. 이벤트를 이전 모델에 적용한 결과는 이후 모델과 같아야 한다. 검산에 실패하면 전체 자식을 교체하는 fallback을 사용한다. 계산 비용 최적화는 이 계약을 바꾸지 않는다.

### 문자 단위의 알려진 제한

저장과 `Pos.o`는 UTF-16 토큰 단위다. `model.ts`의 `runsToUnits`는 문자열 순회로 code point 단위를 만든다. 예를 들어 `가😀`는 저장 글자 토큰 3개이며 모델 Unit은 2개다. 사용자에게 보이는 grapheme 하나와도 같지 않다. 어댑터는 이 차이를 명시적으로 변환해야 한다.

`History.idsOf(text)`는 저장과 같은 UTF-16 길이로 모든 삽입 ID를 기록한다. 보조 평면 문자를 포함한 입력을 undo할 때 surrogate pair 일부나 뒤 글자가 남던 결함을 고쳤다. `history-unicode.test.ts`는 혼합 문자열·여러 보조 평면 문자·결합 문자열의 삽입 undo/redo와 다른 actor의 입력·삭제 보존을 확인한다. 이 수정은 모델 Unit의 code point 좌표를 바꾸지 않는다. BMP 한글과 ASCII로 수행한 장기 시험을 모든 Unicode 편집의 증거로 확대하지 않는다.

## 5. Undo와 redo

`History`는 actor의 로컬 편집을 기록한다. undo는 과거 모델을 덮어쓰지 않고 새 반대 연산을 만든다. 삽입 undo는 해당 ID를 지우고, 삭제 undo는 그 기록이 만든 삭제 ID만 취소한다. 다른 actor의 입력과 삭제는 유지한다. 속성 undo는 현재 쓰기 ID가 자신이 기록한 ID일 때만 이전 값을 쓴다. 다른 actor의 나중 쓰기를 덮어쓰지 않는다.

연속 타이핑은 커서와 시간 창 조건에 따라 한 기록으로 묶인다. 기록 깊이는 현재 100이며 타이핑 창은 1500ms다. undo와 redo가 되살릴 수 있는 삭제의 가장 이른 서버 번호를 GC pin으로 보낸다. `clear()`는 이 기록과 pin을 해제한다.

## 6. 검사와 원자성

`Doc.check(ops)`는 현재 생존 여부나 현재 변경 가능한 노드 종류보다 불변 사실을 사용한다. 기준·대상 ID, 소속 줄, 태어난 종류, 자리와 스키마 호환성을 확인한다. 같은 Change 안의 앞선 생성도 뒤 연산의 기준이 될 수 있다. 삭제된 대상이라는 이유만으로 인과적으로 유효한 편집을 거절하지 않는다.

`DocHub.submit`은 actor별 다음 `seq`를 요구한다. 이미 받은 `seq`는 중복으로 무시한다. 빠진 `seq`나 검사 실패는 적용 전에 거절한다. 검사에 실패한 Change는 부분 적용하지 않는다. 데모 HTTP 계층은 거절을 409로 전한다.

이 검사는 인증·권한·요청 크기 제한·rate limit을 대신하지 않는다. 악성 JSON 전체 형태와 숫자 범위 검사의 완전성, actor 권한 검증과 운영 보안 승인은 별도 단계다.

## 7. 동기화와 재접속

전송 계층은 actor가 보낸 `Change`와 `Ack`를 같은 FIFO 순서로 서버에 전해야 한다. 서버는 수락 순서대로 `serverSeq`를 붙인다. 클라이언트는 이미 받은 서버 번호를 무시한다. 연결 뒤 확인되지 않은 pending Change를 재전송하고 서버 중복 제거로 정리한다.

`hello(0)`은 snapshot, 삭제 ID별 서버 번호, presence, 선택적인 actor별 마지막 수락 번호를 준다. 클라이언트는 수락된 pending을 제거한 뒤 아직 수락되지 않은 변경만 snapshot 위에 얹는다. `hello(since > 0)`은 snapshot 없이 이후 로그 전달을 사용한다. presence는 문서 편집 로그와 별도이며 anchor와 focus 토큰 키를 가진다.

현재 서버는 전체 로그를 보관한다. 로그 prefix 제거 뒤의 복구 계약은 없다. 데모의 JSONL replay는 기존 Envelope를 순서대로 재생한다. 새 장기 하네스는 JSON 왕복한 전체 로그로 새 메모리 hub를 만들고 fresh peer가 snapshot으로 이어지는지 확인한다. 디스크 쓰기 실패나 실제 프로세스 crash 원자성 시험은 아니다.

## 8. GC와 lease

기다려야 할 peer의 ack 번호와 `pin - 1` 중 최소값이 frontier다. offline peer는 설정한 lease가 지나면 frontier 계산에서 제외한다. 기본 lease는 무한대다. 서버는 안정된 삭제를 압축하고 같은 frontier를 GC Envelope로 로그에 넣는다. 클라이언트도 같은 로그 위치에서 압축한다.

압축은 글자 내용과 장부를 버리고 순서 기준을 남긴다. 연속 묘비는 span으로 합칠 수 있으며 옛 ID 조회는 해당 span으로 이어진다. 압축은 모델을 바꾸지 않아야 한다. pin이 있는 삭제는 frontier를 넘기 전까지 압축하면 안 된다.

**미구현 종료 조건:** lease가 만료된 옛 클라이언트의 undo 기록과 pending을 버리고 snapshot에서 새 세션을 만드는 프로토콜은 없다. lease 계산 존재만으로 만료 복구가 안전하다고 판정하지 않는다. 새 CI는 이 항목을 합격 처리하지 않는다.

## 9. 검증과 장기 관측

`packages/doc-sync/test/properties.test.ts`는 독립 연산 교환, 다섯 연산 중복, 인과 의존 지연, GC 모델 불변, 묘비 비노출, 문자 단위 경계를 확인한다. 기존 fuzz·시나리오·PM 시험은 더 넓은 편집 동작과 거울 모델을 검사한다. 유한한 시험은 모든 실행에 대한 수학적 증명을 뜻하지 않는다.

새 `.github/workflows/long-fuzz.yml`은 매일 UTC 18:23과 수동 실행을 지원한다. 8개 shard 각각 8 peer와 최소 125,000개 수락된 wire Op를 실행한다. 합계는 최소 1,000,000개다. 한 Change나 문자 수를 Op 수로 대신 세지 않는다. 메모리 증가를 제한하려고 약 512 Op의 문서 묶음을 새로 시작한다. 따라서 단일 문서에 100만 연산을 계속 쌓은 시험과 다르다.

각 shard는 지연된 FIFO 전달, 중복 제출, GC, 전체 로그 replay로 hub 교체, 새 peer snapshot 연결을 확인한다. seed, 실행 시각, 실제 횟수, 제외 범위, 소스 SHA와 Node 버전을 artifact로 남긴다. 최소 권한은 `contents: read`이며 외부 secret을 사용하지 않는다. CI 추가 자체는 GitHub에서 실행 성공한 증거가 아니다. 2주 연속 성공은 실제 실행 artifact 14일치를 별도로 확인해야 한다.

로컬 집중 시험:

```sh
node --test packages/doc-sync/test/properties.test.ts
node packages/doc-sync/test/long-fuzz.ts --ops 1000 --peers 8 --seed 23 --out output/long-fuzz/smoke.json
```

CI와 같은 shard 실행:

```sh
node packages/doc-sync/test/long-fuzz.ts --ops 125000 --peers 8 --seed 1 --out output/long-fuzz/seed-1.json
```

Node 22.19.0을 사용한다. 장기 하네스는 `.test.ts`가 아니므로 기본 `npm test`가 100만 연산을 자동 실행하지 않는다. 실제 OS 한글 IME, 인증·운영 보안, 스키마 migration, 로그 압축·장애 복구, 목적 제품 통합과 배포는 이 단계의 완료 범위 밖이다.
