import { describe, expect, it } from "vitest";

import { authConfig } from "./auth.config";

type ProfileFn = (profile: Record<string, unknown>) => {
  id: string;
  name: string;
  email: string | null;
  image: string | null;
  lineUserId: string;
};

function lineProfileMapper(): ProfileFn {
  // Auth.js stashes user-supplied provider overrides (clientId, profile, …)
  // under `.options` until NextAuth normalizes them at init.
  const provider = authConfig.providers[0] as
    | { options?: { profile?: ProfileFn } }
    | undefined;
  const profile = provider?.options?.profile;
  if (!profile) {
    throw new Error("LINE provider profile() not configured");
  }
  return profile;
}

describe("LINE provider profile() mapping", () => {
  it("maps sub→lineUserId/id, name→name, picture→image", () => {
    const out = lineProfileMapper()({
      sub: "Uabc123",
      name: "สมหญิง",
      picture: "https://line/pic.png",
      email: "s@example.com",
    });
    expect(out).toMatchObject({
      id: "Uabc123",
      lineUserId: "Uabc123",
      name: "สมหญิง",
      image: "https://line/pic.png",
      email: "s@example.com",
    });
  });

  it("falls back to 'LINE user' and null email/image when claims absent", () => {
    const out = lineProfileMapper()({ sub: "Uxyz" });
    expect(out.name).toBe("LINE user");
    expect(out.email).toBeNull();
    expect(out.image).toBeNull();
    expect(out.lineUserId).toBe("Uxyz");
  });
});
