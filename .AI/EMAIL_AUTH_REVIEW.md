# 이메일 인증·복구 통합 검토

사용자 요청으로 남은 API와 UI 단계를 한 번에 구현했고 Accept를 받았다. 대화 종료 시 현재 구현을 스키마/API/웹으로 나눠 커밋한다. 후속 리뷰의 프로필 재입력·가입 202·프록시 IP·세션 수명/입력 보존은 아직 구현하지 않았으며 PLAN.md의 다음 작업 1~4에 기록했다. 기존 테스트 데이터는 삭제하거나 인증 완료로 바꾸지 않았다.

## 읽는 순서

1. `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20261119020000_add_email_verification/migration.sql`
   - 기존 사용자의 인증 시각은 null. 사용자·용도별 토큰 하나, 원문 대신 unique SHA-256 해시와 만료 시각만 저장한다.
2. `apps/api/src/auth/email-token.service.ts`
   - 핵심 로직. 사용자 행 잠금 → 계정별 발급 간격 → 해시 저장 → 트랜잭션 밖 메일 전송 순서다.
   - 소비는 비밀번호 해싱 후 사용자 잠금 안에서 토큰 용도·만료를 다시 확인한다. 새 비밀번호·인증 시각·token_version 증가·전체 토큰 삭제가 한 트랜잭션이다.
   - 미인증 기존 멤버십이나 pending/active 키가 있으면 409. 비밀번호 변경은 현재 비밀번호와 버전을 조건으로 갱신한다.
3. `apps/api/src/auth/dto/email-token.dto.ts`, `auth.controller.ts`, `auth.service.ts`, `session.service.ts`, `auth.module.ts`
   - 새 endpoint 3개와 DTO, 요청 제한, 가입 후 메일, 공개 사용자 응답의 emailVerifiedAt, DI 연결.
   - 메일 요청 3회/분, 소비 10회/분, 비밀번호 변경 5회/분. 기존 가입 5회/분·로그인 10회/분 유지.
4. `apps/api/src/auth/mail.service.ts`, `apps/api/.env.example`, `apps/api/package.json`, `pnpm-lock.yaml`
   - SMTP와 외부 전달 경계. 메일 링크 origin은 서버 설정만 사용한다. 운영 HTTPS·TLS 요구, 전송 로그 비활성, 파일/URL 읽기 비활성.
   - Nodemailer 10.3.1, 타입 8.0.2 고정. lockfile은 pnpm 생성 결과다. 실제 SMTP 설정·비밀값은 사용자가 주입해야 한다.
5. `apps/api/src/auth/verified-email.guard.ts`, `apps/api/src/orgs/{orgs.controller,orgs.service,roles.guard}.ts`, `apps/api/src/members/{organization-lock,members.service}.ts`, `apps/api/src/invitations/{invitations.controller,invitations.service}.ts`
   - 화면과 별도로 API에서 미인증 계정 차단. 기관 생성·owner 쓰기·초대 응답은 트랜잭션에서도 확인하며 역할 변경 대상도 인증 여부를 확인한다.
6. `apps/web/src/components/auth/email-auth-form.tsx`, `apps/web/src/api/auth.ts`
   - 인증 메일 요청·복구·새 비밀번호·현재 비밀번호 변경을 연결하는 폼. token은 fragment에서만 읽고 POST 본문으로 전송한다. 자동 소비하지 않는다.
   - 성공 시 세션/기관 캐시 정리, 완료 알림. 같은 페이지에서 다른 메일 링크를 열면 폼을 초기화한다.
7. `apps/web/src/components/auth/{auth-form,require-session}.tsx`, `apps/web/src/components/dashboard/invitation-page.tsx`, `apps/web/src/components/site-header.tsx`, `apps/web/src/lib/i18n/ko.ts`
   - 가입 뒤 인증 안내, 미인증 대시보드/초대 화면, 비밀번호 복구·변경 진입점, 한국어 문구.
   - 새 페이지: `apps/web/src/app/verify-email/page.tsx`, `recover/page.tsx`, `auth/confirm/page.tsx`, `settings/password/page.tsx`.
8. `apps/api/test/email-auth.e2e-spec.ts`, `apps/api/test/rate-limit.e2e-spec.ts`
   - 신규 흐름과 실제 요청 제한. 기존 auth/session 테스트는 응답 필드와 메일 대체 객체를 추가했다. orgs/members 테스트 fixture는 기존 권한 검증을 유지하도록 명시적으로 인증된 계정으로 만든다.
   - 선점자 회귀 테스트는 미인증 차단이 먼저 적용되어 400 대신 403을 기대한다. 올바른 초대 토큰을 가진 경우와 메타데이터 조회도 403임을 추가 검증했다.

## 확인한 경계와 결과

- API e2e 164개/8 suites 통과. 토큰 원문 비노출, 만료 경계, 재사용, 용도 혼동, 재발급, 동시 소비 한 번, 선점 비밀번호 교체, 기존 JWT 거부, 기존 owner 차단, 역할 변경 대상 검증, 키 보유 계정 복구 차단, 전송 실패 후 토큰 제거.
- API 타입·전체 lint·웹 프로덕션 빌드 통과. 종료 전 추가 요청으로 비밀번호 단위 테스트를 실행했고 4개 통과·1개 실패했다. 기존 fixture가 공백 없는 문자열인데 trim 후 false를 기대하는 모순이며 PLAN.md에 원인을 기록했다. 해당 테스트와 구현은 수정하지 않았다.
- 실제 로컬 SMTP + Chrome: 가입→인증→로그인→초대 수락, 복구·비밀번호 변경 후 기존 JWT 거부, 링크 만료/재사용, 429 안내. 320/768/1440px 가로 넘침 없음, 브라우저 예외 없음, 토큰이 HTTP 요청 URL에 나타나지 않음. 테스트 데이터·서버·프로필 정리 완료.
- 평가 항목: DTO, 인증/권한, 트랜잭션·동시성, API 연결 폼, 로딩/오류, 새로고침 없는 갱신, 반응형을 확인했다.

## 한계와 다음 작업

- 실제 외부 SMTP·전달률·운영 TLS/프록시/CORS는 아직 검증하지 않았다. `.env.example`의 SMTP 설정을 채워야 운영 메일이 발송된다.
- 메일 요청 응답은 항상 202이며 발송 실패는 안전한 서버 오류로 기록한다. 계정 유무에 따른 실행 시간은 같지 않다. 가입 API의 기존 중복 이메일 409 정책도 유지한다.
- 요청 제한은 단일 프로세스 메모리이며 Next 프록시를 통과한 사용자끼리 IP 한도를 공유할 수 있다. 배포 전 프록시/공유 저장소 정책 확정 필요.
- 이메일 소유 확인은 실명·소속 증명이 아니다. 미인증 기존 멤버십/미폐기 키의 자동 복구는 지원하지 않는다. 새 인증 계정으로 개발하며 키 재등록·복구와 복구/키 승인 경쟁은 세션 C에서 처리한다.
- 이번 통합 검토 후 세션 C의 로그·STH → 멤버 키 API → 브라우저 키 UI, 이후 세션 D. SPARCS SSO는 발표 이후 별도 승인 사항이다. 배포·Push하지 않았다.
