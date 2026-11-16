export const API_PREFIX = "/api/v1";

export { canonicalize, canonicalBytes } from "./canonical.js";
export { isLowercaseHex, hexToBytes, bytesToHex } from "./hex.js";
export type {
  Category,
  KeyPurpose,
  IssuePayload,
  RevokePayload,
  SignaturePayload,
  SignedEntry,
  KeyRegisterEntry,
  KeyRevokeEntry,
  LogEntryData,
  SthPayload,
} from "./payloads.js";
