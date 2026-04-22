import { getDb } from "./connection";
import { outlookTokens } from "@db/schema";
import { eq } from "drizzle-orm";

export async function findOutlookTokenByUserId(userId: number) {
  return getDb().query.outlookTokens.findFirst({
    where: eq(outlookTokens.userId, userId),
  });
}

export async function upsertOutlookToken(data: {
  userId: number;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  email?: string;
}) {
  const existing = await findOutlookTokenByUserId(data.userId);
  if (existing) {
    await getDb()
      .update(outlookTokens)
      .set({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: data.expiresAt,
        email: data.email,
      })
      .where(eq(outlookTokens.userId, data.userId));
    return findOutlookTokenByUserId(data.userId);
  }
  const [{ id }] = await getDb()
    .insert(outlookTokens)
    .values(data)
    .$returningId();
  return getDb().query.outlookTokens.findFirst({
    where: eq(outlookTokens.id, id),
  });
}

export async function deleteOutlookTokenByUserId(userId: number) {
  await getDb()
    .delete(outlookTokens)
    .where(eq(outlookTokens.userId, userId));
}
