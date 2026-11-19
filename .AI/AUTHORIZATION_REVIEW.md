# 권한 점검 — 2026-11-19

범위: 현재 등록된 API 16개 전체. 공통 prefix는 `/api/v1`이다. controller뿐 아니라 Guard, service, Prisma 조회 조건과 트랜잭션을 확인했다. `REVISE.md`와 사용자의 후속 승인에 따라 점검·테스트는 자동 진행한다.

| Endpoint | 필요한 권한 | 현재 검사 | 문제 여부 |
|---|---|---|---|
| POST /auth/register | 공개 가입 | JSON Guard, IP당 5회/분, RegisterDto whitelist, 이메일 unique, 허용 필드만 저장 | 이메일 소유 미검증은 잔여 위험. 역할·인증 여부 입력으로 권한 부여 불가 |
| POST /auth/login | 계정 비밀번호 | JSON Guard, IP당 10회/분, LoginDto, Argon2 검증 후 사용자 id·버전으로 15분 JWT 발급 | 객체 접근 우회 미발견 |
| POST /auth/logout | 로그인 본인 | JWT·DB 버전 검증 후 token_version 원자 증가·쿠키 삭제 | 해당 사용자의 모든 기존 JWT 거부. 진행 중 요청을 소급 취소하지는 않음 |
| GET /auth/me | 로그인 본인 | 검증한 JWT sub로 DB 사용자 조회, 공개 필드 select | 다른 사용자 id 지정 경로 없음 |
| POST /orgs | 로그인 사용자 | JWT의 사용자 id로 기관과 owner 멤버십 원자적 생성 | 입력으로 다른 생성자 지정 불가. SSO 전 비밀번호 계정의 기관 생성은 허용 |
| GET /orgs | 로그인 본인의 기관 | memberships.some.userId = 현재 사용자 | 다른 기관 목록 노출 미발견 |
| GET /orgs/:slug | 해당 기관 멤버 | RolesGuard가 slug와 현재 사용자 멤버십 확인 | 다른 기관 owner 포함 비멤버 차단 |
| PATCH /orgs/:slug | 해당 기관 owner | RolesGuard + 기관 잠금 후 owner 재검증 | 강등 후 쓰기 경쟁 회귀 테스트 유지 |
| GET /orgs/:slug/members | 해당 기관 멤버 | RolesGuard + orgId 조건 조회, 공개 사용자 필드만 select | 기관 밖 멤버·비밀번호 해시 노출 미발견 |
| PATCH /orgs/:slug/members/:userId | 해당 기관 owner, 대상은 같은 기관 멤버 | 잠금 후 owner 재검증, 복합키 userId_orgId 조회, 마지막 owner·키·요청 보호 | 감사 로그 누락 보완. 다른 기관 userId는 404 |
| DELETE /orgs/:slug/members/:userId | 해당 기관 owner, 대상은 같은 기관 멤버 | 위와 같은 잠금·범위·마지막 owner 검사 | 다른 기관 userId는 404, 멤버십 미변경 |
| POST /orgs/:slug/invitations | 해당 기관 owner | Guard + 잠금 후 owner 재검증, DTO의 signer/issuer 제한 | owner 초대 허용 문제 수정(400) |
| GET /me/invitations | 로그인한 계정의 대상 초대 | DB에서 읽은 현재 계정 이메일 + pending + 미만료, 해시·토큰 제외 | 이메일 선점자는 초대 메타데이터를 볼 수 있음. 토큰 없이 응답 불가 |
| POST /invitations/:id/accept | 대상 이메일 계정 + 비밀 토큰 | JWT, DTO, 이메일, 잠금 후 상태·만료·해시 상수 시간 비교, 기존 멤버 검사 | 과거 owner 초대의 유효 토큰 수락도 403으로 차단 |
| POST /invitations/:id/decline | 대상 이메일 계정 + 비밀 토큰 | 수락과 같은 신원·토큰 검사, 처리 후 토큰 해시 제거 | 다른 계정·잘못된 토큰 차단. 과거 owner 초대 거절은 허용 |
| DELETE /orgs/:slug/invitations/:id | 해당 기관 owner | Guard + 잠금 후 owner 재검증, id와 orgId 함께 조회 | 다른 기관 owner의 초대 id 교체 공격 차단(404), 응답과 직렬화 |

공통: 변경 요청은 JSON이며 cross-site 요청을 거부한다. 입력 DTO는 whitelist와 forbidNonWhitelisted를 사용한다. 권한 판단에는 클라이언트가 보낸 userId/role을 현재 행위자로 사용하지 않는다. userId 경로 값은 변경 대상일 뿐이다.

## 이번 보완과 회귀 검증

owner 제한 검증 138개에 인증 보강을 더해 API e2e 150개와 API TypeScript 검사가 통과했다. 초대 수락·거절은 각각 IP당 20회/분이며 세션 Guard는 JWT 버전을 DB와 비교한다.

- 초대 역할 DTO와 UI에서 owner를 제거한다. 예전 owner 초대는 유효한 토큰이 있어도 수락할 수 없다. 거절·owner 취소로 정리할 수 있다.
- 역할 변경과 `MEMBER_ROLE_CHANGED` 감사 로그는 같은 트랜잭션이다. metadata는 previousRole과 role이며 대상은 orgId + targetId(userId)로 식별한다. 실패 또는 같은 역할 지정에는 기록이 남지 않는다.
- 성공적인 기존 멤버 owner 승격, 비owner의 승격 거부, 변경 실패 시 감사 로그 롤백, 다른 기관 대상 변경·제거 거부를 e2e로 검증한다. 기존 마지막 owner·동시 강등·기관 수정 경쟁 테스트를 유지한다.
- 토큰 누락·변조·만료·재사용, 이메일 불일치, 초대 취소 권한과 동시 수락·취소 검증은 첫 묶음의 회귀 테스트를 유지한다.

## 세션 C·D에서 구현 후 확인할 항목

다음 API는 아직 없으므로 통과 처리하지 않는다.

- 키 승인·폐기: 같은 기관 owner, 기관 id와 key id 결합, 잠금 후 역할 재검증. 승인 화면의 가입·초대 생성·수락 시각과 직접 본인 확인.
- 서명·거절: 요청의 지정 signer, requester와 signer 분리, active 키·기관 멤버십 재검증.
- 암호문 다운로드: 요청의 지정 signer만 허용, 다른 요청·기관의 파일 id 차단.
- 문서 폐기: 같은 기관 signer, 유효 키·원 발급 entry 검증.
- 로그·검증 API: 공개 조회 계약에 맞춘 필드만 노출하고 비밀키·평문·ciphertext 접근 권한과 분리.

## 남은 위험

- 추가 리뷰의 요청 제한과 서버 측 세션 무효화를 구현했다. JWT는 15분이며 로그아웃에서 token_version을 증가시킨다. 탈취 토큰은 무효화 또는 만료 전까지 사용 가능하며 SSO 로그인만으로 해결되지 않는다. 비밀번호 변경 API는 아직 없다.
- 요청 제한은 단일 API 프로세스 메모리이며 재시작·다중 인스턴스·분산 IP 공격을 포괄하지 않는다. 현재 프록시 헤더를 신뢰하지 않아 Next rewrite 경유 요청은 IP 한도를 공유할 수 있다. 배포 전 신뢰할 프록시 구성과 필요 시 공유 카운터를 확정한다.
- 사용자는 SSO 전 초대 메타데이터 노출 위험을 수용했다. 발표에서는 이 한계와 토큰에 의한 수락 보호를 구분하고, SSO 후 검증된 이메일만 목록 조회·수락에 사용하며 기존 미검증 세션도 차단할 계획임을 설명한다. 제공자의 이메일 검증 보장과 실제 접근 차단 검증이 끝나야 해결로 표시한다.
- 토큰은 전달 경로를 통제할 뿐 실명·이메일 소유를 증명하지 않는다. 잘못 전달되거나 유출된 토큰과 선점 계정이 결합하면 signer/issuer 권한이 부여될 수 있다. SSO 신원 바인딩은 별도 구현이 필요하다.
- 이메일 선점자는 아직 가입·로그인을 할 수 있고 해당 이메일의 초대 메타데이터를 조회할 수 있다. 이 점을 전체 신원 문제 해결로 보고하지 않는다.
- owner는 기존 멤버를 승격할 수 있으므로 승격 전 본인 확인이 필요하다. 키 승인 확인 단계는 세션 C에 포함한다.
- 테스트는 로컬 tlog_test 대상이다. 배포 프록시·TLS·CORS·운영 권한 구성 검증은 아직 수행하지 않았다.
