import { describe, expect, it } from "vitest";
import { getGoogleAdsAuthUrl } from "./google-ads";

describe("getGoogleAdsAuthUrl", () => {
  it("requests the Data Manager scope with offline access and forced consent", () => {
    const url = new URL(getGoogleAdsAuthUrl("MASTER"));

    // google-ads-mcc-configuracoes: openid email traz o e-mail da conta que conectou
    expect(url.searchParams.get("scope")).toBe(
      "openid email https://www.googleapis.com/auth/datamanager",
    );
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBe("MASTER");
    expect(url.toString()).not.toContain("adwords");
  });
});
