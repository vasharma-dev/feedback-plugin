// `npm run db:push` then `prisma db seed` (or just boot the server) populates the demo tenant.
// The seed logic itself lives in store.ts (ensureSeed) so the server can also self-seed on boot.
import { prisma } from "../src/db.js";
import { ensureSeed } from "../src/store.js";

await ensureSeed();
await prisma.$disconnect();
// eslint-disable-next-line no-console
console.log("Seeded demo tenant (Acme Inc.) + keys.");
