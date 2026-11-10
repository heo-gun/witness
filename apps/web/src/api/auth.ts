import { ApiError, apiRequest } from "./client";

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput extends LoginInput {
  name: string;
}

export const authKeys = { me: ["auth", "me"] as const };

export function register(input: RegisterInput): Promise<User> {
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
