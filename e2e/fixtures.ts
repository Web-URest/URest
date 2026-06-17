import { test as base, type BrowserContext } from "@playwright/test";

import { db } from "./harness";

/** Playwright `test` with a `db` fixture that resets the DB before each spec. */
export const test = base.extend<{ db: typeof db }>({
  db: async ({}, use) => {
    await db.resetDb();
    await use(db);
  },
});

export { expect } from "@playwright/test";

/** Attach an Auth.js database-session cookie so the browser is signed in as that user. */
export async function authenticate(context: BrowserContext, sessionToken: string): Promise<void> {
  await context.addCookies([
    { name: "authjs.session-token", value: sessionToken, domain: "localhost", path: "/" },
  ]);
}
