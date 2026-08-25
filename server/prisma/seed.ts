import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const plants = await Promise.all(
    [
      { name: "Plant 1", code: "PLT1" },
      { name: "Plant 2", code: "PLT2" },
      { name: "Plant 3", code: "PLT3" },
      // Sentinel plant used for tickets raised by email when the sender
      // can't be tied to a real plant. See server/src/lib/emailPoller.ts.
      { name: "Unspecified (via Email)", code: "EMAIL" },
    ].map((p) => prisma.plant.upsert({ where: { code: p.code }, update: {}, create: p }))
  );

  const queryTypes = await Promise.all(
    [
      { name: "Transport Delay", description: "Delayed pickups/deliveries", keywords: "transport, delay, delivery late, truck, pickup" },
      { name: "Invoice Discrepancy", description: "Billing or invoice mismatches", keywords: "invoice, billing, payment, discrepancy, amount" },
      { name: "Material Shortage", description: "Short or missing material on receipt", keywords: "shortage, missing, short material, quantity mismatch" },
      { name: "Delivery Schedule", description: "Scheduling or rescheduling deliveries", keywords: "schedule, reschedule, delivery date, eta" },
      // Fallback for inbound emails that match no keywords above.
      { name: "Other", description: "Anything that doesn't fit the above", isEmailDefault: true },
    ].map((qt) => prisma.queryType.upsert({ where: { name: qt.name }, update: {}, create: qt }))
  );

  const passwordHash = await bcrypt.hash("ChangeMe123!", 10);

  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      name: "RDC Hub Admin",
      email: "admin@rdc.in",
      username: "admin",
      passwordHash,
      role: "ADMIN",
    },
  });

  const member = await prisma.user.upsert({
    where: { username: "member1" },
    update: {},
    create: {
      name: "Logistics Member One",
      email: "member1@rdc.in",
      username: "member1",
      passwordHash,
      role: "MEMBER",
      plantId: plants[0].id,
    },
  });

  // Plant Staff no longer log in to the Hub — this is a directory record
  // only, used to match inbound sender emails to the right Plant. No
  // passwordHash, no OTP; see server/src/routes/auth.ts's /login block.
  const staff = await prisma.user.upsert({
    where: { username: "staff1" },
    update: {},
    create: {
      name: "Plant Staff One",
      email: "staff1@rdc.in",
      username: "staff1",
      passwordHash: null,
      role: "PLANT_STAFF",
      plantId: plants[0].id,
    },
  });

  // Give the sample member rights to the first two query types so the
  // dashboard has something to route into out of the box.
  await prisma.queryTypeAssignment.upsert({
    where: { userId_queryTypeId: { userId: member.id, queryTypeId: queryTypes[0].id } },
    update: {},
    create: { userId: member.id, queryTypeId: queryTypes[0].id },
  });
  await prisma.queryTypeAssignment.upsert({
    where: { userId_queryTypeId: { userId: member.id, queryTypeId: queryTypes[1].id } },
    update: {},
    create: { userId: member.id, queryTypeId: queryTypes[1].id },
  });

  console.log("Seed complete.");
  console.log("Login with any of these (password: ChangeMe123!):");
  console.log(`  admin   -> ${admin.username}`);
  console.log(`  member  -> ${member.username}`);
  console.log(`(Plant Staff, e.g. "${staff.username}", is a directory record only — no login; they interact by email.)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
