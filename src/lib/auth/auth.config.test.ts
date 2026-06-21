import { describe, expect, it } from "vitest";

import { env } from "@/lib/env";
import { authConfig } from "./auth.config";

describe("auth providers", () => {
  it("registers Google as the sole login provider, wired to env credentials", () => {
    expect(authConfig.providers).toHaveLength(1);

    // Auth.js stashes user-supplied overrides (clientId/secret) under `.options`
    // until NextAuth normalizes them at init; the provider's own id is top-level.
    const provider = authConfig.providers[0] as {
      id?: string;
      options?: { clientId?: string; clientSecret?: string };
    };

    expect(provider.id).toBe("google");
    expect(provider.options?.clientId).toBe(env.GOOGLE_CLIENT_ID);
    expect(provider.options?.clientSecret).toBe(env.GOOGLE_CLIENT_SECRET);
  });
});
