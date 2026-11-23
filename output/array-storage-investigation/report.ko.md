# JS 배열 저장 방식 조사

결론: Chrome/V8의 일반적인 밀집 배열은 연결 리스트가 아니다. 현재 `Doc.Line.items`에서 확인한 병목 후보는 원소 번호 접근 자체보다 자리 검색, 중간 삽입에 따른 참조 이동, 모델 작업이다. 이 조사는 전체 편집기 병목을 확정하지 않는다.

## 확인 범위

- 작업 경로: `/Users/user/github/doc-sync-d1`.
- 기준 커밋: `dafe2c762a205f4570e3e9cbefc008befd5b866c`. 작업 트리에 다른 에이전트의 변경이 있다. 이 조사는 제품 소스를 수정하지 않았다.
- Node 검사 시 `crdt/doc.ts` SHA-256: `2b56d2833cbb38457ba26fd053c6cf659778088e7e10ae81b82ccb1a5774132c`.
- Chrome 타이밍: 설치된 Google Chrome 156, 별도 `array-storage-research` 세션, about:blank. Node 내부 검사: Node 24.22.1 / V8 13.6.233.17-node.58. 서로 다른 V8 버전의 증거다.

## 공식 자료

- [V8 Elements kinds](https://v8.dev/blog/elements-kinds): packed/holey, Smi/double/object 종류를 구분한다.
- [V8 Fast properties](https://v8.dev/blog/fast-properties): 숫자 인덱스의 elements store는 일반적으로 배열이며, 희소 배열은 dictionary 표현을 사용할 수 있다.
- [V8 현재 fields-and-elements.md](https://chromium.googlesource.com/v8/v8/+/main/docs/objects/fields-and-elements.md): object packed elements는 FixedArray, double elements는 FixedDoubleArray, dictionary elements는 NumberDictionary 해시 테이블이다. 큰 배열이 다른 표현으로 바뀔 수 있지만, 연결 리스트라는 설명은 없다.
- [V8 현재 array-splice.tq](https://chromium.googlesource.com/v8/v8/+/main/src/builtins/array-splice.tq): fast splice는 뒤쪽 원소를 이동한다. 공간이 부족하면 backing store를 늘리고 복사한다. 이동하는 값은 객체 참조이며 각 Item 객체 전체를 복제하는 뜻은 아니다.
- 두 현재 소스는 이 폴더에 보관했다. main 브랜치 자료이며 Chrome 156의 정확한 소스 리비전을 고정한 증거는 아니다.

## 현재 소스

- `packages/doc-sync-core/src/crdt/doc.ts:69`: `Line.items: Item[]`. `:320`에서 `[]`로 만들고 `:324`에서 root를 push한다.
- `:1022`: origin의 위치를 hint 또는 `Doc.indexOf`로 찾는다. `:1024`는 CRDT 순서에 따라 이웃을 추가로 검사한다. `:1029`에서 `line.items.splice(i, 0, item)`을 호출한다.
- `:1042`의 `Doc.indexOf`는 `Array.prototype.indexOf`와 다르다. 캐시한 `item.index`를 직접 검사한다. 값이 맞지 않으면 최대 256회의 삽입으로 생긴 이동 범위를 검사한다. 오래된 캐시는 전체 line을 reindex한다. 따라서 항상 선형 검색을 한다고 설명하면 틀린다.
- `:935`, `:953`에는 별도 `block.chars.indexOf` 검색도 있다.
- `Doc.items`는 main line이다. 일반 문단은 각자 별도 Line을 가진다는 가정은 틀리다. main line은 문단 표지와 그 글자를 함께 포함한다. 컨테이너 slot 등은 다른 line이다.
- `crdt/key-index.ts`의 KeyIndex는 ID에서 Item을 찾는 별도 구조다. actor/range 검색과 최대 256개 dense 값 배열, 희소 Map을 쓴다. Line.items의 저장 표현과 혼동하면 안 된다.

## 실제 Doc 배열 내부 검사 — Node 전용

100,000개 글자 text op를 실제 Doc.apply에 적용했다. main에는 root 포함 100,001개 Item이 있었다. 중간에 한 글자를 넣은 뒤에는 100,002개였다. 두 시점 모두 fast=true, objects=true, holey=false, dictionary=false였다. Node V8의 packed object elements라는 증거다. Chrome의 내부 종류를 검사한 결과는 아니다.

1,000,000개 밀집 객체 배열도 같은 결과였다. 대조군 `sparse[10000000] = object`는 dictionary=true였다. 길이만으로 연결 리스트가 된다는 주장을 지지하지 않는다.

## Chrome 제한 벤치마크

객체 생성은 측정 밖에서 했다. 값은 매회 합계로 소비했다. 각 조건은 3회 준비 실행 뒤 11회 측정했다. 아래 값은 배치 시간을 연산 수로 나눈 값이다. p95는 11개 표본에서 최대값과 같다. 통계적 꼬리 지연 보장은 아니다.

| 크기 | 연산 | 배치 연산 수 | median ns/연산 | p95 배치 ms |
|---:|---|---:|---:|---:|
| 10,000 | direct-sequential | 1,000,000 | 1.60 | 1.700 |
| 10,000 | direct-random | 1,000,000 | 1.60 | 1.700 |
| 10,000 | array-indexOf-random-existing | 4,096 | 439.45 | 1.900 |
| 10,000 | middle-insert-remove-pair | 4,096 | 7299.80 | 30.900 |
| 10,000 | linked-list-locate-middle | 256 | 5859.38 | 1.600 |
| 100,000 | direct-sequential | 1,000,000 | 1.40 | 1.500 |
| 100,000 | direct-random | 1,000,000 | 1.80 | 1.900 |
| 100,000 | array-indexOf-random-existing | 1,024 | 3808.59 | 6.100 |
| 100,000 | middle-insert-remove-pair | 1,024 | 72265.62 | 77.500 |
| 100,000 | linked-list-locate-middle | 32 | 40625.00 | 2.200 |
| 1,000,000 | direct-sequential | 1,000,000 | 1.20 | 1.500 |
| 1,000,000 | direct-random | 1,000,000 | 8.40 | 9.000 |
| 1,000,000 | array-indexOf-random-existing | 128 | 39062.50 | 5.100 |
| 1,000,000 | middle-insert-remove-pair | 128 | 69531.25 | 9.200 |
| 1,000,000 | linked-list-locate-middle | 8 | 349999.99 | 2.800 |

순차/랜덤 직접 접근은 각각 배치당 1,000,000회다. indexOf는 기존 객체를 찾는다. splice는 중간 삽입과 즉시 제거의 한 쌍이다. 삭제는 CRDT의 del과 다르다. CRDT del은 묘비를 남긴다. 연결 리스트 대조군은 수작업으로 만든 노드의 시작점부터 중간까지 탐색한다. 이미 찾은 노드 옆에 삽입하는 비용은 측정하지 않았다.

이 실행에서 직접 랜덤 접근은 10k의 1.6 ns에서 1m의 8.4 ns로 증가했다. 이는 객체 참조 접근의 캐시와 메모리 비용 등을 포함한다. 연결 리스트처럼 인덱스마다 앞에서 순회한다는 증거가 아니다. indexOf와 리스트 탐색은 훨씬 큰 값이었다. 타이밍만으로 Big-O를 증명하지 않는다.

splice는 100k에서 72.3 us/쌍, 1m에서 69.5 us/쌍이었다. 이 비단조 결과는 JIT 상태와 실행 경로 등 영향을 포함할 수 있다. 이 한 실행을 크기에 따른 속도 법칙이나 저장 구조 교체의 근거로 쓰면 안 된다. 배열은 크기 순서로 실행했다. 독립 프로세스 반복과 순서 교차 검증은 하지 않았다.

## 권고와 한계

- 연결 리스트라는 가정을 이유로 배열을 교체하지 않는다.
- 실제 편집 시 `integrate`, `indexOf`의 캐시 적중/이동 범위/reindex, splice 위치와 개수, 모델 생성 비용을 구분해 측정한다.
- 중간 대량 입력은 문자마다 splice를 반복하는지 확인한다. 저장 구조 변경 전에는 연속 구간 삽입이나 블록 저장 후보를 별도 실험으로 검증한다. CRDT의 ID·origin·순서·묘비·선택·undo 호환성을 함께 검사해야 한다.
- 이 결과는 합성 object 배열의 마이크로 벤치마크다. 실제 Item의 Map/Set/문자열 메모리, GC, DOM, 네트워크, 전체 100k 편집기 응답을 측정하지 않았다.
- 브라우저 내부 packed/dictionary 검사는 하지 않았다. 실제 Doc의 내부 종류는 Node에서만 확인했다.

재실행 파일: `browser-bench.js`, `node-kind.mjs`. 원자료: `chrome-raw.json`, `node-kind.json`. Node 검사는 `node --allow-natives-syntax output/array-storage-investigation/node-kind.mjs`로 실행한다. Node 24 PATH를 사용한다.
