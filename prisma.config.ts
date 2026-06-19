import path from "node:path";
import { defineConfig } from "prisma/config";
import { PrismaNeon } from "@prisma/adapter-neon";

// Load .env.local for local dev (Prisma doesn't auto-load it)
import { config } from "dotenv";
config({ path: ".env.local" });

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    url: process.env.DIRECT_URL!,
  },
  // @ts-expect-error migrate is an early-access API not yet in the published types
  migrate: {
    adapter() {
      return new PrismaNeon({ connectionString: process.env.DIRECT_URL! });
    },
  },
});
