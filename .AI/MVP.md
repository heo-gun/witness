# MVP 범위 (Lovable 프로토타입)

## 목표

실제 백엔드 없이, 데모 시나리오 전체를 클릭해볼 수 있는 프론트엔드 프로토타입을 만든다. 이 프로토타입의 화면 구조와 API 계약을 기준으로 이후 Next.js + NestJS로 옮긴다.

서비스 한 줄 정의: 학생단체의 예결산·의결 문서를 책임자(회장, 의장, 회의 진행자)가 직접 전자서명하고, 그 기록을 append-only 로그에 남겨, 누구나 파일을 올려 누가 언제 승인했는지와 이후 바뀌지 않았음을 브라우저에서 검증할 수 있는 서비스.

## 기술 제약

- React + Vite + TypeScript + Tailwind + shadcn/ui
- Supabase를 비롯한 외부 백엔드는 연결하지 않는다.
- 모든 데이터 접근은 `src/api/` 모듈의 함수로만 한다. 함수 이름과 입출력은 아래 "API 계약"과 1:1로 대응시킨다. 이후 이 모듈만 실제 fetch 호출로 교체한다.
- 서버 상태는 TanStack Query로 관리하고, 변경 후에는 관련 쿼리를 invalidate해서 새로고침 없이 갱신한다.
- mock 데이터는 메모리와 localStorage에 저장하고, 각 호출에 300~600ms 지연을 넣는다.
- 파일 해시는 mock이 아니라 브라우저 WebCrypto(`crypto.subtle.digest("SHA-256")`)로 실제 계산한다. 파일 평문은 업로드하지 않는다. issuer에서 signer로 가는 파일은 암호화된 상태로만 mock 스토리지(IndexedDB)에 저장한다.
- 암호 관련 코드는 `src/lib/crypto/`에 모은다.
  - `keys.ts`: `generateMemberKeys` (서명용·암호화용 키 쌍 생성)
  - `transfer.ts`: `encryptFileFor(file, recipientPublicKey, aad)`, `decryptFile(encrypted, aad)`
  - `sign.ts`: `signPayload`
  - `verify.ts`: `verifyDocumentSignature`, `verifyInclusion`, `verifyConsistency`, `verifySthSignature`
  - 지금은 mock 구현으로 두고(암호화는 그대로 통과시키되 형식만 맞춤), 이후 직접 구현한 코드로 교체한다.
- 페이지는 라우트 단위로 나누고, 라우트 파일에는 데이터 로딩과 레이아웃만 둔다. 이후 Next.js App Router로 옮기기 쉽게 하기 위해서다.

## 역할

| 역할 | 실무 예시 | 할 수 있는 일 |
|---|---|---|
| owner | 기관 관리자 | 기관 수정, 멤버 초대·제거·역할 변경, 서명키 승인·폐기 |
| signer | 회장, 의장, 회의 진행자 | 서명 요청 승인(서명)·거절, 문서 폐기 서명 |
| issuer | 회계 담당, 서기 | 문서 등록과 서명 요청 |
| 비로그인 | 누구나 | 검증, 로그 조회 |

권한이 없는 버튼은 숨기지 말고 비활성화하고, 이유를 툴팁으로 보여준다.

## 화면

| 경로 | 화면 | 접근 |
|---|---|---|
| `/` | 공개 검증 페이지: 파일 드롭존, 검증 결과 카드 | 누구나 |
| `/login`, `/register` | 로그인, 회원가입 | 누구나 |
| `/dashboard` | 내 기관 목록, 받은 초대, 기관 생성 | 로그인 |
| `/inbox` | 서명 요청함: 나에게 온 요청 목록과 처리 | signer |
| `/inbox/:requestId` | 서명 화면 | signer |
| `/orgs/:slug` | 기관 상세: 문서 탭, 멤버 탭, 키 탭, 설정 탭 | 로그인 |
| `/orgs/:slug/new` | 문서 등록, 암호화 전송, 서명 요청 생성 | issuer |
| `/settings/keys` | 내 키(서명용·암호화용) 생성과 상태 확인 | signer |
| `/documents/:id` | 문서 상세: 서명 정보, leaf index, entry 원문, proof, 폐기 | 누구나 (폐기는 signer) |
| `/log` | 로그 탐색기: 최신 STH, STH 이력, entry 목록, 두 STH 간 consistency 검증 | 누구나 |

### 서명 화면 (`/inbox/:requestId`)

서비스에서 가장 중요한 화면이다. 서명이 가볍게 눌리는 버튼처럼 보이지 않고, 책임을 지는 행위로 느껴져야 한다.

1. 요청 정보: 제목, 카테고리, 요청자, 요청 시각
2. 문서 열람: 화면에 들어오면 ciphertext를 받아 브라우저에서 복호화하고 미리보기(PDF, 이미지)로 보여준다. 복호화 진행 상태를 짧게 표시한다.
3. 무결성 배지: 복호화한 파일의 해시를 브라우저가 직접 계산해 요청의 해시와 비교한다. 일치하면 초록 "전달 중 변경 없음", 불일치하면 빨간 경고와 함께 서명을 막는다.
4. 책임 확인: 미리보기를 연 뒤에만 활성화되는 "문서 내용을 확인했으며 이 승인에 책임을 집니다" 체크박스
5. 서명 버튼: 내 이름, 역할, 서명키 fingerprint를 함께 보여준다.
6. 거절 버튼: 사유 입력 필수

내 암호화 키가 바뀌어 복호화할 수 없는 요청은 "재전송 필요" 상태로 보여주고, issuer에게 재전송을 요청하는 버튼을 둔다.

서명이 끝나면 서명 카드(서명자 이름, 역할, 시각, fingerprint, leaf index)를 보여준다.

### 문서 등록 화면 (`/orgs/:slug/new`)

파일 드롭 → 제목·카테고리 입력 → signer 선택 → 전송. 전송 버튼을 누르면 "해시 계산 → signer 키로 암호화 → 업로드" 3단계 진행 표시를 보여준다. `encrypt` 키가 활성화되지 않은 signer는 선택할 수 없고, 이유를 툴팁으로 보여준다. 파일은 20MB까지.

### 검증 결과 카드 상태

1. **유효**: 서명자 이름과 역할, 서명 시각, 기관, 제목, 카테고리, leaf index, 검증 단계 체크리스트
2. **폐기됨**: 위 정보 + 폐기 서명자, 시각, 사유
3. **미등록**: 해시 값과 "등록되지 않은 문서" 안내. 서명 대기 중인 문서도 미등록으로 표시한다.
4. **검증 실패**: 서명이나 proof가 맞지 않음. 서버가 잘못된 응답을 준 경우를 보여주는 상태

카드의 중심은 "누가 승인했는가"다. 서명자 이름과 역할을 가장 크게 보여준다.

검증 단계 체크리스트는 "파일 해시 계산 → 로그 entry 조회 → 책임자 서명 검증 → inclusion proof 검증 → STH 서명 검증" 5단계를 순서대로 애니메이션으로 보여준다.

## 데모 시나리오 (완료 기준)

1. 회원가입 후 기관(예: "OO과 학생회")을 생성한다.
2. 다른 사용자 두 명을 초대한다. 한 명은 issuer(회계 담당), 한 명은 signer(회장)로 지정하고, 각자 로그인해 초대를 수락한다.
3. signer가 `/settings/keys`에서 키를 생성하고, owner가 승인한다.
4. issuer가 결산서 PDF를 드롭하고 signer를 지정해 보낸다. 파일은 signer 키로 암호화되어 전송된다.
5. signer의 헤더에 요청함 배지가 뜬다. 서명 화면에서 문서가 바로 미리보기로 열리고 "전달 중 변경 없음" 배지가 뜬다. 책임 확인 후 서명한다.
6. 로그아웃 상태에서 `/`에 같은 파일을 드롭하면 "OO 회장 OOO이 서명함" 유효 카드가 뜬다.
7. 파일을 수정해 드롭하면 "미등록" 카드가 뜬다.
8. signer가 문서를 폐기 서명하면, 다시 검증할 때 "폐기됨" 카드가 뜬다.
9. `/log`에서 과거 STH와 현재 STH를 골라 consistency 검증 결과를 본다.

mock 초기 데이터로 기관 2개, 사용자 4명(owner, signer 2, issuer), 서명된 문서 8개(그중 1개 폐기), 대기 중인 서명 요청 2개를 넣어둔다.

## API 계약 (mock이 따를 형태, 35개)

prefix는 `/api/v1`. mock 함수 이름은 괄호 안의 이름을 쓴다.

- Auth (4): `POST /auth/register` (register), `POST /auth/login` (login), `POST /auth/logout` (logout), `GET /auth/me` (getMe)
- Orgs (4): `POST /orgs` (createOrg), `GET /orgs` (listOrgs), `GET /orgs/:slug` (getOrg), `PATCH /orgs/:slug` (updateOrg)
- Members (3): `GET /orgs/:slug/members` (listMembers), `PATCH /orgs/:slug/members/:userId` (changeRole), `DELETE /orgs/:slug/members/:userId` (removeMember)
- Invitations (4): `POST /orgs/:slug/invitations` (inviteMember), `GET /me/invitations` (listMyInvitations), `POST /invitations/:id/accept` (acceptInvitation), `POST /invitations/:id/decline` (declineInvitation)
- Keys (5): `POST /orgs/:slug/keys` (registerKey), `GET /orgs/:slug/keys` (listKeys), `GET /orgs/:slug/members/:userId/keys` (getMemberActiveKeys), `POST /keys/:id/approve` (approveKey), `POST /keys/:id/revoke` (revokeKey)
- Signature requests (6): `POST /orgs/:slug/signature-requests` (createSignatureRequest), `PUT /signature-requests/:id/file` (uploadEncryptedFile), `GET /signature-requests/:id/file` (downloadEncryptedFile), `GET /me/signature-requests` (listMySignatureRequests), `POST /signature-requests/:id/sign` (signRequest), `POST /signature-requests/:id/reject` (rejectRequest)
- Documents (3): `GET /orgs/:slug/documents` (listDocuments), `GET /documents/:id` (getDocument), `POST /documents/:id/revoke` (revokeDocument)
- Verify (2): `GET /verify?hash=` (verifyByHash), `GET /log/proof/inclusion?leafIndex=&treeSize=` (getInclusionProof)
- Log (4): `GET /log/sth` (getLatestSth), `GET /log/sth/history` (listSthHistory), `GET /log/proof/consistency?first=&second=` (getConsistencyProof), `GET /log/entries?start=&end=` (listEntries)

같은 기관이 같은 파일 해시로 서명 요청을 중복 생성하면 409 형태의 에러를 반환하고, UI는 기존 문서나 요청으로 가는 링크를 보여준다.

## 데이터 타입

```ts
type Role = "owner" | "signer" | "issuer";
type Category = "budget" | "settlement" | "receipt" | "agenda" | "other";
type DocumentStatus = "pending" | "valid" | "rejected" | "revoked";
type KeyStatus = "pending" | "active" | "revoked";
type KeyPurpose = "sign" | "encrypt";

interface User { id: string; email: string; name: string; createdAt: string }
interface Organization { id: string; name: string; slug: string; description: string; externalId: string | null; createdAt: string }
interface Membership { userId: string; orgId: string; role: Role; createdAt: string }
interface Invitation { id: string; orgId: string; email: string; role: Role; invitedBy: string; status: "pending" | "accepted" | "declined"; createdAt: string }
interface MemberKey { id: string; userId: string; orgId: string; purpose: KeyPurpose; publicKey: string; fingerprint: string; status: KeyStatus; createdAt: string; approvedAt: string | null; revokedAt: string | null }
interface SignatureRequest {
  id: string; orgId: string; documentId: string; requesterId: string; signerId: string;
  status: "awaiting_upload" | "pending" | "needs_resend" | "signed" | "rejected";
  rejectReason: string | null; createdAt: string; decidedAt: string | null;
}
interface EncryptedFile {
  requestId: string; ciphertext: string; ephemeralPublicKey: string; iv: string;
  recipientKeyFingerprint: string; size: number; createdAt: string;
}
interface Document {
  id: string; orgId: string; issuerId: string; title: string; category: Category;
  fileHash: string; status: DocumentStatus; leafIndex: number | null;
  signerId: string | null; signerKeyFingerprint: string | null; signature: string | null; signedAt: string | null;
  revokeReason: string | null; revokedAt: string | null; createdAt: string;
}
interface LogEntry { leafIndex: number; type: "ISSUE" | "REVOKE" | "KEY_REGISTER" | "KEY_REVOKE"; entryJson: string; leafHash: string; documentId: string | null }
interface SignedTreeHead { treeSize: number; timestamp: string; rootHash: string; signature: string }
interface InclusionProof { leafIndex: number; treeSize: number; auditPath: string[] }
interface ConsistencyProof { first: number; second: number; proof: string[] }
```

해시, 공개키, 서명은 소문자 hex 문자열, 시간은 UTC ISO 8601 문자열로 표시한다. 긴 hex는 앞 8자와 뒤 8자만 보여주고 클릭하면 전체 복사된다.

## 디자인 방향

- 텍스트는 최소로. 카드마다 설명문을 붙이지 않는다. 필요한 안내는 툴팁이나 한 줄 보조 문구로만 둔다.
- 큰 타이포와 넉넉한 여백. 검증 결과와 서명자 이름은 화면에서 가장 큰 요소다.
- 무채색 베이스에 짙은 남색 포인트. 보라·파랑 그라디언트는 쓰지 않는다.
- 상태 색이 의미를 가진다: 유효 초록, 폐기됨 주황, 대기 노랑, 미등록 회색, 검증 실패 빨강.
- 해시, leaf index, 서명, fingerprint 같은 기술 값은 monospace로 표시한다.
- 언어: 브랜드명, 헤드라인, 기술 라벨(Leaf index, STH, Fingerprint 등)은 영어. 버튼, 안내문, 카테고리, 역할명은 한국어. 문자열은 처음부터 i18n 키로 분리한다.
- 데스크톱 창 크기 조정과 모바일 폭 모두에서 레이아웃이 깨지지 않아야 한다.
- 모든 비동기 동작에 로딩 상태와 에러 토스트를 둔다. 폼은 입력 Validation을 한다.

## 제외 (이후 실제 구현에서)

- 실제 Merkle tree, proof 생성·검증, Ed25519 서명과 키 보관 (직접 구현할 코드로 교체)
- 실제 백엔드, DB, 인증
- SPARCS SSO, Students 연동과 API Key
- 공동 서명(여러 책임자의 다중 서명), 일괄 서명 요청, 감사 리포트, 독립 Monitor
- 발신자 인증(HPKE Auth mode), 여러 수신자에게 동시 전달
- 서명 이후의 문서 보관 (ciphertext는 서명·거절 후 삭제)

## 알려진 한계 (검증 페이지 하단에 안내)

- 서명은 "이 사람이 이 파일을 승인했다"를 증명할 뿐, 문서 내용이 사실임을 증명하지 않는다.
- 이 서비스의 전자서명은 전자서명법상 공인된 인증서 기반 서명이 아니다.
- 키는 브라우저에 보관되므로, 기기를 바꾸면 키를 새로 등록해야 하고 대기 중인 요청은 재전송이 필요하다.
- 파일 전달 암호화는 발신자를 암호학적으로 인증하지 않는다. signer는 자신이 열람하고 해시를 확인한 내용에 서명한다.
- 로그 서버가 사용자마다 다른 트리를 보여주는 공격은 독립 Monitor가 있어야 막을 수 있다.
