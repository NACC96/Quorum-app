import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import type { Session, DeliberationSession } from "@/lib/types";

export const councilSessions = pgTable("council_sessions", {
  id: text("id").primaryKey(),
  title: text("title"),
  question: text("question").notNull(),
  status: text("status").notNull(),
  data: jsonb("data").$type<Session>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const deliberationSessions = pgTable("deliberation_sessions", {
  id: text("id").primaryKey(),
  title: text("title"),
  question: text("question").notNull(),
  phase: text("phase").notNull(),
  data: jsonb("data").$type<DeliberationSession>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
