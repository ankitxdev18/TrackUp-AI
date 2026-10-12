export interface AuthUser {
  id: string;
  email: string;
  name: string;
  timezone?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface UpdateProfilePayload {
  name?: string;
  timezone?: string;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
}

export async function loginApi(credentials: LoginCredentials): Promise<AuthUser> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(credentials),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Invalid email or password");
  }

  return data.user;
}

export async function getMeApi(): Promise<AuthUser | null> {
  try {
    const res = await fetch("/api/auth/me", {
      credentials: "include",
      headers: {
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    return data.user || null;
  } catch {
    return null;
  }
}

export async function logoutApi(): Promise<void> {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({}),
    });
  } catch {
    // Ignore network error on logout
  }
}

export async function registerApi(payload: RegisterPayload): Promise<AuthUser> {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Registration failed");
  }

  return data.user;
}

export async function updateProfileApi(payload: UpdateProfilePayload): Promise<AuthUser> {
  const res = await fetch("/api/auth/profile", {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (data.details && Array.isArray(data.details) && data.details.length > 0) {
      throw new Error(data.details[0].message || data.error || "Profile update failed");
    }
    throw new Error(data.error || "Profile update failed");
  }

  return data.user;
}

export async function changePasswordApi(
  payload: ChangePasswordPayload
): Promise<{ message: string; sessionsRevoked: boolean }> {
  const res = await fetch("/api/auth/change-password", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (data.details && Array.isArray(data.details) && data.details.length > 0) {
      throw new Error(data.details[0].message || data.error || "Password change failed");
    }
    throw new Error(data.error || "Password change failed");
  }

  return data;
}

