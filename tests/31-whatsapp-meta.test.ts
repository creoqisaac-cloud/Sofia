import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { extractMetaTextMessages, verifyMetaChallenge, verifyMetaSignature } from "@/server/whatsapp/meta";
import { normalizeWhatsAppPhone } from "@/server/whatsapp/service";

describe("Meta WhatsApp Cloud API", () => {
  const secret = "unit-test-secret";
  it("valida la firma sobre el cuerpo original y rechaza modificaciones", () => {
    const raw = '{"object":"whatsapp_business_account","entry":[]}';
    const signature = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
    expect(verifyMetaSignature(raw, signature, secret)).toBe(true);
    expect(verifyMetaSignature(raw + " ", signature, secret)).toBe(false);
    expect(verifyMetaSignature(raw, null, secret)).toBe(false);
    expect(verifyMetaSignature(raw, "sha256=xyz", secret)).toBe(false);
  });
  it("contesta el challenge solo al dueño del token", () => {
    const p = new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "abc", "hub.challenge": "1234" });
    expect(verifyMetaChallenge(p, "abc")).toBe("1234");
    expect(verifyMetaChallenge(p, "other")).toBeNull();
    p.set("hub.mode", "invalid");
    expect(verifyMetaChallenge(p, "abc")).toBeNull();
  });
  it("solo extrae texto de un número habilitado y omite receipts", () => {
    const p = {
      object: "whatsapp_business_account",
      entry: [{ changes: [{ field: "messages", value: {
        metadata: { phone_number_id: "123" },
        contacts: [{ wa_id: "5218112345678", profile: { name: "María" } }],
        messages: [
          { id: "wamid.a", from: "5218112345678", type: "text", text: { body: "Me interesa una CR-V" } },
          { id: "wamid.b", from: "5218112345678", type: "image" },
        ],
        statuses: [{ id: "wamid.other", status: "delivered" }],
      } }] }],
    };
    expect(extractMetaTextMessages(p, "123")).toEqual([
      { id: "wamid.a", from: "5218112345678", name: "María", body: "Me interesa una CR-V" },
    ]);
    expect(extractMetaTextMessages(p, "other")).toHaveLength(0);
  });
  it("unifica la variante mexicana 521 con 52", () => {
    expect(normalizeWhatsAppPhone("5218112345678")).toBe("528112345678");
    expect(normalizeWhatsAppPhone("528112345678")).toBe("528112345678");
  });
});
