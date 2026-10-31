# AGENTS.md

이 문서는 이 저장소에서 작업하는 모든 코딩 에이전트(Claude Code, Codex 등)의 공통 규칙이다.

## 프로젝트

학생단체의 예결산·의결 문서를 책임자(회장, 의장, 회의 진행자)가 직접 전자서명하고, 그 기록을 append-only Merkle 로그에 남겨 누구나 검증할 수 있게 하는 서비스.

- 서명은 책임자의 브라우저에서 만들어진다. 서버는 서명 비밀키를 절대 보지 않는다. 서버가 책임자 대신 서명할 수 없어야 "누가 승인했는가"에 책임을 물을 수 있다.
- 서버는 문서 평문을 보지 않는다. issuer에서 signer로 가는 파일은 브라우저에서 키 합의로 암호화한 ciphertext로만 서버를 거치고, 서명 또는 거절 후 삭제된다. 로그에는 SHA-256 해시만 남는다.
- 모든 서명, 폐기, 멤버 키 등록·폐기는 Merkle 로그에 기록된다.
- 검증(서명, inclusion proof, consistency proof)은 브라우저에서 수행할 수 있어야 한다. 서버 응답을 믿지 않는 것이 이 서비스의 핵심이다.
- UI 프로토타입은 Lovable로 먼저 만든다. 화면 구조, 데모 시나리오, API 계약은 `MVP.md`를 기준으로 하고, 범위 밖 기능은 요청받지 않으면 만들지 않는다.

## 작업 원칙 (가장 중요)

이 프로젝트는 사람이 모든 코드를 이해하는 것을 전제로 한다. 자동 승인 없이 사람이 모든 diff를 리뷰한다.

1. 한 번의 변경은 하나의 기능만 다룬다. diff는 사람이 한 번에 읽을 수 있는 크기(대략 300줄 이하)로 유지한다. 더 커질 것 같으면 먼저 쪼개는 방법을 제안한다.
2. 변경 후에는 무엇을, 왜 바꿨는지 요약한다. 자명하지 않은 설계 결정과 대안은 명시한다.
3. 요청 범위 밖의 파일은 수정하지 않는다. 리팩터링이 필요해 보이면 제안만 하고 실행하지 않는다.
4. 스펙이 모호하면 추측하지 말고 질문한다. 특히 암호학 관련 동작은 절대 추측하지 않는다.
5. 테스트가 실패하면 테스트를 고쳐서 통과시키지 않는다. 원인을 보고한다.
6. 코드 주석은 쓰지 않는다. 의도 설명은 변경 요약과 커밋 메시지에 쓴다.
7. 기능을 완성했다고 보고하기 전에 아래 "평가 기준 체크리스트"에서 해당 기능과 관련된 항목을 확인하고, 충족 여부를 요약에 적는다.

## 보호 영역

다음 영역은 수정 전 반드시 계획을 제시하고 사람의 승인을 받는다.

- `packages/merkle/**`: 서비스의 정체성이다. 사람이 작성하거나 한 줄씩 검토한다.
- `packages/merkle/test/vectors/**`: 테스트 벡터는 사람이 만든다. 에이전트는 절대 수정하지 않는다.
- `apps/web/src/lib/crypto/**`: 브라우저 키 생성·보관, 서명, 키 합의, 파일 암복호화 코드. 비밀키나 평문을 서버로 보내거나 비밀키를 extractable로 만드는 변경은 금지한다.
- `apps/api/prisma/migrations/**`: 기존 마이그레이션은 수정하지 않는다. 변경은 새 마이그레이션으로만 한다.
- Append-only 원칙: `log_entries`, `tree_heads`, `revocations` 테이블에 UPDATE나 DELETE를 하는 코드는 작성하지 않는다. `documents.status`, `member_keys.status`만 조회용 캐시로 갱신할 수 있다.

## 저장소 구조

```
apps/web           Next.js (App Router) 프론트엔드
apps/api           NestJS 백엔드, Prisma
packages/merkle    RFC 9162 기반 Merkle tree, 브라우저와 Node 양쪽에서 동작
packages/shared    API DTO 타입, canonical encoding, 서명 payload 정의
```

`packages/merkle`과 `packages/shared`는 서버와 브라우저가 같은 코드를 쓰도록 분리했다. Node 전용 API(`node:crypto`, `Buffer` 등)를 쓰지 않는다.

## 스택과 명령어

- Node 22, pnpm workspaces, TypeScript strict
- MySQL 8, Prisma
- 해시와 서명 검증: `@noble/hashes`, `@noble/curves`
- 브라우저 키: WebCrypto Ed25519(서명), X25519(키 합의), non-extractable, IndexedDB 보관
- 파일 암호화: WebCrypto HKDF-SHA256, AES-256-GCM
- ciphertext 저장: S3 호환 스토리지 (로컬은 MinIO)
- 서버 상태 관리: TanStack Query
- 테스트: `packages/*`는 Vitest, `apps/api`는 Jest(e2e 포함)

```
docker compose up -d mysql minio
pnpm install
pnpm dev
pnpm test
pnpm -F @tlog/merkle test
pnpm -F api prisma migrate dev --name <name>
pnpm lint
```

## 도메인 규칙

### 역할

| 역할 | 실무 예시 | 권한 |
|---|---|---|
| `owner` | 기관 관리자 | 기관 수정, 멤버 초대·제거·역할 변경, 서명키 등록 승인·폐기 |
| `signer` | 회장, 의장, 회의 진행자 | 서명 요청 승인(서명)·거절, 문서 폐기 서명 |
| `issuer` | 회계 담당, 서기 | 문서 등록과 서명 요청 생성 |

- signer는 서명하려면 `active` 상태의 `sign` 키를, 서명 요청을 받으려면 `active` 상태의 `encrypt` 키를 가져야 한다.
- 서명 요청을 만든 사람과 서명하는 사람은 같은 사용자일 수 없다.

### 서명 흐름

1. issuer가 파일을 드롭하면 브라우저가 SHA-256을 계산하고, 제목·카테고리·지정 signer로 서명 요청을 만든다. 서버는 `pending` 문서와 요청 id를 돌려준다. 아직 로그에 기록되지 않는다.
2. issuer 브라우저가 signer의 `active` `encrypt` 공개키로 파일을 암호화해 ciphertext를 업로드한다. (아래 "파일 전달 암호화")
3. signer가 요청을 열면 브라우저가 ciphertext를 받아 복호화하고 미리보기로 보여준다. 동시에 복호화한 평문의 SHA-256을 직접 계산해 요청의 `fileHash`와 비교한다. 다르면 서명을 막고 경고한다.
4. signer가 문서를 연 뒤 "문서 내용을 확인했으며 이 승인에 책임을 집니다"에 동의하면, 브라우저가 직접 계산한 해시로 서명 payload를 만들어 서명한다. 서버가 준 해시를 그대로 서명하지 않는다.
5. 서버는 서명을 등록된 공개키로 검증한 뒤 `ISSUE` entry를 append하고 문서 상태를 `valid`로 바꾼다. 트랜잭션 커밋 후 ciphertext를 스토리지에서 삭제하고, 삭제가 실패하면 재시도 대상으로 남긴다.
6. signer가 거절하면 사유와 함께 `rejected` 상태가 되고, 로그에는 기록되지 않으며, ciphertext는 삭제된다.

### 멤버 키

- 용도별로 두 종류를 쓴다: `sign`(Ed25519, signer만)과 `encrypt`(X25519, 파일을 받는 멤버). 같은 키를 서명과 키 합의에 함께 쓰지 않는다.
- 키 쌍은 멤버의 브라우저에서 WebCrypto로 생성하고, 비밀키는 non-extractable로 IndexedDB에 보관한다.
- 서버에는 공개키, 용도, fingerprint(`SHA256(public_key)`의 hex)만 저장한다.
- 새로 등록한 키는 `pending` 상태이고, owner가 승인하면 `active`가 되며 `KEY_REGISTER` entry가 로그에 기록된다.
- 키 폐기 시 `KEY_REVOKE` entry가 기록된다. 폐기 이전에 그 키로 한 서명은 유효하게 유지된다.
- 기기를 바꾸거나 브라우저 데이터를 지우면 키는 복구되지 않는다. 새 키를 등록하고 기존 키를 폐기한다. 이전 `encrypt` 키로 암호화된 대기 요청은 열 수 없으므로 issuer에게 재전송을 요청하는 상태(`needs_resend`)로 바꾼다.

### 파일 전달 암호화

HPKE(RFC 9180) Base mode와 같은 구조를 WebCrypto로 구성한다.

1. issuer 브라우저가 일회용 X25519 키 쌍을 만든다.
2. `shared = X25519(ephemeral_private, recipient_public)`
3. `key = HKDF-SHA256(ikm = shared, salt = ephemeral_public || recipient_public, info = "tlog/file/v1")`로 AES-256-GCM 키를 얻는다.
4. IV는 96비트 난수. AAD는 canonical JSON `{ requestId, orgId, fileHash, recipientFingerprint }`.
5. ciphertext, `ephemeralPublicKey`, `iv`, `recipientFingerprint`를 업로드하고 일회용 비밀키는 즉시 버린다.

- 파일 크기 상한은 20MB. 단일 AES-GCM 처리로 충분한 크기다.
- 서버는 AAD를 따로 저장하지 않고 요청 메타데이터로 재구성한다. AAD 덕분에 ciphertext를 다른 요청에 옮겨 붙이면 복호화가 실패한다.
- 한계: Base mode는 발신자를 인증하지 않는다. signer는 자신이 실제로 열람하고 해시를 확인한 내용에 서명하므로 승인 책임은 유지되지만, "이 파일을 issuer가 보냈다"는 암호학적 증명은 없다. 필요하면 issuer의 `encrypt` 키 DH를 추가하는 Auth mode로 확장한다.

### 서명 payload

RFC 8785(JCS) canonical JSON의 UTF-8 바이트에 서명한다. 구현은 `packages/shared`의 canonical encoder 하나만 사용한다.

- 발급: `{ action: "ISSUE", orgId, documentId, fileHash, title, category, signerId, signerKeyFingerprint, signedAt }`
- 폐기: `{ action: "REVOKE", orgId, documentId, targetLeafIndex, reason, signerId, signerKeyFingerprint, signedAt }`

`signedAt`이 서버 시각과 5분 이상 차이 나면 서버는 거부한다.

### Log entry

- entry 타입은 `ISSUE`, `REVOKE`, `KEY_REGISTER`, `KEY_REVOKE`.
- `ISSUE`, `REVOKE`의 `entry_bytes`는 `{ payload, signature }`의 canonical JSON이다. 검증자는 entry만으로 서명을 다시 확인할 수 있어야 한다.
- `KEY_REGISTER` 필드: `type`, `orgId`, `userId`, `purpose`, `publicKey`, `fingerprint`, `approvedBy`, `approvedAt`
- `KEY_REVOKE` 필드: `type`, `orgId`, `fingerprint`, `revokedBy`, `revokedAt`, `reason`
- 폐기는 기존 entry를 바꾸는 것이 아니라 새 entry를 append하는 것이다.

### Merkle tree (RFC 9162 Section 2.1)

- 해시 함수는 SHA-256.
- Leaf hash: `SHA256(0x00 || entry_bytes)`
- 내부 노드 hash: `SHA256(0x01 || left || right)`
- 크기 n인 트리는 k = n보다 작은 가장 큰 2의 거듭제곱 기준으로 `[0, k)`와 `[k, n)`으로 나눈다.
- 빈 트리의 root는 `SHA256("")`.
- inclusion proof와 consistency proof의 생성·검증 알고리즘은 RFC 9162 Section 2.1.3, 2.1.4를 그대로 따른다. 구현에서 다른 방식을 쓰려면 먼저 질문한다.

### Signed Tree Head (STH)

- 서명 대상: canonical JSON `{ treeSize, timestamp, rootHash }`
- 알고리즘: Ed25519. 로그 서버 비밀키는 환경변수 `LOG_SIGNING_KEY`에서만 읽는다. 코드나 로그에 키를 출력하지 않는다.
- STH 서명은 로그의 무결성을, 문서 서명은 책임자의 승인을 증명한다. 두 서명을 혼동하지 않는다.
- append마다 새 STH를 서명해 저장한다.

### Append 직렬화

- leaf index 할당은 반드시 하나의 트랜잭션 안에서 `log_state` 행을 `SELECT ... FOR UPDATE`로 잠근 뒤 수행한다.
- entry 저장, leaf index 증가, 문서·서명 요청 상태 변경, STH 생성은 같은 트랜잭션에서 커밋된다.

### 표기

- 해시, 공개키, 서명은 소문자 hex 문자열로 주고받는다.
- 시간은 UTC ISO 8601 문자열.
- API prefix는 `/api/v1`.

## DB 테이블 (13개)

| 테이블 | 용도 |
|---|---|
| `users` | 사용자 |
| `organizations` | 기관. `external_id`는 이후 Students 단체 ID 매핑용 |
| `memberships` | 사용자-기관-역할 |
| `invitations` | 멤버 초대와 수락·거절 |
| `member_keys` | 멤버 공개키, 용도(`sign`/`encrypt`), fingerprint, 상태 |
| `signature_requests` | issuer가 만든 서명 요청과 처리 결과 |
| `encrypted_files` | 전달 중인 ciphertext의 스토리지 위치, 일회용 공개키, IV, 수신 키 fingerprint, 삭제 시각 |
| `documents` | 문서 메타데이터와 상태 캐시 |
| `revocations` | 폐기 기록 (append-only) |
| `log_entries` | Merkle leaf (append-only) |
| `tree_heads` | STH (append-only) |
| `log_state` | append 직렬화용 잠금 행 |
| `audit_logs` | 기관 내 행동 기록 |

필수 인덱스: `documents(org_id, file_hash)` unique, `documents(file_hash)`, `log_entries(document_id)`, `signature_requests(signer_id, status)`, `member_keys(fingerprint)` unique, `member_keys(user_id, org_id, purpose, status)`, `memberships(user_id, org_id)` unique, `encrypted_files(request_id)` unique.

## 코딩 규칙

- TypeScript `strict`, `any` 사용 금지. 불가피하면 `unknown`과 타입 가드를 쓴다.
- NestJS: 도메인별 모듈(`auth`, `orgs`, `members`, `invitations`, `keys`, `signatures`, `files`, `documents`, `log`, `verify`, `audit`). 입력은 `class-validator` DTO로 검증한다. 에러는 Nest 내장 HTTP 예외를 쓴다.
- 비즈니스 로직은 service에, controller는 입출력 변환만 한다. 권한 검사는 Guard와 역할 데코레이터로 한다.
- 목록 조회에서 연관 데이터는 Prisma `include`/`select`로 한 번에 가져온다. 반복문 안에서 쿼리하지 않는다.
- Next.js: 서버 컴포넌트를 기본으로 하고, 파일 해시 계산, 암복호화, 서명, proof 검증 UI만 클라이언트 컴포넌트로 둔다.
- 변경 요청 후에는 TanStack Query invalidate로 관련 목록과 STH를 갱신한다. `router.refresh()`나 전체 새로고침에 의존하지 않는다.
- 새 외부 의존성을 추가하기 전에 이유와 대안을 제시한다.

## 평가 기준 체크리스트

SPARCS 신입생 프로젝트 평가 기준이다. 기능을 만들 때마다 관련 항목을 확인한다.

### 프론트엔드 필수
- [ ] 모든 페이지에 최소 1개 이상의 기능이 있다.
- [ ] 로그인 여부에 따라 컨텐츠가 달라지는 페이지가 있다. (검증 페이지의 "이 문서 등록하기", 문서 상세의 폐기 버튼, 헤더의 서명 요청함 배지)
- [ ] 컴포넌트를 적절히 나눠 불필요한 리렌더링이 없다.
- [ ] 데스크톱에서 창 크기를 조정해도 레이아웃이 깨지지 않는다.
- [ ] 백엔드 Endpoint 대부분을 프론트엔드에서 사용한다. (`/log/entries` 등 검증자용 API 포함)
- [ ] 백엔드 통신 후 새로고침 없이 상태가 갱신된다.

### 프론트엔드 선택
- [ ] 모바일 반응형 UI
- [ ] 동적 라우팅 또는 쿼리 파라미터 (`/orgs/[slug]`, `/documents/[id]`, `/log?first=&second=`)
- [ ] 비동기 요청의 로딩 UI와 에러 Alert
- [ ] 주요 폼의 입력 Validation

### 백엔드 필수
- [ ] DB 테이블 8개 이상 (현재 설계 13개)
- [ ] API Endpoint 16개 이상 (현재 설계 35개)
- [ ] NestJS + TypeScript를 잘 활용했다.
- [ ] Authentication(JWT)과 Authorization(역할 Guard, 서명키 상태 검사)이 있다.
- [ ] 입력을 받는 모든 Endpoint에서 DTO Validation을 한다. (해시·공개키·서명은 hex 형식과 길이까지 검사)
- [ ] Transaction을 적절히 쓰고, N+1이 없고, 인덱스가 적절하다.

### 백엔드 선택
- [ ] 프론트엔드가 쓰기 쉬운 API 형태
- [ ] AWS나 외부 API 활용 (S3에 ciphertext 저장, 후보: RFC 3161 TSA로 STH 타임스탬프)
- [ ] Race Condition에서도 정합성 유지 (append 직렬화, 중복 발급 unique 제약, 동시 서명 테스트)
- [ ] 확장과 유지보수를 고려한 구조

### 기타 필수
- [ ] SPARCS 서버(`*.newbie.sparcs.net`)에 배포
- [ ] 배포 상태에서 CORS 오류가 없다. 프론트와 API를 같은 도메인의 `/api` 경로로 프록시하는 것을 기본으로 한다.

## 테스트

- `packages/merkle`: 트리 크기 1~64에 대해 root, inclusion proof, consistency proof를 테스트 벡터와 비교한다. 변조된 proof가 거부되는 경우도 반드시 포함한다.
- 서명: 다른 키로 만든 서명, payload 한 필드가 바뀐 서명, 폐기된 키로 만든 서명이 모두 거부되는지 테스트한다.
- 암호화: 다른 수신 키로는 복호화가 실패하는지, ciphertext나 AAD의 한 바이트를 바꾸면 복호화가 실패하는지, 복호화한 평문의 해시가 `fileHash`와 다르면 서명이 막히는지 테스트한다.
- `apps/api`: 서명 요청 → 서명 → inclusion proof 조회 → `packages/merkle`로 검증하는 e2e 시나리오를 유지한다.
- 동시성: 서명 20건을 동시에 보내도 leaf index가 중복·누락 없이 연속인지 테스트한다.
- 새 API를 추가하면 최소한 성공 케이스 하나와 권한 실패 케이스 하나를 테스트한다.

## 커밋

- Conventional Commits (`feat:`, `fix:`, `test:`, `refactor:`, `docs:`, `chore:`)
- 한 커밋에는 한 기능. 스키마 변경과 기능 구현은 커밋을 분리한다.
