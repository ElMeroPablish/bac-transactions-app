import { getDb } from "./connection";
import { transactions } from "@db/schema";
import { eq, and, desc } from "drizzle-orm";

export async function findTransactionsByUserId(userId: number) {
  return getDb()
    .query
    .transactions
    .findMany({
      where: eq(transactions.userId, userId),
      orderBy: desc(transactions.transactionDate),
    });
}

export async function findTransactionByMessageId(
  userId: number,
  messageId: string,
) {
  return getDb().query.transactions.findFirst({
    where: and(
      eq(transactions.userId, userId),
      eq(transactions.messageId, messageId),
    ),
  });
}

export async function createTransaction(data: {
  userId: number;
  messageId: string;
  cardNumber: string | null;
  commerce: string;
  amount: string;
  currency: "HNL" | "USD";
  transactionDate: Date;
  rawContent: string;
}) {
  const existing = await findTransactionByMessageId(
    data.userId,
    data.messageId,
  );
  if (existing) return existing;

  const [{ id }] = await getDb()
    .insert(transactions)
    .values(data)
    .$returningId();
  return getDb().query.transactions.findFirst({
    where: eq(transactions.id, id),
  });
}

export async function updateTransactionMarkToPay(
  id: number,
  isMarkedToPay: boolean,
) {
  await getDb()
    .update(transactions)
    .set({ isMarkedToPay })
    .where(eq(transactions.id, id));
  return getDb().query.transactions.findFirst({
    where: eq(transactions.id, id),
  });
}

export async function updateTransactionPaidStatus(id: number, isPaid: boolean) {
  await getDb()
    .update(transactions)
    .set({ isPaid })
    .where(eq(transactions.id, id));
  return getDb().query.transactions.findFirst({
    where: eq(transactions.id, id),
  });
}

export async function deleteTransaction(id: number) {
  await getDb().delete(transactions).where(eq(transactions.id, id));
}
