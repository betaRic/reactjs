import "server-only";

import postgres from "postgres";
import { FacebookApiError } from "@/lib/facebook-server";

export function getDatabaseUrl() {
  return clean(
    process.env.DATABASE_URL
      || process.env.POSTGRES_URL
      || process.env.POSTGRES_PRISMA_URL
      || process.env.DATABASE_URL_UNPOOLED
      || process.env.POSTGRES_URL_NON_POOLING,
  );
}

export function getDatabaseReadiness() {
  const available = Boolean(getDatabaseUrl());
  return {
    available,
    missing: available ? [] : ["DATABASE_URL or POSTGRES_URL"],
  };
}

export function getSql() {
  const connectionString = getDatabaseUrl();
  if (!connectionString) throw new FacebookApiError("The application database is not configured.", 503);
  if (!globalThis.__dilgSocialStudioSql) {
    globalThis.__dilgSocialStudioSql = postgres(connectionString, {
      max: 1,
      prepare: false,
      connect_timeout: 10,
      idle_timeout: 20,
    });
  }
  return globalThis.__dilgSocialStudioSql;
}

function clean(value) {
  return String(value || "").trim();
}
