# PLAN.md

남은 작업 계획과 인수인계 메모. 규칙은 `AGENTS.md`, `CLAUDE.md`가 우선한다. 이 문서는 진행 상황에 맞춰 갱신한다.

## 작업 방식 (세션이 바뀌어도 유지)

- 새 기능은 plan mode로 시작하고, 계획 승인 전에는 파일을 수정하지 않는다.
- 코드를 쓰기 전에 작업 폴더와 파일 목록을 먼저 밝힌다.
- 한 단계(커밋 단위)를 구현하면 멈추고, 리뷰 가이드(읽는 순서, `file:line`, 다룬/다루지 않은 엣지 케이스, 평가 체크리스트 충족 여부)와 함께 **accept/reject**를 묻는다. accept 전에는 커밋하지 않고 다음 단계로 넘어가지 않는다. 계획 승인은 단계별 커밋 승인을 대신하지 않는다.
- 커밋 전에 `git diff --cached --name-status`로 스테이징 목록을 확인한다. 직접 작성하지 않은 파일(도구가 자동 생성한 파일 등)이 섞이면 먼저 알린다.
- `git push`는 사람이 한다. 원격: `origin` = `https://github.com/heo-gun/witness.git`
- 새 의존성은 이유와 대안을 먼저 제시하고, 2주 이상 지난 안정 버전으로 고정한다.
- 세션 B 후반은 사용자 요청으로 검토 범위를 확대했다: 인증 API → 인증 UI → 기관 API → 대시보드의 4단위. 각 단위의 Accept 후에만 커밋한다.

## 현재 상태 (사용자 요청으로 오늘 작업 종료, 세션 C 5단계·리뷰 수정 2·3 완료, 2026-11-16)

서비스명은 **Witness**다. 사용자는 다음 작업으로 SSO를 도입해 이메일 소유 확인 문제를 해결하기로 결정했다. SSO 제공자 이름은 아직 정하지 않았으며 Witness를 제공자명으로 해석하지 않는다. 오늘은 개발을 중단하고 인수인계 기록과 승인한 변경의 커밋까지만 수행한다. 재개 요청 전에는 다음 단계를 시작하지 않는다.

| 영역 | 상태 |
|---|---|
| 모노레포 | pnpm workspace, TS 6.0 strict, ESLint 10 flat, Prettier, LF 고정 |
| 로컬 인프라 | `docker-compose.yml`: MySQL 8.4(호스트 3307), SeaweedFS 4.48(S3, 8333) |
| `packages/shared` | `API_PREFIX`, JCS 인코더·UTF-8 바이트, payload 타입, 소문자 hex 유틸. ESM, Vitest 70개 |
| `packages/merkle` | RFC 9162 root·inclusion·consistency 생성/검증, 54노드 회귀 테스트 보완 완료, Vitest 4,257개 |
| `apps/api` | NestJS 12, `/api/v1`, API 15개, 기관 수정 권한 경쟁 조건 수정 완료, e2e 126개 |
| DB | Prisma 7, 13테이블, 마이그레이션 3개, `log_state (1, 0)` 시드 |
| `apps/web` | Next.js 16 App Router, 인증·대시보드, 기관 상세·멤버 관리·설정·초대 UI, 실제 API·TanStack Query 연동 |

평가 체크리스트 충족: DB 테이블 8개 이상(13개), 인덱스(필수 8개 모두).

세션 B 추가 확인: JWT 인증·역할 권한 검사, 입력 DTO 검증, 기관·owner 멤버십의 원자적 생성, 동일 slug 동시 생성 정합성. 프론트는 로그인별 헤더, 폼 검증·로딩·오류, 새로고침 없는 상태 갱신과 반응형을 확인했다. 누적 API는 8개로 16개 기준은 아직 미충족이다. 시험 배포와 배포 환경의 CORS 검증은 사용자 요청으로 보류했다.

## 결정된 사항

- 서비스명은 **Witness**. UI 브랜드 문자열 등은 아직 `tlog`이며 Witness 표기 반영은 후속 작업이다. 내부 패키지명, JWT issuer/audience, 암호화 프로토콜의 `tlog/file/v1` 등은 브랜드 변경과 함께 일괄 치환하지 않는다.
- 이메일 소유 확인 문제는 **SSO 도입으로 해결할 계획**이다. 제공자와 연동 계약은 미정이며 SSO 구현도 아직 시작하지 않았다. 기존 이메일·비밀번호 가입/로그인은 현재 그대로 남아 있다.
- 개발 방식: mock 없이 `apps/api`와 함께 기능 단위로 만든다. 스택은 AGENTS.md를 따르고, AGENTS.md가 정하지 않은 것(Tailwind, shadcn/ui)은 MVP.md를 따른다.
- 파일 전달 필드명은 `recipientFingerprint`로 통일 (MVP.md의 `recipientKeyFingerprint` 대신)
- `documents`, `member_keys`는 `status`만 갱신한다. 서명·승인·폐기 정보는 `log_entries`(조회용 컬럼 `actor_id`, `document_id`, `key_fingerprint`)와 `revocations`에서 `include`로 조립해 MVP 타입 형태로 응답한다.
- id는 `uuid(7)` `CHAR(36)`, 시간은 `DATETIME(3)`. STH와 payload의 시간 문자열은 `toISOString()`로 만든다.
- 로컬 S3는 SeaweedFS. 접근은 `@aws-sdk/client-s3`만 사용한다.
- 비밀번호는 `argon2@0.45.1`의 Argon2id 기본 설정을 쓴다. 입력 비밀번호의 공백을 제거하지 않는다.
- JWT는 httpOnly·SameSite=Lax 쿠키(`tlog_session`, path `/api/v1`)로 전달하고 운영 환경에서는 Secure를 켠다. HS256, 발급자·대상·만료를 검증한다. 유효 기간은 1시간이며 자동 갱신은 없다. 로그아웃은 쿠키 삭제이며 복사된 토큰을 서버에서 즉시 폐기하지 않는다.
- 기관 생성 입력은 이름·slug·설명이다. 생성자가 owner가 되며, 기관 수정은 owner만 이름·설명을 변경할 수 있다. slug는 생성 후 고정하고 `externalId`는 외부 연동 전까지 API 입력에서 제외한다.
- 문자열은 `apps/web/src/lib/i18n/ko.ts`의 키로 분리했다. 언어 전환 라이브러리·UI는 아직 없다.
- 로그인 후 `/dashboard`로 이동한다. 기관 캐시는 사용자 id별로 나누고 로그인·로그아웃 때 이전 사용자의 캐시를 비운다. 기관 상세·설정 UI와 초대는 세션 C 범위다.

## 환경 메모 (함정)

- **Node 26.13** (최소 24.9). NestJS 12가 ESM 전용이라 Jest는 `node --experimental-vm-modules`로 실행한다 (`apps/api/package.json`의 `test:*`).
- **pnpm 12**: 빌드 스크립트를 가진 패키지는 `pnpm-workspace.yaml`의 `allowBuilds`에 명시해야 설치된다. 현재: `@parcel/watcher` 거부, `prisma`, `@prisma/engines`, `argon2` 허용.
- **TypeScript 7은 쓰지 않는다**: typescript-eslint(`<6.1`)와 ts-jest(`<7`)가 지원하지 않는다.
- **Prisma 7**
  - 런타임에 driver adapter가 필수다(`@prisma/adapter-mariadb`).
  - client는 `apps/api/src/generated/prisma`에 생성되고 git에서 제외된다. `build`, `dev`, `test`가 `prisma generate`를 먼저 실행한다.
  - `prisma.config.ts`가 `.env`를 `process.loadEnvFile`로 읽는다.
  - npm `latest` 태그가 8.0 RC를 가리키므로 7.10.1로 고정한다.
- **Next 16**
  - `next dev`가 AI 에이전트를 감지하면 `AGENTS.md`를 자동 생성하므로 `next.config.ts`에서 `agentRules: false`로 꺼뒀다.
  - API가 학습 데이터와 다를 수 있으니 `apps/web/node_modules/next/dist/docs/`를 참고한다.
- **`.env`**: `apps/api/.env`는 사람이 `.env.example`에서 만든다. 에이전트는 읽지 않는다. API 실행에는 무작위 `JWT_SECRET`이 최소 32바이트 필요하다. `LOG_SIGNING_KEY`는 세션 C에서 설정한다.
- **e2e**: `.env` 없이 로컬 `tlog_test`만 사용한다. `TEST_DATABASE_URL`로 접속 정보를 바꿀 수 있지만 로컬 호스트·DB 이름이 정확히 `tlog_test`인 URL만 허용한다. `pnpm -F api test:e2e`가 별도 `test/prisma.config.ts`로 client 생성·기존 마이그레이션 적용 후 `--runInBand`로 실행한다. 테스트의 JWT 비밀값은 매번 임시로 생성한다.
- **검증**: API e2e 88개와 신규 세션 설정 단위 테스트 4개 통과. 기존 비밀번호 단위 테스트는 사용자가 확인했고 이후 재실행하지 않았다. 웹 lint·타입·프로덕션 빌드 통과. 실제 Chrome에서 가입·로그인·로그아웃·기관 생성·중복 주소·계정 간 캐시 분리·요청 실패 재시도·세션 만료를 확인했다. 긴 이름·설명으로 320/390/768/1024/1440px에서 가로 넘침이 없었다.
- **기존 경고**: 웹의 ESLint 플러그인 peer 범위가 ESLint 10을 포함하지 않아 설치 시 경고가 난다. 실제 웹 lint는 통과한다.

## 남은 작업

엔드포인트 이름과 형태는 MVP.md "API 계약"(35개)을 따른다.

### 세션 B (2h): 인증과 기관 — 완료, 시험 배포 보류

결정: Argon2id, httpOnly 쿠키, e2e 전용 `tlog_test` 분리.

단계:
1. **완료·Accept**: auth 모듈 — register, login, logout, me (4), JWT Guard, `@CurrentUser`, DTO 검증. 가입은 공개 API이고 인증 실패 검증은 나머지 보호 API에서 한다.
2. **완료·Accept**: 디자인 토큰·기초 컴포넌트, 헤더, `/login`, `/register`, 한국어 문자열 키 분리.
3. **완료·Accept**: orgs 모듈 — createOrg, listOrgs, getOrg, updateOrg (4), 멤버십 기반 `@Roles` Guard.
4. **완료·Accept**: `/dashboard`의 내 기관 목록·기관 생성, 로그인 보호, 로그인 후 이동·헤더 연결.
5. **사용자 요청으로 보류**: `*.newbie.sparcs.net` 시험 배포 및 배포 환경 `/api` 프록시·CORS 확인. 로컬에서는 같은 origin의 `/api` rewrite로 인증·기관 생성까지 검증했다.

누적 endpoint 8

### 세션 C (5h): 신뢰의 뼈대 — 5단계까지 완료, 오늘 작업 종료 (2026-11-16)

검토 단위는 사용자와 합의한 8단계다. 각 단계 구현·검증 후 Accept를 받고 커밋한다.

1. **멤버·초대 API — 완료·Accept**: listMembers, changeRole, removeMember, inviteMember, listMyInvitations, accept, decline (7).
   - 기관 멤버는 목록을 조회하고 owner만 멤버 변경·초대를 수행한다. 초대 수락·거절은 해당 이메일의 사용자만 가능하다.
   - 기본 정책으로 마지막 owner의 강등·제거를 금지하고, 미가입 이메일 초대를 허용한다. 기존 멤버와 중복 pending 초대는 409다.
   - pending·active 키 또는 처리 중인 요청(awaiting_upload/pending/needs_resend)이 있는 멤버는 역할 변경·제거를 409로 거부한다. 같은 역할로의 변경은 허용한다. 이 정책을 포함해 사용자가 리뷰·승인했다.
   - 받은 초대 목록은 pending만 반환한다. 완료된 초대의 재응답은 409, 초대 수락 시 멤버십 생성과 초대 상태 변경은 원자적이다.
   - 기관 행을 FOR UPDATE로 잠그고 ReadCommitted 트랜잭션 내에서 owner 권한을 재검증한다. 같은 잠금으로 중복 초대·동시 응답·마지막 owner 변경을 직렬화한다.
   - 멤버 응답에 공개 사용자 정보, 초대 응답에 기관 요약을 함께 제공한다. 초대의 invitedBy는 MVP 필드명을 유지한다.
   - API e2e 125개(기존 88 + 신규 37), API TypeScript, 변경 파일 ESLint 통과. 이메일 길이를 초과했던 신규 테스트 주소를 수정했으며 DTO 규칙과 기대 결과는 유지했다.
   - 스키마·마이그레이션·의존성 변경 없음. 기존 비밀번호 단위 테스트는 재실행하지 않았다.
2. **기관 상세·초대 UI — 완료·Accept**: `/orgs/[slug]` 멤버 관리·기관 설정, dashboard의 받은 초대 수락·거절, 기관 상세 링크를 한 검토 단위로 구현했다.
   - 1단계 API 커밋: `ee282a4` (`feat: add member management and invitation APIs`).
   - 2단계 UI 커밋: `b90536a` (`feat: add organization member and invitation UI`).
   - 현재 사용자의 역할은 멤버 목록에서 확인한다. owner에게 초대·역할 변경·멤버 제거·설정 UI를 표시하고 마지막 owner의 변경·제거는 화면에서도 막는다. 제거 전에는 확인 UI를 제공한다.
   - 기관 설정은 `?tab=settings`로 직접 접근 가능하며 owner만 수정한다. 멤버 탭은 기본 경로다. 기관 문서·키 탭은 각각 후속 범위에서 구현한다.
   - 사용자별 기관 상세·멤버·초대 캐시를 사용한다. 초대 응답, 멤버 변경, 기관 설정 저장 후 관련 쿼리를 갱신한다. 본인 강등 시 관리 UI를 숨기고, 본인 제거 시 대시보드로 이동한다.
   - 401은 현재 계정의 세션 만료를 처리하고, 403·404·409 쓰기 오류는 관련 캐시를 재검증한다. API에 상세 오류 코드가 없어 409 안내는 해당 작업의 가능한 원인을 함께 설명한다.
   - 웹 ESLint·Next 프로덕션 빌드(TypeScript 포함) 통과. 실제 headless Chrome + tlog_test에서 게스트 보호, owner/비owner 권한, 초대 생성·중복·수락·거절, 새로고침 없는 갱신, 계정 간 캐시 분리, 역할 변경·제거, 설정 저장, 세션 만료, 조회 실패 후 재시도, 본인 강등·제거를 확인했다.
   - 최대 길이의 기관 이름·설명·멤버 이름으로 320/390/768/1024/1440px 가로 넘침이 없었고 스크린샷을 확인했다. 처리되지 않은 브라우저 예외가 없었으며 QA 데이터는 삭제했다.
   - 새 의존성·API 변경 없음. 새 멤버·초대 API 7개와 기존 기관 상세·수정 API를 웹에서 사용한다. 관련 평가 항목인 동적 경로, 권한별 UI, 로딩·오류·입력 검증, 새로고침 없는 상태 갱신, 반응형을 확인했다.
3. **`packages/shared` — 완료·Accept**: RFC 8785 JCS canonical encoder, ISSUE·REVOKE·KEY_*·STH payload 타입, hex 검증·변환 유틸, 테스트.
   - `canonicalize(unknown)`는 문자열, `canonicalBytes(unknown)`는 BOM 없는 UTF-8 바이트를 반환한다. RFC 8785 §§3.1–3.2.4에 따라 원시 타입 표기, 재귀적 UTF-16 키 정렬, 배열 순서, 유니코드 원형을 보존한다. 정수처럼 보이는 객체 키도 문자열 순서로 출력한다.
   - NaN·Infinity, lone surrogate, undefined·BigInt·함수·symbol, 순환 참조, 희소 배열과 추가 배열 속성을 거부한다. 입력은 JSON 원시 값·배열·plain object(null prototype 포함)이며 Date·DTO 인스턴스·getter·toJSON 자동 변환·숨겨진 속성을 허용하지 않는다.
   - ISSUE·REVOKE 로그 바이트의 구조는 `{ payload, signature }`, KEY_*는 규칙에 명시된 평면 객체다. STH는 `{ treeSize, timestamp, rootHash }`만 서명한다. 기존 API·웹 타입의 일괄 교체는 하지 않는다.
   - hex 유틸은 소문자·짝수 길이를 검사하고, 필요하면 바이트 길이를 지정한다. 대문자·공백·접두사 등을 자동 보정하지 않는다. 빈 바이트는 일반 변환에서 허용하지만 암호학 필드에는 32/64 등의 길이를 명시해야 한다.
   - payload 타입은 컴파일 시 구조만 정의한다. UUID·hex 길이·카테고리·leaf index 범위·시간 오차 같은 도메인 검증은 후속 API DTO·서비스에서 수행해야 한다. 인코더는 JSON 파서가 아니므로 원문 JSON의 중복 키 검출은 담당하지 않는다.
   - Vitest 70개 통과: RFC의 키 정렬·Appendix B 숫자 예제, 직접 명시한 UTF-8 바이트, 잘못된 입력 거부, wire payload 형태, hex 경계값. ESM 빌드, shared 구현·테스트 타입, API·웹 타입 호환성, shared ESLint 통과.
   - `canonicalBytes`와 `hexToBytes`의 반환 타입은 `Uint8Array<ArrayBuffer>`다. WebCrypto의 `BufferSource`에 타입 단언 없이 전달할 수 있음을 shared 타입 검사에서 확인했다. 평가 항목 중 해시·키·서명 입력 검증의 공통 기반을 마련했으며, 실제 endpoint DTO 연결은 후속 단계다.
   - 빌드된 동일 ESM을 Node와 실제 headless Chrome에서 로드하여 입력 15개의 바이트 일치, 브라우저의 잘못된 입력 10개 거부와 hex 유틸 동작을 확인했다. 새 의존성·API·DB·보호 영역 변경 없음.
4. **Merkle root·inclusion proof — 완료·Accept** (보호 영역): RFC 9162 §2.1.1 root, §2.1.3.1 inclusion 생성, §2.1.3.2 inclusion 검증.
   - 사용자가 상세 계획을 승인했고 벡터 생성에 관해 “테스트 벡터는 /subagent를 통해 만들어. 그리고 네가 직접 테스트해.”라고 명시했다. 이번 벡터 신규 생성은 기존 사람이 작성/에이전트 수정 금지 규칙의 사용자 승인 예외다. 일반 규칙은 변경하지 않는다.
   - 서브에이전트는 `test/vectors/**`의 Python hashlib 참조 생성기·문서·고정 벡터만 작성했다. 프로덕션 TypeScript와 테스트 runner는 메인 에이전트가 작성·직접 실행했다.
   - 고정 입력은 64개(첫 입력은 빈 바이트, 이후 UTF-8 `tlog-vector-001`~`063`). root 65개(0~64), inclusion 2,080개, 다음 단계용 consistency 2,016개. JSONL 두 proof 파일은 합계 약 1.66MB이며 README에 형식·RFC 근거·재생성 방법·독립성 한계를 기록했다.
   - 참조 생성기는 재귀 생성과 별개로 스택 root·반복 proof 검증, 변조·누락·추가 거부, RFC §2.1.5의 7-leaf 구조 예제를 확인했다. 재생성 결과도 바이트 단위로 일치했다. TypeScript 구현의 출력으로 기대값을 생성하지 않았다.
   - `leafHash(entryBytes)`, `nodeHash(left,right)`, `rootFromLeafHashes(leafHashes)`, `createInclusionProof(leafHashes,leafIndex)`, `verifyInclusion({leafHash,leafIndex,treeSize,rootHash,proof})`를 공개한다. 원본 바이트와 이미 해시된 leaf의 입력을 구분한다.
   - 해시는 32바이트다. 생성 입력 오류는 TypeError/RangeError, 잘못된 proof·메타데이터는 false다. 단일 leaf의 proof는 빈 배열이며 빈 트리 inclusion은 허용하지 않는다. 입력을 변경하지 않고 root·proof는 입력과 메모리를 공유하지 않는다.
   - 검증의 인덱스 계산에는 정수 나눗셈을 사용해 32비트 잘림을 피하고, 안전한 정수 범위와 proof 최대 길이 53을 확인한다. 32/52비트 인덱스도 별도 테스트했다. 반환 바이트는 WebCrypto BufferSource와 호환된다.
   - `@noble/hashes@2.4.0`(2026-08-27 출시, 2주 이상 지난 안정 버전)을 고정했다. WebCrypto가 대안이지만 저장소에서 지정한 Node/브라우저 공통 동기 해시를 사용했다. 테스트만 `@tlog/shared`의 hex 유틸을 사용한다.
   - 메인 실행 검증: Vitest 2,167개, 빌드, 구현·테스트 타입 검사 통과. 실제 Chrome native ESM에서 root 65개·inclusion 2,080개 일치와 변조 거부·큰 인덱스를 확인했다. 설치된 API Jest에서 ESM 로드·생성·검증 1개 통과. 첫 검증에서 존재하지 않는 equalBytes export 사용 오류를 수정했으며 벡터·기대값은 변경하지 않았다.
   - 관련 평가 항목은 브라우저 검증을 위한 공통 Merkle 기반이다. DB append·STH 서명·API 통합·consistency TypeScript 구현은 후속 단계다. 현재 root·proof 생성은 전체 leaf 목록을 받으며 DB 노드 캐시나 증분 append 최적화는 포함하지 않는다.
5. **Merkle consistency proof — 완료·Accept** (보호 영역): RFC 9162 §2.1.4.1 생성·§2.1.4.2 검증. 사용자가 상세 계획과 경계 조건을 승인했다.
   - `@noble/hashes` 사용. 테스트 벡터는 기본적으로 사람이 작성한다. 이번 세션은 위 사용자 승인 예외에 따라 서브에이전트가 독립 생성한 consistency 2,016개를 준비했다. 벡터 수정은 별도 요청 없이는 하지 않는다.
   - 4단계 커밋은 `473208f` (`feat: add Merkle roots and inclusion proofs`). 기존 고정 벡터를 변경하지 않고 메인 에이전트가 구현·테스트 작성·실행을 담당했다.
   - `createConsistencyProof(leafHashes, firstSize)`, `verifyConsistency({firstSize,secondSize,firstRoot,secondRoot,proof})`를 공개한다. 생성기는 현재 트리 전체의 leaf hash 목록을 받고, 검증기는 과거·현재 root와 proof만 사용한다.
   - 승인된 경계 정책: 크기는 양의 안전한 정수, firstSize <= secondSize다. 같은 크기는 빈 proof와 동일한 root일 때만 성공한다. 크기 0은 두 트리가 모두 빈 경우를 포함해 거부한다. 빈 트리 STH 정책은 6단계에서 별도로 결정한다.
   - 생성 오류는 TypeError/RangeError, 잘못된 proof·메타데이터는 false다. 32바이트 해시와 proof 길이 최대 54(RFC의 ceil(log2(n))+1 상한)를 검사하며, 인덱스는 정수 나눗셈으로 처리한다. 검증기가 입력 proof에 root를 삽입하지 않도록 별도 cursor로 초기화한다.
   - Vitest 4,256개(기존 2,167 + 신규 2,089) 통과: 독립 consistency 벡터 2,016개 전체 생성·검증 대조, 모든 proof 노드·두 root 변조, 누락·추가 거부, 크기 1~64 동일 크기 경계, 크기 0·역전·부정확한 수·해시 길이·희소 배열 거부, 입력 불변성·메모리 비공유, 32/52비트 크기의 두 초기화 경로.
   - 빌드·구현/테스트 타입 검사 통과. 실제 Chrome native ESM에서 동일한 2,016개 벡터·64개 경계와 변조·동결 proof·큰 크기를 검증했다. 설치된 API Jest의 ESM 로드·생성·검증·경계 처리 1개 통과.
   - 새 의존성·API·DB 변경 없음. 관련 평가 항목인 브라우저에서의 append-only 검증 기반을 마련했으며 STH 서명 검증·DB append·API 연결은 후속 단계다.
6. **log 모듈**
   - `log_state` `SELECT ... FOR UPDATE` 직렬화 append와 STH Ed25519 서명(`LOG_SIGNING_KEY`)
   - getLatestSth, listSthHistory, getConsistencyProof, listEntries, getInclusionProof (5)
   - 빈 트리 STH 처리 방식을 결정한다.
   - 동시 append 20건에서 leaf index가 연속인지 테스트한다.
7. **멤버 키 API**
   - API: registerKey, listKeys, getMemberActiveKeys, approveKey(`KEY_REGISTER` append), revokeKey(`KEY_REVOKE` append, 대기 요청을 `needs_resend`로) (5)
   - 같은 사용자, 기관, 용도의 active 키가 하나만 되도록 승인 로직에서 보장한다.
   - 키 등록·승인과 이후 세션 D의 요청 생성 등은 멤버 변경과 동일한 기관 행 잠금 규칙을 적용하고, 잠금 후 멤버십·역할을 재검증해야 한다.
8. **브라우저 키·관리 UI**: `apps/web/src/lib/crypto/keys.ts`(보호 영역, 상세 계획 승인 필요, non-extractable, IndexedDB), `/settings/keys`, 기관 키 승인·폐기 UI, 실제 브라우저 검증.

5단계까지 Accept·커밋 완료(`6d7d982`, `feat: add Merkle consistency proofs`). 남은 세션 C 검토 단위는 3개다. 사용자 요청에 따라 로그·STH 전에 아래 전체 저장소 리뷰 수정을 진행한다. 세션 C 완료 시 누적 endpoint 25. 배포·Push는 포함하지 않는다.

### 전체 저장소 리뷰 수정 (2·3 완료, 1은 SSO 도입으로 후속 처리)

1. **이메일 소유 확인 — SSO 도입 결정, 미해결**: 미가입 수신자 이메일을 다른 사람이 등록하고 owner 초대를 수락할 수 있음을 tlog_test 실제 API에서 재현했다. 사용자가 SMTP 방식 대신 SSO 도입을 선택했다. 아직 SSO 연동이나 verified 필드는 없으며 이 취약점은 해결 전이다. 실제 사용자에게 공개하기 전에 해결한다.
2. **기관 수정 권한 경쟁 조건 — 완료·Accept·커밋 `87f2322`**: 기존 멤버 쓰기 작업의 owner 트랜잭션을 `members/organization-lock.ts`의 `withOwnerTransaction`으로 추출해 재사용한다. updateOrg에 현재 사용자 id를 전달하고, 기관 행 잠금 후 owner를 확인한 동일 트랜잭션에서 수정한다.
   - Guard 통과 후 쓰기를 대기시키고 다른 owner가 강등을 완료한 뒤 재개하는 e2e를 추가했다. 403과 기관 이름 미변경을 검증한다. 기존 멤버·초대 쓰기 동작은 같은 공통 로직을 사용한다.
3. **54노드 정상 proof 회귀 — 완료·Accept·커밋 `1003d8e`**: firstSize=3, secondSize=Number.MAX_SAFE_INTEGER인 54노드 proof의 성공과 한 노드 누락 거부를 테스트 하나로 추가했다. 고정 벡터·프로덕션 Merkle 코드는 변경하지 않는다.

수정 2·3 검증: API e2e 126개, Merkle Vitest 4,257개, API/Merkle 구현·테스트 타입 검사, 전체 ESLint와 변경 파일 포맷 검사 통과. 기존 비밀번호 단위 테스트는 재실행하지 않았다. 사용자가 오늘 작업 종료와 함께 수정·인수인계 기록의 커밋을 명시적으로 승인했다.

### 다음 재개 시 우선순위: Witness SSO와 이메일 초대 권한

1. **SSO 계약 확인·계획 승인**: 사용할 제공자, 지원 프로토콜, 클라이언트 등록·콜백 주소, 안정적인 사용자 식별자, 이메일 소유 확인 보장을 공식 문서로 확인한다. 제공자·라이브러리·계정 연결 정책을 추측하지 않는다.
2. **기존 계정 연결 정책**: 제공자의 안정적인 사용자 식별자로 계정을 구분하고, 이메일 문자열만 같은 이유로 기존 계정을 자동 연결하지 않는다. 기존 사용자 id·기관 멤버십·기록을 보존하는 방식, 기존 비밀번호 로그인 유지/전환 여부와 기존 세션 처리를 먼저 정한다.
3. **SSO 서버·웹 구현**: 검증된 인증 결과만 세션으로 발급하고 콜백 위조·재사용 방지를 구현한다. 선택한 제공자의 이메일 소유 확인 보장을 실제로 검증해야 하며 SSO 도입만으로 리뷰 1번을 해결 처리하지 않는다. 스키마 변경이 필요하면 보호 영역 계획 승인 후 새 마이그레이션으로 분리한다. `.env`는 읽거나 수정하지 않고 필요한 설정은 `.env.example`로 안내한다.
4. **초대 수락 보완**: SSO로 확인된 신원·이메일을 기준으로 받은 초대 조회·수락 권한을 검증한다. 기존 미인증 계정도 우회 경로가 되지 않도록 한다. 이메일을 임의 등록한 계정의 owner 초대 수락 거부, 정상 SSO 수락, 계정 연결 실패·충돌·세션 전환을 회귀 테스트한다.
5. **Witness 표기 반영**: 브랜드 문자열과 페이지 metadata 등을 정리한다. 보안 프로토콜 값 변경은 별도 설계 결정 없이 수행하지 않는다.
6. **기존 세션 C 재개**: 로그·STH(6단계) → 멤버 키 API(7단계) → 브라우저 키·관리 UI(8단계). 기존 남은 검토 단위는 3개이고, SSO 추가 검토 단위와 API 개수는 계약·범위 확정 후 다시 산정한다. 세션 D 계획은 아래에 유지한다.

오늘 종료 시점: 시험 배포·Push는 하지 않았고, QA 데이터·임시 스크립트·브라우저 프로필은 정리했다. 개발/QA 서버와 테스트용 MySQL·SeaweedFS는 종료했으며 데이터 볼륨은 보존했다.

Ponytail은 원본 `DietrichGebert/ponytail`의 커밋 `96608e078b2d5ea607c5c3b8b5a54d1c1fba6846`에서 사용자 스킬 폴더에 설치했다(`ponytail`, `ponytail-review`). 기본 full 기준으로 불필요한 변경을 줄이되 검증·보안·접근성을 줄이지 않는다. 프로젝트의 단계별 Accept·보호 영역 규칙은 유지한다.

### 세션 D (5h): 서명 흐름 완성

1. **signature requests와 files**
   - API: createSignatureRequest(중복이면 409, 기존 문서·요청 링크), uploadEncryptedFile, downloadEncryptedFile, listMySignatureRequests (4)
   - S3 연동, `lib/crypto/transfer.ts`(HPKE Base mode 구조, AAD)
   - `/orgs/[slug]/new` (3단계 진행 표시, 20MB 제한)
   - 거절된 파일로 다시 요청할 때의 처리를 결정한다 (`documents(org_id, file_hash)` unique).
2. **sign과 reject** (2)
   - `lib/crypto/sign.ts`, `/inbox`, `/inbox/[requestId]`: 복호화, 해시 비교 배지, 책임 확인, 서명 카드
   - `ISSUE` append, 커밋 후 ciphertext 삭제(실패하면 `deleted_at` null로 남김)
   - 헤더의 요청함 배지
3. **documents**: listDocuments, getDocument, revokeDocument(`REVOKE` append, revocations INSERT) (3). `/documents/[id]`
4. **verify**: verifyByHash. `/` 검증 페이지. `lib/crypto/verify.ts`로 5단계 검증 애니메이션과 4가지 상태 카드. 하단에 알려진 한계 안내
5. **`/log` 탐색기**: STH 이력, entry 목록, `?first=&second=` consistency 검증
6. **e2e**: 서명 요청 → 서명 → inclusion proof → `packages/merkle`로 검증. 서명 거부 케이스(다른 키, 필드 변경, 폐기된 키)
7. **MVP 시드 데이터**(기관 2, 사용자 4, 문서 8, 대기 요청 2), 최종 배포, 데모 시나리오 1~9 점검

누적 endpoint 35

### 시간이 부족할 때 미룰 순서

뒤에 있는 것부터 미룬다: `needs_resend` 재전송 흐름 → `audit_logs` UI → i18n → 모바일 세부 다듬기 → RFC 3161 TSA. 데모 시나리오 1~9에는 모두 필요하지 않다.
