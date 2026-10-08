/**
 * Ideas API Client (Milestone I04)
 *
 * Provides typed functions to interact with TrackUp Ideas backend endpoints:
 * - GET    /api/ideas?status=ACTIVE | ARCHIVED
 * - GET    /api/ideas/:id
 * - POST   /api/ideas
 * - PATCH  /api/ideas/:id
 * - DELETE /api/ideas/:id
 */

export type IdeaStatus = "ACTIVE" | "ARCHIVED";

export interface Idea {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  status: IdeaStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateIdeaInput {
  title: string;
  description?: string | null;
}

export interface UpdateIdeaInput {
  title?: string;
  description?: string | null;
  status?: IdeaStatus;
}

export interface DeleteIdeaResponse {
  success: boolean;
  message?: string;
}

interface IdeasListApiResponse {
  ideas: Idea[];
}

interface IdeaItemApiResponse {
  idea: Idea;
}

export class IdeasApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "IdeasApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/**
 * GET /api/ideas — List user's ideas filtered by status (defaults to ACTIVE).
 */
export async function listIdeas(status?: IdeaStatus): Promise<Idea[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  const response = await fetch(`/api/ideas${query}`, {
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    let errorData: { error?: string; code?: string; details?: unknown } = {};
    try {
      errorData = await response.json();
    } catch {
      // ignore JSON parse failure
    }
    throw new IdeasApiError(
      response.status,
      errorData.code || "FETCH_IDEAS_FAILED",
      errorData.error || "Unable to load your ideas.",
      errorData.details
    );
  }

  const data: IdeasListApiResponse = await response.json();
  return data.ideas || [];
}

/**
 * GET /api/ideas/:id — Retrieve single idea by ID.
 */
export async function getIdea(id: string): Promise<Idea> {
  const response = await fetch(`/api/ideas/${encodeURIComponent(id)}`, {
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    let errorData: { error?: string; code?: string; details?: unknown } = {};
    try {
      errorData = await response.json();
    } catch {
      // ignore JSON parse failure
    }
    throw new IdeasApiError(
      response.status,
      errorData.code || "GET_IDEA_FAILED",
      errorData.error || "Unable to load the requested idea.",
      errorData.details
    );
  }

  const data: IdeaItemApiResponse = await response.json();
  return data.idea;
}

/**
 * POST /api/ideas — Create new idea strictly sending title and optional description.
 */
export async function createIdea(input: CreateIdeaInput): Promise<Idea> {
  const payload: { title: string; description?: string | null } = {
    title: input.title.trim(),
  };

  if (input.description !== undefined) {
    const trimmed = input.description ? input.description.trim() : "";
    payload.description = trimmed.length > 0 ? input.description : null;
  }

  const response = await fetch("/api/ideas", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorData: { error?: string; code?: string; details?: unknown } = {};
    try {
      errorData = await response.json();
    } catch {
      // ignore JSON parse failure
    }
    throw new IdeasApiError(
      response.status,
      errorData.code || "CREATE_IDEA_FAILED",
      errorData.error || "Couldn't save this idea. Please try again.",
      errorData.details
    );
  }

  const data: IdeaItemApiResponse = await response.json();
  return data.idea;
}

/**
 * PATCH /api/ideas/:id — Update existing idea with changed fields.
 */
export async function updateIdea(id: string, input: UpdateIdeaInput): Promise<Idea> {
  const payload: Record<string, unknown> = {};

  if (input.title !== undefined) {
    payload.title = input.title.trim();
  }

  if (input.description !== undefined) {
    if (input.description === null) {
      payload.description = null;
    } else {
      const trimmed = input.description.trim();
      payload.description = trimmed.length > 0 ? input.description : null;
    }
  }

  if (input.status !== undefined) {
    payload.status = input.status;
  }

  const response = await fetch(`/api/ideas/${encodeURIComponent(id)}`, {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorData: { error?: string; code?: string; details?: unknown } = {};
    try {
      errorData = await response.json();
    } catch {
      // ignore JSON parse failure
    }
    throw new IdeasApiError(
      response.status,
      errorData.code || "UPDATE_IDEA_FAILED",
      errorData.error || "Couldn't update this idea. Please try again.",
      errorData.details
    );
  }

  const data: IdeaItemApiResponse = await response.json();
  return data.idea;
}

/**
 * DELETE /api/ideas/:id — Permanently delete an idea.
 */
export async function deleteIdea(id: string): Promise<DeleteIdeaResponse> {
  const response = await fetch(`/api/ideas/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    let errorData: { error?: string; code?: string; details?: unknown } = {};
    try {
      errorData = await response.json();
    } catch {
      // ignore JSON parse failure
    }
    throw new IdeasApiError(
      response.status,
      errorData.code || "DELETE_IDEA_FAILED",
      errorData.error || "Couldn't delete this idea. Please try again.",
      errorData.details
    );
  }

  const data: DeleteIdeaResponse = await response.json();
  return data;
}

/**
 * Format server-created timestamp (createdAt) for idea display.
 * Uses the database timestamp as source of truth.
 */
export function formatIdeaDate(isoString: string): string {
  if (!isoString) return "";
  try {
    const dt = new Date(isoString);
    if (isNaN(dt.getTime())) return isoString;
    return dt.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return isoString;
  }
}
