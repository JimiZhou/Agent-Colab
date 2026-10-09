import type { z } from "zod";
import type {
  projectSchema,
  taskSchema,
  findingSchema,
  reviewSchema,
  evidenceSchema,
  Role,
} from "./contracts.js";
export type Project = z.infer<typeof projectSchema> & {
  id: string;
  ownerId: string;
  createdAt: string;
};
export interface Participant {
  id: string;
  name: string;
  createdAt: string;
  identityUnverified?: boolean;
}
export interface AgentIdentity {
  id: string;
  participantId: string;
  name: string;
  harness: string;
  model?: string;
  createdAt: string;
  lastActive: string | null;
}
export interface Membership {
  projectId: string;
  participantId: string;
  role: Role;
}
export type TaskStatus =
  | "open"
  | "claimed"
  | "in_progress"
  | "submitted"
  | "verified"
  | "rejected"
  | "disputed";
export type Task = z.infer<typeof taskSchema> & {
  id: string;
  projectId: string;
  status: TaskStatus;
  assignee: string | null;
  createdBy: string;
  createdAt: string;
};
export interface TaskLease {
  taskId: string;
  agentId: string;
  expiresAt: number;
}
export type Evidence = z.infer<typeof evidenceSchema> & {
  id: string;
  findingId: string;
};
export type Finding = z.infer<typeof findingSchema> & {
  id: string;
  projectId: string;
  author: string;
  agentId?: string;
  status: "proposed" | "verified" | "rejected" | "disputed";
  recognition: "pending" | "accepted" | "disputed" | "rejected";
  reproductionStatus: "unverified" | "independently_reported";
  createdAt: string;
};
export type Review = z.infer<typeof reviewSchema> & {
  id: string;
  projectId: string;
  participantId: string;
  agentId?: string;
  role: Role;
  createdAt: string;
};
export interface Event {
  id: string;
  sequence: number;
  projectId: string;
  type: string;
  actor: string;
  agentId?: string;
  detail: unknown;
  at: string;
}
export interface Credential {
  id: string;
  projectId: string;
  agentId: string;
  expiresAt: number;
  revokedAt?: number;
  createdAt: string;
}
export interface RepositoryLink {
  id: string;
  projectId: string;
  url: string;
  commit?: string;
  branch?: string;
  pr?: string;
  createdAt: string;
}
export type EntityTable =
  | "participants"
  | "projects"
  | "agents"
  | "tasks"
  | "findings"
  | "evidence"
  | "reviews"
  | "repository_links";
