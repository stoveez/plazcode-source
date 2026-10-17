import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const lessons = sqliteTable("lessons", {id:text("id").primaryKey(), recipe:text("recipe").notNull(), successes:integer("successes").notNull().default(0), failures:integer("failures").notNull().default(0), revision:integer("revision").notNull().default(1), retracted:integer("retracted").notNull().default(0)});
export const tickets = sqliteTable("tickets", {id:text("id").primaryKey(), expires:integer("expires").notNull()});
export const budget = sqliteTable("budget", {day:text("day").primaryKey(), used:integer("used").notNull().default(0)});
