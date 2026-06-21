const API_PREFIX = "/api";
const controlUrl = import.meta.env.VITE_CONTROL_URL ?? "http://localhost:3000";

interface ApiEnvelope<T> {
  data?: T;
  error?: string;
  message?: string;
  success: boolean;
}

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

import { isTauri } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  const fetchFn = isTauri() ? tauriFetch : fetch;
  const response = await fetchFn(`${controlUrl}${API_PREFIX}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  const payload = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok) {
    const message =
      payload.message ??
      payload.error ??
      `Request failed with ${response.status}`;
    throw new ApiError(message, response.status, payload.error);
  }

  if (!payload.success || payload.data === undefined) {
    const message = payload.message ?? payload.error ?? "Request failed";
    throw new ApiError(message, response.status, payload.error);
  }

  return payload.data;
}

export const api = {
  get<T>(path: string): Promise<T> {
    return apiRequest<T>(path, { method: "GET" });
  },
  post<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
    return apiRequest<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
      ...init,
    });
  },
  patch<T>(path: string, body?: unknown): Promise<T> {
    return apiRequest<T>(path, {
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    });
  },
  delete<T>(path: string): Promise<T> {
    return apiRequest<T>(path, { method: "DELETE" });
  },
};
