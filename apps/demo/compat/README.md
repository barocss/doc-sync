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

원격 수신은 문서를 교체한다. Slate는 유효한 선택 위치만 복원한다. Lexical은 원격 갱신이 다른 창의 입력 초점을 가져가지 않도록 `SKIP_DOM_SELECTION_TAG`를 사용한다. 커서의 토큰 기반 추적, OS 한글 IME 조합, 붙여넣기, 링크·목록·이미지, 칸 합치기·나누기, 성능은 이 시험의 통과 범위에 포함하지 않는다.

API 기준: [Slate 설치와 Editable](https://docs.slatejs.org/walkthroughs/01-installing-slate), [Slate Editor](https://docs.slatejs.org/concepts/07-editor), [Lexical 업데이트 수신](https://lexicaljs.org/docs/concepts/listeners), [Lexical rich-text](https://lexicaljs.org/docs/api/modules/lexical_rich-text).

수정 전 결과는 `output/playwright/editor-compatibility/`에 있다. 수정 후 다섯 참여자의 결과와 화면 캡처는 `output/playwright/editor-compatibility/reconnect-fixed/`에 저장한다.
