import { ApiError, apiRequest } from "./client";

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  emailVerifiedAt: string | null;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput extends LoginInput {
  name: string;
}

export const authKeys = { me: ["auth", "me"] as const };

export type EmailPurpose = "verify_email" | "reset_password";
export function requestEmail(email: string, purpose: EmailPurpose): Promise<{ accepted: boolean }> {
  return apiRequest("/auth/email/request", { method: "POST", body: { email, purpose } });
}
export function confirmEmail(
  token: string,
  purpose: EmailPurpose,
  password: string,
  name?: string,
): Promise<void> {
  return apiRequest("/auth/email/confirm", {
    method: "POST",
    body: { token, purpose, password, name },
  });
}
export function changePassword(currentPassword: string, password: string): Promise<void> {
  return apiRequest("/auth/password", { method: "POST", body: { currentPassword, password } });
}

export function register(input: RegisterInput): Promise<{ accepted: true }> {
  return apiRequest("/auth/register", { method: "POST", body: input });
}

export function login(input: LoginInput): Promise<User> {
  return apiRequest("/auth/login", { method: "POST", body: input });
}

export async function logout(): Promise<void> {
  try {
    await apiRequest("/auth/logout", { method: "POST", body: {} });
  } catch (error: unknown) {
    if (!(error instanceof ApiError && error.status === 401)) throw error;
  }
}

export async function getMe(signal?: AbortSignal): Promise<User | null> {
  try {
    return await apiRequest<User>("/auth/me", { signal });
  } catch (error: unknown) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}
