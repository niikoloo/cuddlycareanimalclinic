import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Load .env.local into memory
config({ path: ".env.local" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // We give the CLI the DIRECT_URL so it can bypass the pooler to build tables
    url: process.env["DIRECT_URL"],
  },
});