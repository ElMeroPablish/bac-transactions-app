import { relations } from "drizzle-orm";
import { users, outlookTokens, transactions } from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
  outlookTokens: many(outlookTokens),
  transactions: many(transactions),
}));

export const outlookTokensRelations = relations(outlookTokens, ({ one }) => ({
  user: one(users, {
    fields: [outlookTokens.userId],
    references: [users.id],
  }),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, {
    fields: [transactions.userId],
    references: [users.id],
  }),
}));
