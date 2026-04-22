import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import {
  findTransactionsByUserId,
  createTransaction,
  updateTransactionMarkToPay,
  updateTransactionPaidStatus,
} from "./queries/transactions";
import { upsertOutlookToken, findOutlookTokenByUserId } from "./queries/outlookTokens";
import { TRPCError } from "@trpc/server";

const MICROSOFT_GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const MICROSOFT_TOKEN_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const SCOPES = "Mail.Read offline_access";

async function refreshMicrosoftToken(refreshToken: string, clientId: string) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    scope: SCOPES,
  });

  const resp = await fetch(MICROSOFT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Token refresh failed: ${text}`);
  }

  return resp.json() as Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }>;
}

async function getValidAccessToken(userId: number, clientId: string) {
  const tokenRecord = await findOutlookTokenByUserId(userId);
  if (!tokenRecord) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Outlook not connected. Please connect your Outlook account first.",
    });
  }

  const now = new Date();
  const expiresAt = new Date(tokenRecord.expiresAt);

  if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
    const newTokens = await refreshMicrosoftToken(
      tokenRecord.refreshToken,
      clientId,
    );
    const newExpiresAt = new Date(Date.now() + newTokens.expires_in * 1000);
    await upsertOutlookToken({
      userId,
      accessToken: newTokens.access_token,
      refreshToken: newTokens.refresh_token || tokenRecord.refreshToken,
      expiresAt: newExpiresAt,
      email: tokenRecord.email || undefined,
    });
    return newTokens.access_token;
  }

  return tokenRecord.accessToken;
}

interface ParsedTransaction {
  messageId: string;
  cardNumber: string | null;
  commerce: string;
  amount: string;
  currency: "HNL" | "USD";
  transactionDate: Date;
  rawSnippet: string;
}

function parseTransactionEmail(
  content: string,
  messageId: string,
  receivedDate: Date,
): ParsedTransaction | null {
  if (!content.includes("MASTERCARD") && !content.includes("6150")) {
    return null;
  }

  const cardMatch = content.match(/MASTERCARD\s+(\d+)/i);
  const cardNumber = cardMatch ? cardMatch[1] : null;

  if (!cardNumber || (cardNumber !== "6150" && !content.includes("6150"))) {
    return null;
  }

  let commerce = "Desconocido";
  let amount = "0.00";
  let currency: "HNL" | "USD" = "HNL";

  const commercePatterns = [
    /comercio[\s:]*([^\n\r<]+)/i,
    /establecimiento[\s:]*([^\n\r<]+)/i,
    /lugar[\s:]*([^\n\r<]+)/i,
    /merchant[\s:]*([^\n\r<]+)/i,
    /en\s+([A-Z][A-Za-z\s&\.]+(?:SA|DE CV|SRL|LTDA|INC|LLC|LTD|CIA|CORP))/,
    /compra\s+(?:en|en\s+el\s+comercio)\s+([A-Z][A-Za-z0-9\s&\.\-]+)/i,
  ];

  for (const pattern of commercePatterns) {
    const match = content.match(pattern);
    if (match) {
      commerce = match[1].trim();
      break;
    }
  }

  const lempiraPatterns = [
    /L\.?\s*([\d,]+\.\d{2})/,
    /L[\s]*([\d,]+\.\d{2})/,
    /lempiras[\s:]*([\d,]+\.\d{2})/i,
    /HNL[\s:]*([\d,]+\.\d{2})/,
    /monto[\s:]*L\.?\s*([\d,]+\.\d{2})/i,
  ];

  const dollarPatterns = [
    /\$\s*([\d,]+\.\d{2})/,
    /USD[\s:]*([\d,]+\.\d{2})/,
    /d[oó]lares[\s:]*([\d,]+\.\d{2})/i,
    /monto[\s:]*\$\s*([\d,]+\.\d{2})/i,
  ];

  let foundAmount = false;

  for (const pattern of lempiraPatterns) {
    const match = content.match(pattern);
    if (match) {
      amount = match[1].replace(/,/g, "");
      currency = "HNL";
      foundAmount = true;
      break;
    }
  }

  if (!foundAmount) {
    for (const pattern of dollarPatterns) {
      const match = content.match(pattern);
      if (match) {
        amount = match[1].replace(/,/g, "");
        currency = "USD";
        foundAmount = true;
        break;
      }
    }
  }

  if (!foundAmount) {
    const genericAmount = content.match(/([\d,]+\.\d{2})/);
    if (genericAmount) {
      amount = genericAmount[1].replace(/,/g, "");
      if (content.includes("$")) {
        currency = "USD";
      } else {
        currency = "HNL";
      }
    }
  }

  const htmlTags = /<\/?[^>]+(>|$)/g;
  const cleanSnippet = content
    .replace(htmlTags, " ")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 500);

  return {
    messageId,
    cardNumber,
    commerce,
    amount,
    currency,
    transactionDate: receivedDate,
    rawSnippet: cleanSnippet,
  };
}

export const transactionRouter = createRouter({
  list: authedQuery.query(async ({ ctx }) => {
    return findTransactionsByUserId(ctx.user.id);
  }),

  sync: authedQuery
    .input(
      z.object({
        clientId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const accessToken = await getValidAccessToken(
          ctx.user.id,
          input.clientId,
        );

        const filter = `from/notificacion_hn@baccredomatic.com`;
        const resp = await fetch(
          `${MICROSOFT_GRAPH_BASE}/me/messages?$filter=${encodeURIComponent(filter)}&$top=50&$orderby=receivedDateTime desc`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        );

        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(`Graph API error: ${text}`);
        }

        const data = await resp.json() as { value?: Array<{ id: string; body?: { content?: string }; subject?: string; receivedDateTime: string }> };
        const messages = data.value || [];

        const results = [];
        for (const msg of messages) {
          const bodyContent = msg.body?.content || msg.subject || "";
          const parsed = parseTransactionEmail(
            bodyContent,
            msg.id,
            new Date(msg.receivedDateTime),
          );
          if (parsed) {
            const saved = await createTransaction({
              userId: ctx.user.id,
              messageId: parsed.messageId,
              cardNumber: parsed.cardNumber,
              commerce: parsed.commerce,
              amount: parsed.amount,
              currency: parsed.currency,
              transactionDate: parsed.transactionDate,
              rawContent: parsed.rawSnippet,
            });
            if (saved) {
              results.push(saved);
            }
          }
        }

        return {
          success: true,
          emailsFound: messages.length,
          transactionsFound: results.length,
          transactions: results,
        };
      } catch (error) {
        console.error("Sync error:", error);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "Sync failed",
        });
      }
    }),

  markToPay: authedQuery
    .input(
      z.object({
        id: z.number(),
        isMarkedToPay: z.boolean(),
      }),
    )
    .mutation(async ({ input }) => {
      return updateTransactionMarkToPay(input.id, input.isMarkedToPay);
    }),

  markPaid: authedQuery
    .input(
      z.object({
        id: z.number(),
        isPaid: z.boolean(),
      }),
    )
    .mutation(async ({ input }) => {
      return updateTransactionPaidStatus(input.id, input.isPaid);
    }),
});
