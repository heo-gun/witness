# PLAN.md

남은 작업 계획과 인수인계 메모. 규칙은 `AGENTS.md`, `CLAUDE.md`가 우선한다. 이 문서는 진행 상황에 맞춰 갱신한다.

## 작업 방식 (세션이 바뀌어도 유지)

- 새 기능은 plan mode로 시작하고, 계획 승인 전에는 파일을 수정하지 않는다.
- 코드를 쓰기 전에 작업 폴더와 파일 목록을 먼저 밝힌다.
- 한 단계(커밋 단위)를 구현하면 멈추고, 리뷰 가이드(읽는 순서, `file:line`, 다룬/다루지 않은 엣지 케이스, 평가 체크리스트 충족 여부)와 함께 **accept/reject**를 묻는다. accept 전에는 커밋하지 않고 다음 단계로 넘어가지 않는다. 계획 승인은 단계별 커밋 승인을 대신하지 않는다.
- 커밋 전에 `git diff --cached --name-status`로 스테이징 목록을 확인한다. 직접 작성하지 않은 파일(도구가 자동 생성한 파일 등)이 섞이면 먼저 알린다.
- `git push`는 사람이 한다. 원격: `origin` = `https://github.com/heo-gun/witness.git`
- 새 의존성은 이유와 대안을 먼저 제시하고, 2주 이상 지난 안정 버전으로 고정한다.

## 현재 상태 (세션 A 완료, 2026-11-05)

| 영역 | 상태 |
|---|---|
| 모노레포 | pnpm workspace, TS 6.0 strict, ESLint 10 flat, Prettier, LF 고정 |
| 로컬 인프라 | `docker-compose.yml`: MySQL 8.4(호스트 3307), SeaweedFS 4.48(S3, 8333) |
| `packages/shared` | `API_PREFIX`만 있음. ESM, `dist` 빌드, Vitest |
| `packages/merkle` | 빈 패키지 (`export {}`) |
| `apps/api` | NestJS 12, `/api/v1`, 전역 ValidationPipe, PrismaModule, e2e 3개 |
| DB | Prisma 7, 13테이블, 마이그레이션 3개, `log_state (1, 0)` 시드 |
| `apps/web` | Next.js 16 App Router, Tailwind v4, TanStack Query Provider, `/api` rewrite 프록시 |

평가 체크리스트 충족: DB 테이블 8개 이상(13개), 인덱스(필수 8개 모두).

## 결정된 사항

- 개발 방식: mock 없이 `apps/api`와 함께 기능 단위로 만든다. 스택은 AGENTS.md를 따르고, AGENTS.md가 정하지 않은 것(Tailwind, shadcn/ui)은 MVP.md를 따른다.
- 파일 전달 필드명은 `recipientFingerprint`로 통일 (MVP.md의 `recipientKeyFingerprint` 대신)
- `documents`, `member_keys`는 `status`만 갱신한다. 서명·승인·폐기 정보는 `log_entries`(조회용 컬럼 `actor_id`, `document_id`, `key_fingerprint`)와 `revocations`에서 `include`로 조립해 MVP 타입 형태로 응답한다.
- id는 `uuid(7)` `CHAR(36)`, 시간은 `DATETIME(3)`. STH와 payload의 시간 문자열은 `toISOString()`로 만든다.
- 로컬 S3는 SeaweedFS. 접근은 `@aws-sdk/client-s3`만 사용한다.

## 환경 메모 (함정)

- **Node 26.13** (최소 24.9). NestJS 12가 ESM 전용이라 Jest는 `node --experimental-vm-modules`로 실행한다 (`apps/api/package.json`의 `test:*`).
- **pnpm 12**: 빌드 스크립트를 가진 패키지는 `pnpm-workspace.yaml`의 `allowBuilds`에 명시해야 설치된다. 현재: `@parcel/watcher` 거부, `prisma`, `@prisma/engines` 허용.
- **TypeScript 7은 쓰지 않는다**: typescript-eslint(`<6.1`)와 ts-jest(`<7`)가 지원하지 않는다.
- **Prisma 7**
  - 런타임에 driver adapter가 필수다(`@prisma/adapter-mariadb`).
  - client는 `apps/api/src/generated/prisma`에 생성되고 git에서 제외된다. `build`, `dev`, `test`가 `prisma generate`를 먼저 실행한다.
  - `prisma.config.ts`가 `.env`를 `process.loadEnvFile`로 읽는다.
  - npm `latest` 태그가 8.0 RC를 가리키므로 7.10.1로 고정한다.
- **Next 16**
  - `next dev`가 AI 에이전트를 감지하면 `AGENTS.md`를 자동 생성하므로 `next.config.ts`에서 `agentRules: false`로 꺼뒀다.
  - API가 학습 데이터와 다를 수 있으니 `apps/web/node_modules/next/dist/docs/`를 참고한다.
- **`.env`**: `apps/api/.env`는 사람이 `.env.example`에서 만든다. 에이전트는 읽지 않는다. `JWT_SECRET`, `LOG_SIGNING_KEY`는 아직 비어 있다.
- **e2e**: 현재 개발 DB(`tlog`)를 그대로 쓴다. `--runInBand`로 순서대로 실행한다.

## 남은 작업

엔드포인트 이름과 형태는 MVP.md "API 계약"(35개)을 따른다.

### 세션 B (2h): 인증과 기관

시작 전에 정할 것:
1. 비밀번호 해시: `argon2`(권장, allowBuilds 필요)와 `bcryptjs` 중 선택
2. JWT 위치: httpOnly 쿠키(권장, 같은 origin 프록시)와 Authorization 헤더 중 선택
3. e2e 전용 DB(`tlog_test`)를 분리할지

단계:
1. **auth 모듈**: register, login, logout, me (4). JWT Guard, `@CurrentUser`. DTO Validation. 각 API마다 성공 1개, 권한 실패 1개 테스트
2. **web**: 디자인 토큰(무채색과 남색 포인트, 상태 색), shadcn/ui 기초 컴포넌트, 헤더, `/login`, `/register`. i18n 키 분리 방식 결정
3. **orgs 모듈**: createOrg, listOrgs, getOrg, updateOrg (4). 멤버십 기반 역할 Guard(`@Roles`)
4. **web**: `/dashboard` (내 기관 목록, 기관 생성)
5. **시험 배포**: `*.newbie.sparcs.net`에 올리고 `/api` 프록시와 CORS 확인

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
