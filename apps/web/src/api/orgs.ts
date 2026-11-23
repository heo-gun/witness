import { apiRequest } from "./client";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  description: string;
  externalId: string | null;
  createdAt: string;
}

export interface CreateOrgInput {
  name: string;
  slug: string;
  description: string;
}

export const orgKeys = {
  lists: ["orgs", "list"] as const,
  list: (userId: string) => ["orgs", "list", userId] as const,
  detail: (userId: string, slug: string) => ["orgs", "detail", userId, slug] as const,
};

export function listOrgs(expectedUserId: string, signal?: AbortSignal): Promise<Organization[]> {
  return apiRequest("/orgs", { expectedUserId, signal });
}

export function createOrg(input: CreateOrgInput, expectedUserId: string): Promise<Organization> {
  return apiRequest("/orgs", { method: "POST", body: input, expectedUserId });
}

export function getOrg(
  slug: string,
  expectedUserId: string,
  signal?: AbortSignal,
): Promise<Organization> {
  return apiRequest(`/orgs/${encodeURIComponent(slug)}`, { expectedUserId, signal });
}

export function updateOrg(
  slug: string,
  input: Pick<Organization, "name" | "description">,
  expectedUserId: string,
): Promise<Organization> {
  return apiRequest(`/orgs/${encodeURIComponent(slug)}`, {
    method: "PATCH",
    body: input,
    expectedUserId,
  });
}
