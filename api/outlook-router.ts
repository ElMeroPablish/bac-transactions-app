import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import {
  findOutlookTokenByUserId,
  upsertOutlookToken,
  deleteOutlookTokenByUserId,
} from "./queries/outlookTokens";
import { TRPCError } from "@trpc/server";

const MICROSOFT_AUTH_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const MICROSOFT_TOKEN_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const MICROSOFT_GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const SCOPES = "Mail.Read offline_access";

function generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

function generateCodeChallenge(verifier: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  return crypto.subtle.digest("SHA-256", data).then((digest) => {
    return base64UrlEncode(new Uint8Array(digest));
  });
}

function base64UrlEncode(array: Uint8Array) {
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
  codeVerifier: string,
  clientId: string,
) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: codeVerifier,
  });

  const resp = await fetch(MICROSOFT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Token exchange failed: ${text}`);
  }

  return resp.json() as Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }>;
}

async function refreshAccessToken(refreshToken: string, clientId: string) {
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
      message: "Outlook not connected",
    });
  }

  const now = new Date();
  const expiresAt = new Date(tokenRecord.expiresAt);

  if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
    const newTokens = await refreshAccessToken(
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

export const outlookRouter = createRouter({
  getAuthUrl: authedQuery
    .input(
      z.object({
        clientId: z.string().min(1),
        redirectUri: z.string().url(),
      }),
    )
    .query(async ({ input }) => {
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = await generateCodeChallenge(codeVerifier);
      const state = btoa(
        JSON.stringify({
          cv: codeVerifier,
          ru: input.redirectUri,
          ci: input.clientId,
        }),
      );

      const url = new URL(MICROSOFT_AUTH_URL);
      url.searchParams.set("client_id", input.clientId);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("redirect_uri", input.redirectUri);
      url.searchParams.set("scope", SCOPES);
      url.searchParams.set("code_challenge", codeChallenge);
      url.searchParams.set("code_challenge_method", "S256");
      url.searchParams.set("state", state);
      url.searchParams.set("response_mode", "query");

      return { authUrl: url.toString(), state };
    }),

  handleCallback: authedQuery
    .input(
      z.object({
        code: z.string().min(1),
        state: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const stateData = JSON.parse(atob(input.state));
        const { cv: codeVerifier, ru: redirectUri, ci: clientId } = stateData;

        const tokens = await exchangeCodeForTokens(
          input.code,
          redirectUri,
          codeVerifier,
          clientId,
        );

        const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

        const profileResp = await fetch(`${MICROSOFT_GRAPH_BASE}/me`, {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });

        let email: string | undefined;
        if (profileResp.ok) {
          const profile = await profileResp.json() as { mail?: string; userPrincipalName?: string };
          email = profile.mail || profile.userPrincipalName;
        }

        await upsertOutlookToken({
          userId: ctx.user.id,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt,
          email,
        });

        return { success: true, email };
      } catch (error) {
        console.error("Outlook callback error:", error);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? error.message
              : "Failed to connect Outlook",
        });
      }
    }),

  getStatus: authedQuery.query(async ({ ctx }) => {
    const token = await findOutlookTokenByUserId(ctx.user.id);
    return {
      connected: !!token,
      email: token?.email || null,
    };
  }),

  disconnect: authedQuery.mutation(async ({ ctx }) => {
    await deleteOutlookTokenByUserId(ctx.user.id);
    return { success: true };
  }),

  syncEmails: authedQuery
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

        const parsedTransactions = [];
        for (const msg of messages) {
          const bodyContent =
            msg.body?.content || msg.subject || "";
          const transaction = parseTransactionEmail(
            bodyContent,
            msg.id,
            new Date(msg.receivedDateTime),
          );
          if (transaction) {
            parsedTransactions.push(transaction);
          }
        }

        return {
          success: true,
          emailsFound: messages.length,
          transactionsFound: parsedTransactions.length,
          transactions: parsedTransactions,
        };
      } catch (error) {
        console.error("Sync error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "Sync failed",
        });
      }
    }),
});

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

  const htmlTags = new RegExp("</?[^>]+(>|$)", "g");
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
