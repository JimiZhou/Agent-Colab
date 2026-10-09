import { z } from "zod";
const text = z.string().trim().min(1).max(8000);
const short = z.string().trim().min(1).max(200);
const id = z.string().uuid();
export const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  after: z.coerce.number().int().min(0).default(0),
});
export const projectSchema = z.object({
  name: short,
  goal: text,
  mode: z.enum(["owner", "community"]).default("owner"),
  public: z.boolean().default(false),
  summary: z.string().max(8000).default(""),
  stage: short.default("Exploration"),
  threshold: z.number().int().min(2).max(20).default(2),
});
export const projectUpdateSchema = z
  .object({
    name: short.optional(),
    goal: text.optional(),
    summary: z.string().max(8000).optional(),
    stage: short.optional(),
    public: z.boolean().optional(),
  })
  .strict();
export const joinSchema = z.object({
  name: short,
  participantId: id.optional(),
  agentId: id.optional(),
  participantName: short.optional(),
  harness: short.default("generic"),
  model: short.optional(),
  role: z
    .enum(["reader", "contributor", "reviewer", "owner"])
    .default("contributor"),
  expiresIn: z.number().int().min(60).max(2592000).default(604800),
});
export const taskSchema = z.object({
  title: short,
  description: z.string().max(8000).default(""),
  dependencies: z.array(id).max(20).default([]),
  kind: z.enum(["research", "verification"]).default("research"),
});
const url = z
  .string()
  .url()
  .max(2000)
  .refine(
    (s) => ["https:", "http:"].includes(new URL(s).protocol),
    "HTTP(S) URL required",
  );
export const evidenceSchema = z.object({
  description: text,
  url: url.optional(),
});
export const findingSchema = z.object({
  title: short,
  summary: text,
  direction: short,
  taskId: id.optional(),
  method: text,
  evidence: z.array(evidenceSchema).min(1).max(20),
  reproduction: text,
  codeLinks: z.array(url).max(20).default([]),
});
export const reviewSchema = z
  .object({
    findingId: id,
    vote: z.enum(["approve", "reject", "revoke"]),
    environment: text,
    evidence: text,
    notes: z.string().max(8000).default(""),
    failureReason: z.string().max(8000).default(""),
    reproduced: z.boolean().default(false),
  })
  .refine(
    (x) => x.vote === "approve" || x.failureReason.length > 0,
    "Rejection/revocation requires failureReason",
  );
export const repositorySchema = z.object({
  url: url.refine(
    (s) => /^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/.test(s),
    "GitHub repository URL required",
  ),
  commit: z
    .string()
    .regex(/^[a-f0-9]{40}$/i)
    .optional(),
  branch: short.optional(),
  pr: url
    .refine(
      (s) => /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/.test(s),
      "GitHub PR URL required",
    )
    .optional(),
});
export type Role = "owner" | "reviewer" | "contributor" | "reader";
export type Actor = {
  credentialId: string;
  participantId: string;
  agentId?: string;
  projectId?: string;
  admin?: boolean;
};
export type RecordData = { id: string; [key: string]: any };
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
