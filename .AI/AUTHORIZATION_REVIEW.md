# 권한 점검 — 2026-11-19

범위: 현재 등록된 API 19개 전체. 공통 prefix는 `/api/v1`이다. controller뿐 아니라 Guard, service, Prisma 조회 조건과 트랜잭션을 확인했다. `REVISE.md`와 사용자의 후속 승인에 따라 점검·테스트는 자동 진행한다.

| Endpoint | 필요한 권한 | 현재 검사 | 문제 여부 |
|---|---|---|---|
| POST /auth/register | 공개 가입 | JSON Guard, IP당 5회/분, RegisterDto whitelist, 이메일 unique, 미인증 가입 후 인증 메일 | 역할·인증 여부 입력으로 권한 부여 불가 |
| POST /auth/login | 계정 비밀번호 | JSON Guard, IP당 10회/분, LoginDto, Argon2 검증 후 사용자 id·버전으로 15분 JWT 발급 | 객체 접근 우회 미발견 |
| POST /auth/logout | 로그인 본인 | JWT·DB 버전 검증 후 token_version 원자 증가·쿠키 삭제 | 해당 사용자의 모든 기존 JWT 거부. 진행 중 요청을 소급 취소하지는 않음 |
| GET /auth/me | 로그인 본인 | 검증한 JWT sub로 DB 사용자 조회, 공개 필드 select | 다른 사용자 id 지정 경로 없음 |
| POST /orgs | 이메일 인증된 사용자 | JWT + VerifiedEmailGuard + 트랜잭션에서 인증 재확인, 기관과 owner 멤버십 생성 | 미인증 기존 계정도 기관 생성 불가 |
| GET /orgs | 로그인 본인의 기관 | memberships.some.userId = 현재 사용자 | 다른 기관 목록 노출 미발견 |
| GET /orgs/:slug | 해당 기관 멤버 | RolesGuard가 slug와 현재 사용자 멤버십 확인 | 다른 기관 owner 포함 비멤버 차단 |
| PATCH /orgs/:slug | 해당 기관 owner | RolesGuard + 기관 잠금 후 owner 재검증 | 강등 후 쓰기 경쟁 회귀 테스트 유지 |
| GET /orgs/:slug/members | 해당 기관 멤버 | RolesGuard + orgId 조건 조회, 공개 사용자 필드만 select | 기관 밖 멤버·비밀번호 해시 노출 미발견 |
| PATCH /orgs/:slug/members/:userId | 해당 기관 owner, 대상은 같은 기관 멤버 | 잠금 후 owner 재검증, 복합키 userId_orgId 조회, 마지막 owner·키·요청 보호 | 감사 로그 누락 보완. 다른 기관 userId는 404 |
| DELETE /orgs/:slug/members/:userId | 해당 기관 owner, 대상은 같은 기관 멤버 | 위와 같은 잠금·범위·마지막 owner 검사 | 다른 기관 userId는 404, 멤버십 미변경 |
| POST /orgs/:slug/invitations | 해당 기관 owner | Guard + 잠금 후 owner 재검증, DTO의 signer/issuer 제한 | owner 초대 허용 문제 수정(400) |
| GET /me/invitations | 이메일 인증된 계정의 대상 초대 | VerifiedEmailGuard + DB 이메일 + pending + 미만료, 해시·토큰 제외 | 미인증 선점 계정은 메타데이터 조회도 403 |
| POST /invitations/:id/accept | 대상 이메일 계정 + 비밀 토큰 | JWT, DTO, 이메일, 잠금 후 상태·만료·해시 상수 시간 비교, 기존 멤버 검사 | 과거 owner 초대의 유효 토큰 수락도 403으로 차단 |
| POST /invitations/:id/decline | 대상 이메일 계정 + 비밀 토큰 | 수락과 같은 신원·토큰 검사, 처리 후 토큰 해시 제거 | 다른 계정·잘못된 토큰 차단. 과거 owner 초대 거절은 허용 |
| DELETE /orgs/:slug/invitations/:id | 해당 기관 owner | Guard + 잠금 후 owner 재검증, id와 orgId 함께 조회 | 다른 기관 owner의 초대 id 교체 공격 차단(404), 응답과 직렬화 |
| POST /auth/email/request | 공개, 이메일 소유는 아직 미확인 | DTO, IP당 3회/분, 사용자·용도별 1분 재발송 간격, 일반화된 202 | 메일로만 전달, 응답·로그에 토큰 없음. 계정 존재 여부에 따른 처리 시간까지 동일하지는 않음 |
| POST /auth/email/confirm | 유효한 용도별 메일 토큰 | DTO, IP당 10회/분, 15분 만료, 사용자 잠금 후 재확인·일회 소비 | 비밀번호 교체·인증·버전 증가·모든 토큰 삭제 원자적 처리. 과거 미인증 멤버십/미폐기 키는 자동 복구 거부 |
| POST /auth/password | 로그인 + 현재 비밀번호 | JWT, DTO, IP당 5회/분, 비밀번호·버전 조건부 갱신 | 비밀번호 변경과 세션/복구 토큰 무효화 원자적 처리 |

공통: 변경 요청은 JSON이며 cross-site 요청을 거부한다. 입력 DTO는 whitelist와 forbidNonWhitelisted를 사용한다. 권한 판단에는 클라이언트가 보낸 userId/role을 현재 행위자로 사용하지 않는다. userId 경로 값은 변경 대상일 뿐이다.

이메일 인증 적용: 기관·초대 controller와 RolesGuard는 미인증 계정을 차단한다. 기관 생성, 기관 잠금 후 owner 쓰기, 초대 응답, 역할 변경 대상에서도 DB 인증 여부를 재확인한다. 로그인·me·로그아웃·메일 요청·비밀번호 설정은 미인증 계정에서도 가능하다.

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

- JWT는 15분이며 로그아웃·비밀번호 변경·메일 인증/복구에서 token_version을 증가시킨다. 탈취 토큰은 무효화 또는 만료 전까지 사용 가능하며 SSO 로그인만으로 해결되지 않는다.
- 요청 제한은 단일 API 프로세스 메모리이며 재시작·다중 인스턴스·분산 IP 공격을 포괄하지 않는다. 현재 프록시 헤더를 신뢰하지 않아 Next rewrite 경유 요청은 IP 한도를 공유할 수 있다. 배포 전 신뢰할 프록시 구성과 필요 시 공유 카운터를 확정한다.
- 미인증 이메일 선점자는 가입·로그인할 수 있지만 기관·초대 접근은 차단된다. 메일 소유자는 새 비밀번호 설정으로 기존 세션을 폐기한다. 이메일 소유는 실명·소속의 증명이 아니며 메일 계정 자체가 탈취되면 보호할 수 없다.
- 기존 데이터는 사용자 확인상 테스트용이다. 데이터는 삭제하지 않으며 기존 미인증 멤버십이나 pending/active 키가 있으면 자동 복구하지 않는다. 키 복구·재등록 정책과 구현은 세션 C에서 이어간다. 새로운 인증 계정으로 개발 시나리오를 진행한다.
- 실제 외부 SMTP 전달·스팸함·운영 인증서는 운영 설정 후 확인해야 한다. 발송 실패는 토큰을 삭제하고 식별 정보 없는 오류를 기록하며, 공개 요청 응답은 계정 존재 여부와 무관하게 202다.
- SPARCS SSO는 발표 이후 승인·이용 가능 여부 확인이 필요한 장기 검토 사항이다.
- owner는 기존 멤버를 승격할 수 있으므로 승격 전 본인 확인이 필요하다. 키 승인 확인 단계는 세션 C에 포함한다.
- 테스트는 로컬 tlog_test 대상이다. 배포 프록시·TLS·CORS·운영 권한 구성 검증은 아직 수행하지 않았다.
