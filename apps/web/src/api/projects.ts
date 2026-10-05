import type { Task } from "./tasks";

export interface Project {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
  taskCount?: number;
  completedTaskCount?: number;
}

export interface CreateProjectInput {
  name: string;
  description?: string | null;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
  status?: "ACTIVE" | "ARCHIVED";
}

export class ProjectApiError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "ProjectApiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export async function fetchProjects(): Promise<Project[]> {
  const response = await fetch("/api/projects", {
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    let errorData: any = {};
    try {
      errorData = await response.json();
    } catch {
      // ignore
    }
    throw new ProjectApiError(
      response.status,
      errorData.code || "FETCH_FAILED",
      errorData.error || "Failed to load projects from server"
    );
  }

  const data = await response.json();
  return data.projects || [];
}

export async function fetchProject(
  id: string
): Promise<{ project: Project; tasks: Task[] }> {
  const response = await fetch(`/api/projects/${id}`, {
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    let errorData: any = {};
    try {
      errorData = await response.json();
    } catch {
      // ignore
    }
    throw new ProjectApiError(
      response.status,
      errorData.code || "FETCH_FAILED",
      errorData.error || "Failed to load project details"
    );
  }

  return response.json();
}

export async function createProject(
  input: CreateProjectInput
): Promise<Project> {
  const response = await fetch("/api/projects", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    let errorData: any = {};
    try {
      errorData = await response.json();
    } catch {
      // ignore
    }
    throw new ProjectApiError(
      response.status,
      errorData.code || "CREATE_FAILED",
      errorData.error || "Failed to create project"
    );
  }

  const data = await response.json();
  return data.project;
}

export async function updateProject(
  id: string,
  updates: UpdateProjectInput
): Promise<Project> {
  const response = await fetch(`/api/projects/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    let errorData: any = {};
    try {
      errorData = await response.json();
    } catch {
      // ignore
    }
    throw new ProjectApiError(
      response.status,
      errorData.code || "UPDATE_FAILED",
      errorData.error || "Failed to update project"
    );
  }

  const data = await response.json();
  return data.project;
}

export async function deleteProject(
  id: string
): Promise<{ success: boolean; id: string }> {
  const response = await fetch(`/api/projects/${id}`, {
    method: "DELETE",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    let errorData: any = {};
    try {
      errorData = await response.json();
    } catch {
      // ignore
    }
    throw new ProjectApiError(
      response.status,
      errorData.code || "DELETE_FAILED",
      errorData.error || "Failed to delete project"
    );
  }

  return response.json();
}
