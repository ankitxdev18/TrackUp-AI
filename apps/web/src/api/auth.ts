export interface AuthUser {
  id: string;
  email: string;
  name: string;
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
