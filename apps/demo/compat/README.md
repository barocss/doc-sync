# Chrome 편집기 연결 시험

이 폴더는 Slate·Lexical·ProseMirror를 doc-sync에 연결하는 시험 코드다. 같은 문서에 Slate 2개, Lexical 2개, ProseMirror 1개를 연다. 정식 라이브러리 export는 추가하지 않는다. 루트 의존성과 잠금 파일을 바꾸지 않는다.

Node 22.18 이상과 설치된 Google Chrome을 사용한다.

```sh
npm install --prefix apps/demo/compat --workspaces=false --package-lock=false --cache /tmp/doc-sync-compat-npm-cache
npm run build --prefix apps/demo/compat
npm test --prefix apps/demo/compat
npm start --prefix apps/demo/compat
```

서버는 기본으로 `http://127.0.0.1:5412`에 열린다. `COMPAT_PORT`로 포트를 바꿀 수 있다. 데모 백엔드는 별도 프로세스와 새 임시 데이터 폴더로 실행한다. 원본 `data/`를 사용하지 않는다. 서버 종료 시 백엔드도 종료한다. 임시 데이터는 삭제하지 않는다.

Playwright CLI 스킬의 래퍼로 Chrome 세션을 연다. 아래 경로는 저장소 루트를 기준으로 한다.

```sh
bash /Users/user/.codex/skills/playwright/scripts/playwright_cli.sh --session doc-sync-editors-chrome open 'http://127.0.0.1:5412/?doc=chrome-editors-final' --browser chrome
bash /Users/user/.codex/skills/playwright/scripts/playwright_cli.sh --session doc-sync-editors-chrome run-code --filename apps/demo/compat/checks-text.js
bash /Users/user/.codex/skills/playwright/scripts/playwright_cli.sh --session doc-sync-editors-chrome run-code --filename apps/demo/compat/checks-table.js
bash /Users/user/.codex/skills/playwright/scripts/playwright_cli.sh --session doc-sync-editors-chrome run-code --filename apps/demo/compat/checks-concurrent.js
bash /Users/user/.codex/skills/playwright/scripts/playwright_cli.sh --session doc-sync-editors-chrome run-code --filename apps/demo/compat/checks-three.js
```

`checks-concurrent.js`는 빈 문서 재연결 회귀를 포함한다. 코어는 이미 있는 문자 토큰을 캐시에 다시 넣지 않는다. 서버는 스냅숏과 함께 선택 항목인 `clientSeqs` 수신 번호를 보내고, 클라이언트는 확인된 pending 변경만 제거한다. 아직 확인되지 않은 변경은 스냅숏 위에 다시 적용한다. 이전 hello 형식도 읽을 수 있다.

CLI 종료 코드가 0이어도 출력의 Error/Timeout과 브라우저 오류를 확인해야 한다. 각 시험은 편집기의 native 모델, CRDT 모델, 서버 모델이 모두 같은지 검사한다.

ProseMirror는 `/pm?doc=chrome-pm-final`로 이동한 뒤 `checks-pm.js`를 실행한다. 시험이 끝나면 CLI의 `close` 명령으로 브라우저를 닫는다.

별도 최소 재현:

```sh
node apps/demo/compat/reproduce-empty-reconnect.mjs
```

이 명령은 기존 실패 조건에서 오류가 없고, 서버·클라이언트 문서가 같고, pending이 0인지 확인한다. 통과하면 `regression-passed`를 출력한다. 수정 전 증거는 `output/playwright/editor-compatibility/core-defect-reproduction.json`에 보존했다. 코어 회귀 시험은 `packages/doc-sync/test/reconnect.test.ts`에 있다.

지원 범위는 문단, 기본 서식, 단순 표다. Slate 표는 이 시험에서 정의한 노드와 Transforms를 사용한다. Lexical 표는 `@lexical/table`을 사용한다. 보내는 쪽은 모델 비교를 기본으로 하고 Enter·문단 합치기의 뜻을 보존한다. 모델의 Unicode 위치는 CRDT의 UTF-16 토큰 위치로 변환한다.

Slate·Lexical은 원격 수신 때 문서를 다시 구성한다. 바꾸기 전에 선택의 양 끝을 CRDT 토큰 ID로 저장하고, 바꾼 문서에서 경로와 UTF-16 위치를 다시 찾는다. Slate는 서식 leaf를 가로지르는 offset을 변환한다. Lexical은 새 node key에 선택을 연결한다. 초점이 있는 편집기만 DOM 선택을 갱신하고, 나머지는 `SKIP_DOM_SELECTION_TAG`로 초점 이동을 막는다. ProseMirror도 표 구조 변경에서 커서가 다른 칸으로 옮겨 가지 않도록 토큰 기준 복원을 사용한다.

`input-session.mjs`는 세 편집기의 IME 조합을 보존한다. 조합 시작 시 CRDT 문서를 복제하고 그 문서에서 로컬 입력 연산을 만든다. 실제 SyncClient는 계속 원격 변경을 받는다. 조합 중인 편집기의 화면 반영은 조합이 끝날 때까지 미룬다. 끝나면 원래 토큰 ID와 origin을 가진 로컬 연산을 한 묶음으로 실제 문서에 적용·전송하고, 원격 변경과 함께 화면에 반영한다. 따라서 오래된 화면을 실제 문서와 비교해 원격 글을 삭제하지 않는다. 조합 전체를 한 번에 되돌릴 수 있다. 초안이 쓴 연산 번호를 실제 클라이언트 시계에도 예약하며 재연결 스냅숏 뒤에도 예약을 유지한다. 내용이 같은 스냅숏은 모델 이벤트가 생략되므로 `onUpdate`에서도 예약한다. reset은 모델 변경 여부와 관계없이 초안을 버리고 화면을 비운다. ProseMirror는 이 데모에서 InputSession의 client 인터페이스를 통해 연결한다. 기본 PmBinding과 `/pm`의 IME 처리는 변경하지 않는다.

OS 한글 키보드, 붙여넣기, 링크·목록·이미지, 칸 합치기·나누기, 성능은 이번 입력 시험의 통과 범위에 포함하지 않는다.

API 기준: [Slate 설치와 Editable](https://docs.slatejs.org/walkthroughs/01-installing-slate), [Slate Editor](https://docs.slatejs.org/concepts/07-editor), [Lexical 업데이트 수신](https://lexicaljs.org/docs/concepts/listeners), [Lexical rich-text](https://lexicaljs.org/docs/api/modules/lexical_rich-text).

수정 전 결과는 `output/playwright/editor-compatibility/`에 있다. 수정 후 다섯 참여자의 결과와 화면 캡처는 `output/playwright/editor-compatibility/reconnect-fixed/`에 저장한다.

## 관찰 도구와 추가 시험

기본 화면은 연산 기록을 끈다. `/?doc=이름&trace=1`로 열면 `window.compat.trace()`에서 최근 150개 연산을 읽을 수 있다. `window.compat.clearTrace()`로 기록을 비운다. 기록에는 편집기 원본 구조·연산, 공통 모델 편집, UTF-16 위치로 바꾼 편집, 전송 연산과 원격 반영 결과가 있다. 기록 모드는 문서 복사 비용을 더하므로 일반 편집 성능 측정과 구분한다.

`window.imeProbe.read()`는 실제 입력 이벤트, 조합 상태와 DOM 선택 위치를 읽는다. 입력이나 선택을 바꾸지 않는다. 시험 서버의 `POST /test/remote`에 `{doc, edits}`를 보내면 별도 CRDT 참여자가 HTTP로 변경을 제출한다. `edits`의 글자 위치는 CRDT의 UTF-16 단위다. 입력 초점을 옮기지 않고 원격 변경을 만들기 위한 로컬 시험 도구다. 문서 이름·편집 배열, HTTP 응답과 SSE hello를 검사하며 요청 제한 시간은 10초다.

Chrome을 시험 서버 주소로 연 뒤 다음 스크립트를 실행한다. 새 스크립트는 현재 페이지의 origin을 사용하므로 별도 포트에서도 실행할 수 있다.

```sh
# 기본 기록 끔/trace=1, 세 편집기 입력, 원격 제출, trusted input 관찰
bash /Users/user/.codex/skills/playwright/scripts/playwright_cli.sh --session doc-sync-editors-chrome run-code --filename apps/demo/compat/checks-probes.js
# 편집기별 10개 연산의 구조 기록
bash /Users/user/.codex/skills/playwright/scripts/playwright_cli.sh --session doc-sync-editors-chrome run-code --filename apps/demo/compat/checks-operation-traces.js
# 커서와 CDP 조합 입력 진단. 결과의 status를 직접 확인한다
bash /Users/user/.codex/skills/playwright/scripts/playwright_cli.sh --session doc-sync-editors-chrome run-code --filename apps/demo/compat/checks-ime-cursor.js
# 조합 취소·되돌리기·반복 조합·원격 삭제·빈 문서·재연결
bash /Users/user/.codex/skills/playwright/scripts/playwright_cli.sh --session doc-sync-editors-chrome run-code --filename apps/demo/compat/checks-input-extended.js
# 표 안에서 원격 행·열 추가와 IME 조합 중 열 추가
bash /Users/user/.codex/skills/playwright/scripts/playwright_cli.sh --session doc-sync-editors-chrome run-code --filename apps/demo/compat/checks-table-input.js
# 비어 있는 실제 문서에서 조합 중 reset, 초안 재등장 방지와 후속 입력
bash /Users/user/.codex/skills/playwright/scripts/playwright_cli.sh --session doc-sync-editors-chrome run-code --filename apps/demo/compat/checks-input-reset.js
```

**2026-10-22 검토 결과**: 루트 기본 시험 113개, compat 시험 14개, 전체 타입 검사와 compat 빌드가 통과했다. 격리된 Chrome에서 일반 편집 회귀 20개 항목을 통과했고 연산 30개를 수집했다. 기록을 껐을 때 추가 연산 기록이 없고, 켰을 때 로컬·원격 기록과 Unicode 편집이 유지되는 것을 확인했다. 관련 결과는 로컬 `output/validation/compat-review-20261022/validation.json`에 있다.

**수정 전 입력 결과**: 커서·IME 진단 36개 중 14개 통과, 22개 실패였다. 이 수치는 위 일반 편집 회귀 통과와 별개다. Slate 커서 1/8, Lexical 0/8, PM 8/8이었다. 원격 변경이 없는 CDP 조합 입력은 각 편집기 1/1이었다. 원격 변경 중 CDP 조합 입력은 Slate 0/3, Lexical 0/3, PM 2/3이었다. 원본 보고서는 `output/playwright/editor-compatibility/ime-cursor/`에 보존했다.

수정 전 실패 22개는 다음과 같다. Slate의 숫자 offset 고정 5개, 문단 split 경로 고정 1개, 서식 leaf 분할 후 offset 제한 1개, Lexical의 선택 node key 소실 8개, Slate 조합 DOM 교체 3개, Lexical 조합 DOM 교체와 중복 입력 3개, PM 조합 위치와 같은 경계의 원격 삽입 1개다. 추가 표 시험에서는 PM의 행·열 삽입 후 선택 위치 오류 2개도 발견했다. 수정 후 결과와 실제 원본 JSON은 `output/playwright/editor-compatibility/input-fixed/`에 기록한다. `wireOps`는 전송 연산이고, 조합 중의 임시 연산은 `stagedOps` 또는 `composition-commit` 기록에서 구분한다.

IME 시험은 Chrome CDP의 `Input.imeSetComposition`과 `Input.insertText`를 사용한다. 조합 시작·유지·종료, 최종 글, 커서 위치와 후속 입력을 확인한다. 실제 OS 키보드의 한글 입력기를 통과했다고 해석하지 않는다. 진단 스크립트의 종료 코드만으로 전 항목 통과를 판정하지 않고 결과의 각 `status`를 검사한다.

**입력 수정 후 결과**: 기존 진단 36/36, 추가 입력 33/33, 표 커서·IME 12/12, 빈 문서 조합 중 reset 3/3, 합계 입력 시험 84/84가 통과했다. Slate·Lexical·PM 모두 커서 8/8, 원격 편집 중 CDP 조합 3/3, 대조 조합 1/1이다. 조합 취소·반복 입력·빈 문서·Unicode·원격 삭제·서식·split·재연결·한 번의 undo/redo를 추가로 확인했다. 일반 Chrome 회귀 20개와 연산 기록 30개도 확인했다. 커밋된 코어의 독립 복사본에서 확장 루트 시험 113개(`FUZZ_SEEDS=3000 PM_SEEDS=300`), compat 시험 31개, 타입 검사와 빌드가 통과했다. 초안과 live undo의 연산 번호 중복, 재연결 후 예약 유지는 단위 시험에도 포함한다. 최종 통합 증거는 로컬 `output/validation/ime-cursor-fix-20261022/validation.json`에 있다. 별도 성능 수정은 포함하지 않는다. 결과는 이 데모 연결 코드와 설치된 Chrome에 한정한다.
