const RECRUITER_FIELDS = ["name", "title", "email", "linkedIn", "source"] as const;

type RecruiterField = (typeof RECRUITER_FIELDS)[number];

export type RecruiterFields = Partial<Record<RecruiterField, string | null>>;

// Only fields present in the body are returned, so the result works for both create and PATCH.
export function recruiterFieldsFromBody(body: Record<string, unknown>) {
  const data: RecruiterFields = {};

  for (const field of RECRUITER_FIELDS) {
    if (body[field] === undefined) continue;
    const value = String(body[field] ?? "").trim();
    data[field] = value ? value : null;
  }

  return data;
}

export function formatRecruiterSummary(recruiter: {
  name: string | null;
  email: string | null;
}) {
  if (recruiter.name && recruiter.email) return `${recruiter.name} <${recruiter.email}>`;
  return recruiter.name ?? recruiter.email ?? "";
}
