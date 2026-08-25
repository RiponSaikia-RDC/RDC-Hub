import { prisma } from "./prisma";

export interface RouteResult {
  queryTypeId: number | null;
  /** True only if a real keyword hit picked this query type. False means
   * it fell back to the isEmailDefault/first-active query type — the
   * caller (emailPoller.ts) uses this to leave the ticket unassigned +
   * broadcast to every member instead of auto-picking one, and to show
   * the "teach routing" panel on the request detail page. */
  matched: boolean;
}

/**
 * Picks which QueryType an inbound email should be routed to, based on
 * QueryType.keywords (comma-separated, case-insensitive substring match
 * against the email's subject+body). The query type with the most keyword
 * hits wins; ties go to whichever was matched first. Falls back to the
 * QueryType flagged isEmailDefault, or — if the admin hasn't set one — the
 * first active query type (logged so it's obvious a default should be
 * configured).
 */
export async function matchQueryType(subject: string, body: string): Promise<RouteResult> {
  const haystack = `${subject} ${body}`.toLowerCase();

  const candidates = await prisma.queryType.findMany({
    where: { active: true, keywords: { not: null } },
    select: { id: true, keywords: true },
  });

  let best: { id: number; score: number } | null = null;
  for (const c of candidates) {
    const terms = (c.keywords ?? "")
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    const score = terms.filter((t) => haystack.includes(t)).length;
    if (score > 0 && (!best || score > best.score)) {
      best = { id: c.id, score };
    }
  }
  if (best) return { queryTypeId: best.id, matched: true };

  const fallback = await prisma.queryType.findFirst({ where: { active: true, isEmailDefault: true } });
  if (fallback) return { queryTypeId: fallback.id, matched: false };

  const anyActive = await prisma.queryType.findFirst({ where: { active: true }, orderBy: { name: "asc" } });
  if (anyActive) {
    console.warn(
      `[emailRouter] No QueryType is marked isEmailDefault — falling back to "${anyActive.name}". ` +
        "Set a default from Admin > Query Types to control this."
    );
    return { queryTypeId: anyActive.id, matched: false };
  }
  return { queryTypeId: null, matched: false };
}
