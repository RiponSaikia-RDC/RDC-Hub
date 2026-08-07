import { prisma } from "./prisma";

/**
 * Picks who a new SR for a given query type should be assigned to.
 * Load-balances across every active member who has been given rights to
 * that query type by an admin, picking whoever currently has the fewest
 * open/in-progress SRs. Returns null if nobody is assigned to that query
 * type yet — the SR then lands in the "Unassigned" queue for Admin.
 */
export async function pickAssignee(queryTypeId: number): Promise<number | null> {
  const eligible = await prisma.queryTypeAssignment.findMany({
    where: { queryTypeId, user: { active: true, role: "MEMBER" } },
    select: { userId: true },
  });

  if (eligible.length === 0) return null;
  if (eligible.length === 1) return eligible[0].userId;

  const userIds = eligible.map((e) => e.userId);

  const loads = await prisma.serviceRequest.groupBy({
    by: ["assignedToId"],
    where: {
      assignedToId: { in: userIds },
      status: { in: ["OPEN", "IN_PROGRESS"] },
    },
    _count: { assignedToId: true },
  });

  const loadMap = new Map<number, number>();
  for (const id of userIds) loadMap.set(id, 0);
  for (const l of loads) {
    if (l.assignedToId != null) loadMap.set(l.assignedToId, l._count.assignedToId);
  }

  let best = userIds[0];
  let bestLoad = loadMap.get(best) ?? 0;
  for (const id of userIds) {
    const load = loadMap.get(id) ?? 0;
    if (load < bestLoad) {
      best = id;
      bestLoad = load;
    }
  }
  return best;
}
