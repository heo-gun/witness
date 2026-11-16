import { ko } from "@/lib/i18n/ko";

export function RoleOptions() {
  return (
    <>
      {(["owner", "signer", "issuer"] as const).map((role) => (
        <option key={role} value={role}>
          {ko.roles[role]}
        </option>
      ))}
    </>
  );
}
