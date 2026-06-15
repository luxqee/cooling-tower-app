import path from "node:path";
import { defineConfig } from "prisma/config";
import { neon } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";

// Load .env.local for local dev (Prisma doesn't auto-load it)
import { config } from "dotenv";
config({ path: ".env.local" });

export default defineConfig({
  earlyAccess: true,
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    url: process.env.DIRECT_URL!,
  },
  migrate: {
    adapter(env) {
      const sql = neon(env.DIRECT_URL as string);
      return new PrismaNeon(sql);
    },
  },
});
