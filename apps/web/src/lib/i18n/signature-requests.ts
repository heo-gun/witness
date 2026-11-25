import type { Category } from "@tlog/shared";
import type { RequestStatus } from "@/api/signatures";

export const requestText = {
  create: "서명 요청 만들기",
  creating: "요청 생성 중…",
  back: "기관으로 돌아가기",
  issuerOnly: "발급 담당자만 서명 요청을 만들 수 있습니다.",
  file: "원본 파일",
  drop: "파일을 끌어오거나 선택하세요",
  fileHint: "최대 20 MB · 파일의 SHA-256 해시를 이 브라우저에서 계산합니다.",
  sizeError: "20 MB 이하의 파일을 선택해 주세요.",
  countError: "파일을 한 개만 선택해 주세요.",
  hashing: "SHA-256 계산 중…",
  hashError: "파일을 읽지 못했습니다. 파일을 다시 선택해 주세요.",
  title: "문서 제목",
  category: "카테고리",
  categories: {
    budget: "예산",
    settlement: "결산",
    receipt: "영수증",
    agenda: "안건",
    other: "기타",
  } satisfies Record<Category, string>,
  signer: "서명자",
  choose: "서명자를 선택하세요",
  noKey: "사용 가능한 암호화 키 없음",
  noSigner:
    "요청을 받을 수 있는 서명자가 없습니다. 기관 관리자가 서명자의 암호화 키를 승인해야 합니다.",
  changed:
    "제목과 서명자를 확인해 주세요. 서명자의 역할이나 암호화 키 상태가 바뀌었을 수 있습니다.",
  duplicate: "같은 파일이 이 기관에 이미 등록되어 있습니다.",
  existing: "기존 요청 보기",
  created: "서명 요청을 만들었습니다.",
  uploadHint: "원본 파일은 이 기기에 있습니다. 암호화 파일을 업로드하면 서명자에게 전달됩니다.",
  requestId: "요청 ID",
  status: {
    awaiting_upload: "업로드 대기",
    pending: "서명 대기",
    needs_resend: "재전송 필요",
    signed: "서명 완료",
    rejected: "거절됨",
  } satisfies Record<RequestStatus, string>,
} as const;
