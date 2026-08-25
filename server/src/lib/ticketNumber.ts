import { prisma } from "./prisma";

/**
 * Generates the next human-friendly ticket number, e.g. "SR-123" — plain
 * sequential, no zero-padding. Based on the current row count, wrapped in
 * the caller's transaction-free flow — fine for this app's scale (internal
 * tool, not high concurrency).
 */
export async function nextTicketNumber(): Promise<string> {
  const count = await prisma.serviceRequest.count();
  const next = count + 1;
  return `SR-${next}`;
}
