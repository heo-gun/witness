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

## 현재 상태 (세션 B 완료, 시험 배포 보류, 2026-11-11)

| 영역 | 상태 |
|---|---|
| 모노레포 | pnpm workspace, TS 6.0 strict, ESLint 10 flat, Prettier, LF 고정 |
| 로컬 인프라 | `docker-compose.yml`: MySQL 8.4(호스트 3307), SeaweedFS 4.48(S3, 8333) |
| `packages/shared` | `API_PREFIX`만 있음. ESM, `dist` 빌드, Vitest |
| `packages/merkle` | 빈 패키지 (`export {}`) |
| `apps/api` | NestJS 12, `/api/v1`, 인증 4개·기관 4개 API, JWT·멤버십 역할 Guard, e2e 88개 |
| DB | Prisma 7, 13테이블, 마이그레이션 3개, `log_state (1, 0)` 시드 |
| `apps/web` | Next.js 16 App Router, 디자인 토큰·기초 UI, 헤더·로그인·회원가입·대시보드, 실제 API·TanStack Query 연동 |

평가 체크리스트 충족: DB 테이블 8개 이상(13개), 인덱스(필수 8개 모두).

세션 B 추가 확인: JWT 인증·역할 권한 검사, 입력 DTO 검증, 기관·owner 멤버십의 원자적 생성, 동일 slug 동시 생성 정합성. 프론트는 로그인별 헤더, 폼 검증·로딩·오류, 새로고침 없는 상태 갱신과 반응형을 확인했다. 누적 API는 8개로 16개 기준은 아직 미충족이다. 시험 배포와 배포 환경의 CORS 검증은 사용자 요청으로 보류했다.

## 결정된 사항

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

### 세션 C (5h): 신뢰의 뼈대

1. **members와 invitations**: listMembers, changeRole, removeMember, inviteMember, listMyInvitations, accept, decline (7). 중복 pending 초대는 서비스에서 막는다. `/orgs/[slug]` 멤버 탭, dashboard의 받은 초대
2. **`packages/shared`**: RFC 8785 JCS canonical encoder, ISSUE·REVOKE·KEY_* payload 타입, hex 검증 유틸, 테스트
3. **`packages/merkle`** (보호 영역): RFC 9162 §2.1 root, §2.1.3 inclusion, §2.1.4 consistency 생성과 검증
   - `@noble/hashes` 사용
   - **테스트 벡터(크기 1~64)는 사람이 만든다**. 세션 전에 준비해두면 시간이 크게 절약된다.
   - 변조된 proof가 거부되는지도 테스트한다.
   - Jest에서 ESM 전용 `@noble/*`가 로드되는지 확인한다.
4. **log 모듈**
   - `log_state` `SELECT ... FOR UPDATE` 직렬화 append와 STH Ed25519 서명(`LOG_SIGNING_KEY`)
   - getLatestSth, listSthHistory, getConsistencyProof, listEntries, getInclusionProof (5)
   - 빈 트리 STH 처리 방식을 결정한다.
   - 동시 append 20건에서 leaf index가 연속인지 테스트한다.
5. **keys**
   - API: registerKey, listKeys, getMemberActiveKeys, approveKey(`KEY_REGISTER` append), revokeKey(`KEY_REVOKE` append, 대기 요청을 `needs_resend`로) (5)
   - `apps/web/src/lib/crypto/keys.ts`(보호 영역, non-extractable, IndexedDB)
   - `/settings/keys`, 기관 키 탭(승인)
   - 같은 사용자, 기관, 용도의 active 키가 하나만 되도록 승인 로직에서 보장한다.

누적 endpoint 25

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
