export const personalKeys = {
  description: "기관별로 이 브라우저에서 사용할 키를 등록하고 승인 상태를 확인하세요.",
  organization: "기관 선택",
  noOrganizations: "소속 기관이 생기면 이곳에서 키를 등록할 수 있습니다.",
  deviceHint:
    "비밀키는 이 브라우저에 저장됩니다. 기기를 바꾸거나 브라우저 데이터를 지우면 새 키를 등록하고 관리자 승인을 받아야 합니다.",
  purpose: { sign: "서명 키", encrypt: "암호화 키" },
  use: { sign: "내가 확인한 문서에 서명합니다.", encrypt: "나에게 암호화해 보낸 문서를 엽니다." },
  status: { pending: "승인 대기", active: "승인됨", revoked: "폐기됨" },
  local: "이 브라우저에 보관 중",
  missing: "이 브라우저에 비밀키 없음",
  unsent: "등록 전",
  empty: "등록된 키가 없습니다.",
  create: "키 생성 및 등록",
  replace: "새 키 등록",
  retry: "등록 다시 시도",
  registering: "등록 중…",
  refresh: "상태 새로고침",
  wait: "관리자가 본인과 키 지문을 확인하면 이 키를 사용할 수 있습니다.",
  replacementHint: "새 키는 관리자가 기존 키를 폐기한 뒤 승인할 수 있습니다.",
  localError:
    "이 브라우저의 키 저장소를 열 수 없습니다. 사이트 데이터 저장이 허용되어 있는지 확인해 주세요.",
  generateError:
    "이 브라우저에 키를 생성하거나 저장하지 못했습니다. Web Crypto와 사이트 데이터 저장을 지원하는 브라우저에서 다시 시도해 주세요.",
  conflict: "이미 등록된 키입니다. 상태를 새로고침해 주세요.",
  copy: "전체 지문 복사",
  copied: "지문을 복사했습니다.",
  manualCopy: "아래 지문을 선택해 복사하세요.",
} as const;
