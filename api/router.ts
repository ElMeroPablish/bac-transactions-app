import { authRouter } from "./auth-router";
import { outlookRouter } from "./outlook-router";
import { transactionRouter } from "./transaction-router";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  outlook: outlookRouter,
  transaction: transactionRouter,
});

export type AppRouter = typeof appRouter;
