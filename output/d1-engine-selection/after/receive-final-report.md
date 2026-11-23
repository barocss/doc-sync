# D1 receive-final 검증 자료

최종추가검사 상태: 원래12개flag 모두 exact commonbackend client-isolation16/32/64pair에서 기존guard 이내였습니다. Node remote8 pooled128 median/p95도 기존guard 이내입니다. 원래배포E2E12/27초과와 개별32block p95초과2/4는 그대로유지합니다. 아래초기 부분검사 상태는 마지막추가검사 절로 갱신됩니다. 전제품global E2E PASS를 주장하지 않습니다.

Counts 및 기능 검사 PASS. 전체 성능 유지 판정은 보류합니다. Chrome의 선언 임계값 초과가 남았습니다.

- 기존 counts20개와 실제 PM local split/join8개: 기준과 counts/model/generated/history 해시가 같습니다.
- 선택 엔진 Chrome 기능9/9, Native Enter/Backspace는 별도 C receipt9/9 PASS.
- Node: 같은 프로세스에서 같은 scenario/size의 실행 순서를 A,B,B,A로 교차했습니다. 버전당2warmup+8sample입니다. 기존 독립 실행의 A/B/B/A 라벨은 같은 버전의 self-control이며 cross-version paired ABBA가 아닙니다.
- CPU는 process.cpuUsage의 user+system 합입니다. 프로세스 전체 스레드를 포함하므로 엔진 원인 판정이나 별도 합격 기준에 사용하지 않습니다.
- Chrome: Chrome156, localhost SSE, rich schema+100k UTF16, source별2warmup+8sample. DOM+secondrAF는 렌더링 기회이며 물리적 표시가 아닙니다.8sample의 p95는 samplemax입니다.
- 선언한 임계값은 변경하지 않았습니다.32sample 보충 자료는 기존 점수를 대체하지 않습니다.

## Node 원래8sample 결과

A=불변 기준, B=선택된TypeScript 엔진. 모든 시간은 ms입니다.

|Size|Scenario|A p50|B p50|A p95|B p95|Repeat A p50|Repeat B p50|
|---:|---|---:|---:|---:|---:|---:|---:|
|10000|insert|0.523|0.587|5.108|0.875|0.417|0.450|
|10000|delete|0.309|0.331|0.453|0.402|0.339|0.346|
|10000|mark|0.376|0.402|0.699|3.023|0.415|0.486|
|10000|selection|0.037|0.043|0.078|0.113|0.028|0.032|
|10000|presence|0.114|0.150|0.187|0.959|0.120|0.111|
|10000|remote1|0.721|0.827|1.238|1.589|0.728|0.725|
|10000|remote2|0.989|1.068|1.210|1.401|0.905|1.014|
|10000|remote8|2.170|2.595|3.997|4.360|2.005|2.138|
|10000|composition|12.216|12.499|14.843|14.934|12.353|12.185|
|10000|structure|1.941|1.925|2.207|3.071|1.581|1.654|
|100000|insert|2.078|2.226|5.755|3.075|2.058|2.026|
|100000|delete|1.808|1.866|3.490|3.777|1.817|1.861|
|100000|mark|2.038|1.917|2.372|2.429|1.790|1.792|
|100000|selection|0.184|0.187|0.219|0.255|0.169|0.175|
|100000|presence|0.689|0.674|1.671|2.119|0.657|0.636|
|100000|remote1|2.758|2.424|6.708|2.916|2.510|2.488|
|100000|remote2|2.858|2.798|7.115|3.654|3.205|2.954|
|100000|remote8|5.781|5.166|9.026|6.144|5.969|5.289|
|100000|composition|134.394|137.881|145.018|158.461|133.269|130.992|
|100000|structure|20.157|14.993|29.942|18.283|18.323|16.820|

두 원래8sample 실행에서 같은 median 초과 항목은 재현되지 않았습니다. 처음10k remote8 median은2.170→2.595ms였고 반복은2.005→2.138ms였습니다.

## 보충32sample 진단

10k mark: wall p50 0.335→0.346ms, p95 0.512→0.462ms; CPU p50 0.462→0.430ms.

10k remote8: wall p50 2.267→2.353ms, p95 3.751→5.595ms; CPU p50 2.562→2.527ms.

remote8의32sample median 증가0.0855ms는 원래median 임계값0.2267ms 이내입니다. p95 증가는 남습니다. Mark 보충검사는 median/p95 증가를 재현하지 않았습니다. 원인을 GC/JIT로 단정하지 않습니다.

## Chrome 27개 source-target 결과

아래 A는 같은날 수행한 불변번들 baseline control, B는 engine=typescript 명시선택+추적Proxy입니다. Default는 같은후보의 암묵적기본factory이며 추적Proxy가 없습니다. 진단용이며 명시선택 점수를 대체하지 않습니다.

|Profile|Source|Target|A rAF p50|B rAF p50|A rAF p95|B rAF p95|Default rAF p50|Default rAF p95|
|---|---|---|---:|---:|---:|---:|---:|---:|
|word|Slate|Slate|18.100|18.900|42.900|37.700|29.100|46.400|
|word|Slate|Lexical|49.300|50.500|72.000|67.500|49.400|66.300|
|word|Slate|ProseMirror|49.400|50.400|72.200|67.400|49.400|66.500|
|word|Lexical|Slate|71.400|71.200|80.300|93.100|65.100|72.300|
|word|Lexical|Lexical|23.400|23.800|48.100|57.400|22.100|22.700|
|word|Lexical|ProseMirror|62.300|66.200|67.100|93.000|59.800|64.300|
|word|ProseMirror|Slate|56.900|65.200|80.200|85.300|62.600|69.500|
|word|ProseMirror|Lexical|55.500|56.700|77.400|85.200|56.300|69.500|
|word|ProseMirror|ProseMirror|6.700|13.800|48.800|47.000|8.400|48.900|
|notion|Slate|Slate|16.600|16.700|29.900|27.500|16.200|39.100|
|notion|Slate|Lexical|49.100|46.600|63.300|96.100|51.400|62.700|
|notion|Slate|ProseMirror|49.200|46.600|63.300|96.000|51.500|62.800|
|notion|Lexical|Slate|69.800|65.500|102.200|79.400|60.100|78.600|
|notion|Lexical|Lexical|21.600|21.800|32.200|41.900|22.800|56.500|
|notion|Lexical|ProseMirror|65.600|54.300|102.100|75.200|51.600|66.400|
|notion|ProseMirror|Slate|65.600|61.700|76.000|70.400|53.100|75.400|
|notion|ProseMirror|Lexical|53.000|52.700|76.000|61.600|52.200|65.700|
|notion|ProseMirror|ProseMirror|8.600|11.400|19.400|52.200|15.600|40.200|
|presentation|Slate|Slate|18.000|16.300|49.300|28.400|17.700|25.800|
|presentation|Slate|Lexical|49.600|47.300|62.900|58.200|59.700|123.400|
|presentation|Slate|ProseMirror|49.600|47.300|63.000|58.300|59.700|123.500|
|presentation|Lexical|Slate|71.800|67.900|77.800|84.100|70.500|95.500|
|presentation|Lexical|Lexical|24.200|22.100|48.800|52.700|27.000|49.100|
|presentation|Lexical|ProseMirror|61.800|61.900|75.900|84.000|57.200|95.400|
|presentation|ProseMirror|Slate|61.600|61.400|69.900|67.700|52.800|78.800|
|presentation|ProseMirror|Lexical|54.200|52.900|59.000|60.200|47.500|78.800|
|presentation|ProseMirror|ProseMirror|11.500|14.800|50.800|41.300|11.500|16.900|

명시선택과fresh control 비교12/27cells가 원래임계값을 넘었습니다. Default/noProxy 진단도12/27cells가 넘었으며 초과방향이 달랐습니다. Proxy 하나로 전체차이를 설명할 수 없습니다. 현재자료로 Chrome 성능유지를 주장할 수 없습니다. DOM/receive/commit의 원래값과 모든초과값은 receive-final-chrome-comparison-control.json 및 default-diagnostic-comparison.json에 보존했습니다.

## 보존 및 범위

이전 실패·초기 infraFAIL·수정전 regression·잘못된 ownack receive 진단게이트 실패를 삭제하지 않았습니다. ownack는 receive를 요구하지 않도록 ignored harness 진단만 고쳤으며 non-source receive와 source apply/record gate는 유지했습니다. 런타임소스와배포dist를 이작업에서 수정하지 않았습니다. 모든 소유 브라우저는 종료했습니다. 서버5418/5419는 보존했습니다. 원래baseline번들은 재빌드하지 않았습니다.

## 추가 원인 구간 및 client-isolation 진단

원래 배포 경로의12/27 초과 점수는 유지합니다. 아래 자료는 원래 점수를 대체하지 않습니다.

동일Chrome프로세스 두탭에서 A/B 순서를 교차하고 탭활성화 후 기존2rAF를 기다렸습니다. 버전당2warmup+16pairs를 측정했습니다. 각 입력의 commit, receive callback, DOM, secondrAF 타임스탬프를 분리했습니다.

|기존 별도서버16pairs|Target|A DOM p50|B DOM p50|A rAF p50|B rAF p50|A commit p50|B commit p50|
|---|---|---:|---:|---:|---:|---:|---:|
|notion ProseMirror|ProseMirror|4.100|4.200|11.100|13.400|0.300|0.300|
|word Slate|Lexical|41.600|48.100|51.600|57.100|0.300|0.300|
|word Lexical|Slate|65.200|56.300|68.400|63.400|9.700|9.700|

NotionPM의 추가 평균2.263ms 중2.194ms는 DOM 이후 구간에 있었습니다. WordSlate→Lexical의 추가 DOM 평균17.363ms는 receive 시작 전18.356ms 증가와 함께 나타났으며 callback 평균은1.063ms 감소했습니다. 이 값은 관측구간을 가리킵니다. 네트워크·OS·GC 원인을 단정하지 않습니다.

그다음 새 baseline backend 하나와 대칭 proxy origin2개를 만들었습니다. 두 버전은 같은 API/backend프로세스 집합·같은 파일시스템·동일한 추가HTTP hop을 사용했습니다. 기존서버는 보존했습니다. Baseline/candidate불변번들, 동일indexHTML, 동일Chrome두탭, 동일native입력 프로토콜을 유지했습니다.

|공통 새 backend16pairs|Target|A DOM p50|B DOM p50|A rAF p50|B rAF p50|A rAF p95|B rAF p95|
|---|---|---:|---:|---:|---:|---:|---:|
|notion ProseMirror|ProseMirror|4.200|4.400|9.200|8.800|16.900|33.900|
|word Slate|Lexical|49.300|43.300|53.100|54.900|89.300|68.600|
|word Lexical|Slate|52.900|51.700|58.800|62.200|80.700|74.500|

공통backend에서 WordSlate→Lexical DOM 중앙값 증가는 재현되지 않았습니다. NotionPM rAF 중앙값 증가도 재현되지 않았지만16sample p95는 여전히 samplemax이므로 추가64pairs를 실행했습니다.

NotionPM 공통backend64pairs: rAF median 10.000→10.100ms, p95(rank61/64) 17.900→18.800ms. 차이0.100/0.900ms는 원래median2ms/p954ms 임계값 이내입니다. DOM median 4.100→4.100ms, commit median 0.300→0.300ms, commit p95 0.500→0.500ms입니다.

64pairs에만 양쪽에 동일한 bounded512-entry PerformanceObserver를 설치했습니다. 지원되는 LongTask/LongAnimationFrame만 수집했고 연속rAF loop를 추가하지 않았습니다. 기존활성화2rAF의 cadence 중앙값은16.618/16.610ms였습니다. 측정128구간과 겹치는 항목은 기록되지 않았습니다. 이는50ms미만 작업이나 스케줄링 원인을 배제하지 않습니다. Observer의 진단오버헤드는 이 보충실행에만 적용됩니다.

검사 범위의 결론: 기존counts/기능검사는 PASS입니다. 이전Node hotspot은 같은프로세스32pair 진단에서 median임계값 이내였습니다. 추가Chrome client-isolation 진단에서는 주요반복대상인 WordSlate→Lexical DOM과 NotionPM localrAF의 성능저하가 공통backend/64pair 조건에서 지속되지 않았습니다. 이 결론은 모든 원래27cells의 E2E성능 PASS를 뜻하지 않습니다. 기존 원래12개초과, 모든8/16/32/64raw결과를 보존합니다.

새 진단 backend/proxy/브라우저는 전부 종료했습니다. 기존 소유 서버5418/5419와 사용자 서비스는 변경하지 않았습니다.

## 원래12개 flag의 추적 상태

원래 배포 E2E 점수는 전부 유지합니다. 아래 해소는 동일backend의 명시된client-isolation 조건에만 적용됩니다.

|Profile|Source|Target|원래초과metric|직접통제진단|
|---|---|---|---|---|
|word|Slate|Lexical|inputDomP50|선택한 공통backend16/64pair에서 지속되지 않음|
|word|Lexical|Slate|inputDomP95, inputRaf2P95|선택한 공통backend16/64pair에서 지속되지 않음|
|word|Lexical|Lexical|inputRaf2P95|선택한 공통backend16/64pair에서 지속되지 않음|
|word|Lexical|ProseMirror|inputDomP95, inputRaf2P95|선택한 공통backend16/64pair에서 지속되지 않음|
|word|ProseMirror|Slate|inputRaf2P50|같은 profile/source의 직접통제 재검사 없음; 원래flag유지|
|word|ProseMirror|ProseMirror|inputRaf2P50|같은 profile/source의 직접통제 재검사 없음; 원래flag유지|
|notion|Slate|Lexical|inputDomP95, inputRaf2P95|같은 profile/source의 직접통제 재검사 없음; 원래flag유지|
|notion|Slate|ProseMirror|inputDomP95, inputRaf2P95|같은 profile/source의 직접통제 재검사 없음; 원래flag유지|
|notion|Lexical|Lexical|inputRaf2P95, localCommitP95|같은 profile/source의 직접통제 재검사 없음; 원래flag유지|
|notion|Lexical|ProseMirror|receiveP95|같은 profile/source의 직접통제 재검사 없음; 원래flag유지|
|notion|ProseMirror|ProseMirror|inputRaf2P50, inputRaf2P95|선택한 공통backend16/64pair에서 지속되지 않음|
|presentation|ProseMirror|ProseMirror|inputRaf2P50|같은 profile/source의 직접통제 재검사 없음; 원래flag유지|

이 표는 모든27개항목 PASS를 선언하지 않습니다. 다른7개초과cell을 직접통제 재검사했다고 주장하지 않습니다. 상세 원래값·통제값·임계값·sample수는 receive-final-original-flag-resolution.json에 있습니다.

최종 정리: root 지시에 따라 소유 서버5418/5419의 PID·cwd·command와 자식목록을 기록한 뒤 부모에게만 SIGTERM을 보냈습니다. 부모와 자식이 모두 종료됐음을 확인했습니다(PASS). 임시문서 데이터와 모든증거는 보존했습니다. 이전 절의 서버보존 상태는 이 최종정리 전 시점의 기록입니다.

## 최종 추가검사: 모든 원래 flag의 직접 통제 범위

이 절은 앞선5/12개 부분검사 상태를 갱신합니다. 원래12/27 배포E2E 초과 점수는 그대로 보존합니다. 남은7개를 정확한profile/source로 묶어4그룹×32pairs로 직접검사했습니다. 그중NotionSlate DOM p95가 남아 같은공통backend조건64pairs로 추가검사했습니다. 기존임계값을 변경하지 않았습니다.

|Profile|Source|Target|원래flag metric|Exact control samples|A|B|허용증가(ms)|통제범위 상태|
|---|---|---|---|---:|---:|---:|---:|---|
|word|Slate|Lexical|inputDomP50|16|49.300|43.300|4.930|NOT_PERSISTENT_IN_EXACT_CLIENT_ISOLATION|
|word|Lexical|Slate|inputDomP95|16|67.900|65.600|10.185|NOT_PERSISTENT_IN_EXACT_CLIENT_ISOLATION|
|word|Lexical|Slate|inputRaf2P95|16|80.700|74.500|12.105|NOT_PERSISTENT_IN_EXACT_CLIENT_ISOLATION|
|word|Lexical|Lexical|inputRaf2P95|16|42.100|27.000|6.315|NOT_PERSISTENT_IN_EXACT_CLIENT_ISOLATION|
|word|Lexical|ProseMirror|inputDomP95|16|53.700|59.300|8.055|NOT_PERSISTENT_IN_EXACT_CLIENT_ISOLATION|
|word|Lexical|ProseMirror|inputRaf2P95|16|80.600|66.600|12.090|NOT_PERSISTENT_IN_EXACT_CLIENT_ISOLATION|
|word|ProseMirror|Slate|inputRaf2P50|32|51.800|56.500|5.180|NOT_PERSISTENT_IN_EXACT_CLIENT_ISOLATION|
|word|ProseMirror|ProseMirror|inputRaf2P50|32|10.600|8.100|2.000|NOT_PERSISTENT_IN_EXACT_CLIENT_ISOLATION|
|notion|Slate|Lexical|inputDomP95|64|60.900|61.800|9.135|NOT_PERSISTENT_IN_EXACT_CLIENT_ISOLATION|
|notion|Slate|Lexical|inputRaf2P95|64|75.900|69.900|11.385|NOT_PERSISTENT_IN_EXACT_CLIENT_ISOLATION|
|notion|Slate|ProseMirror|inputDomP95|64|65.500|66.100|9.825|NOT_PERSISTENT_IN_EXACT_CLIENT_ISOLATION|
|notion|Slate|ProseMirror|inputRaf2P95|64|75.900|70.000|11.385|NOT_PERSISTENT_IN_EXACT_CLIENT_ISOLATION|
|notion|Lexical|Lexical|inputRaf2P95|32|36.300|35.000|5.445|NOT_PERSISTENT_IN_EXACT_CLIENT_ISOLATION|
|notion|Lexical|Lexical|localCommitP95|32|9.000|9.000|4.000|NOT_PERSISTENT_IN_EXACT_CLIENT_ISOLATION|
|notion|Lexical|ProseMirror|receiveP95|32|5.200|4.200|4.000|NOT_PERSISTENT_IN_EXACT_CLIENT_ISOLATION|
|notion|ProseMirror|ProseMirror|inputRaf2P50|64|10.000|10.100|2.000|NOT_PERSISTENT_IN_EXACT_CLIENT_ISOLATION|
|notion|ProseMirror|ProseMirror|inputRaf2P95|64|17.900|18.800|4.000|NOT_PERSISTENT_IN_EXACT_CLIENT_ISOLATION|
|presentation|ProseMirror|ProseMirror|inputRaf2P50|32|9.500|7.700|2.000|NOT_PERSISTENT_IN_EXACT_CLIENT_ISOLATION|

이제12개 원래초과cell의 모든metric에 같은profile/source/target 직접통제 자료가 있습니다. 모든해당metric이 선택한공통backend조건에서 기존guard 이내였습니다. 이것은 D1client 마이그레이션의 통제검사 결과입니다. 원래별도server E2E 전체27개 항목 PASS나 물리적 화면지연 PASS로 바꾸지 않습니다. 모든32/64raw와 초과했던32sample NotionSlate 결과도 유지합니다.

## Node remote8 p95 추가128관측

4개의 독립32sample block마다 원래10k fixture와 모든이전scenario prelude를 초기화했습니다. 버전당2warmup, 같은프로세스A/B 교차, 같은8ops를 유지했습니다. GC PerformanceObserver는 bounded2048entries이고 block사이에만 callback을 flush했습니다. 측정action 사이에 yield를 추가하지 않았습니다.

통합128관측: median 2.164→2.263ms (증가0.100,기존guard0.216), p95(rank122/128) 3.681→3.663ms (증가-0.018,guard0.552)로 pooledguard 이내입니다.

|독립block|A median|B median|A p95|B p95|p95 trigger|
|---:|---:|---:|---:|---:|---|
|0|2.126|2.225|3.728|2.530|false|
|1|2.233|2.352|3.833|3.667|false|
|2|2.138|2.214|2.497|3.619|true|
|3|2.076|2.223|3.143|4.151|true|

4block의 median은 모두guard 이내입니다. 개별32block p95는2/4에서 초과했고 이를 삭제하거나 PASS로 바꾸지 않았습니다. 원래8/32sample 점수도 유지했습니다. 통합128 p95에서는 지속적인증가가 재현되지 않았습니다. GCoverlap은A10/128,B13/128이고 상위7tail과 겹친건수는A7/7,B6/7입니다. 이는 시간상겹침이라는 진단자료이며 엔진할당이나GC가 원인이라는 단정이 아닙니다. CPU는 보조자료이며 별도합격기준을 만들지 않았습니다.

마지막신규32/64 Chrome backend·대칭proxy·소유브라우저는 모두정상종료했습니다. 기존5418/5419도 이전정리에서 종료됐고 사용자서비스/탭/임시문서데이터는 건드리지 않았습니다. 모든후보runtime source와publicdist는 이 검사에서 변경하지 않았습니다.
