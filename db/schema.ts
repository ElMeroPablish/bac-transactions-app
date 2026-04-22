import {
  mysqlTable,
  mysqlEnum,
  serial,
  varchar,
  text,
  timestamp,
  decimal,
  boolean,
  bigint,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const outlookTokens = mysqlTable("outlook_tokens", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  accessToken: text("accessToken").notNull(),
  refreshToken: text("refreshToken").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  email: varchar("email", { length: 320 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type OutlookToken = typeof outlookTokens.$inferSelect;
export type InsertOutlookToken = typeof outlookTokens.$inferInsert;

export const transactions = mysqlTable("transactions", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  messageId: varchar("messageId", { length: 255 }).notNull(),
  cardNumber: varchar("cardNumber", { length: 50 }),
  commerce: varchar("commerce", { length: 255 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  currency: mysqlEnum("currency", ["HNL", "USD"]).notNull(),
  transactionDate: timestamp("transactionDate").notNull(),
  isMarkedToPay: boolean("isMarkedToPay").default(false).notNull(),
  isPaid: boolean("isPaid").default(false).notNull(),
  rawContent: text("rawContent"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;
