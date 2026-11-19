import { ko } from "@/lib/i18n/ko";

export function RoleOptions({ allowOwner = true }: { allowOwner?: boolean }) {
  return (
    <>
      {(["owner", "signer", "issuer"] as const)
        .filter((role) => allowOwner || role !== "owner")
        .map((role) => (
          <option key={role} value={role}>
            {ko.roles[role]}
          </option>
        ))}
    </>
  );
}
