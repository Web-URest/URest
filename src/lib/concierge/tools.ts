import type Anthropic from "@anthropic-ai/sdk";

// Tool definitions (strict: true) — schemas from AI_CONCIERGE_SPEC §2.
// Handlers are stubs returning is_error until issue #31 wires real DB queries.
export const CONCIERGE_TOOLS: Anthropic.Tool[] = [
  {
    name: "search_listings",
    description:
      "Search real, published villa inventory. Call when the guest describes what they want (region, dates, group size, budget, amenities like สไลเดอร์/คาราโอเกะ/สัตว์เลี้ยง). Never describe villas from memory — always search first.",
    input_schema: {
      type: "object",
      properties: {
        region: { type: "string", description: "Region slug, e.g. pattaya" },
        check_in: { type: "string" },
        check_out: { type: "string" },
        guests: { type: "integer" },
        max_price_per_night: {
          type: "integer",
          description: "THB",
        },
        amenities: { type: "array", items: { type: "string" } },
        query: {
          type: "string",
          description: "Free-text semantic query in Thai or English",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "check_availability",
    description:
      "Live calendar check + exact quoted price for specific dates on one listing. Call before ever stating availability or a total price — quoted prices come only from this tool.",
    input_schema: {
      type: "object",
      properties: {
        listing_id: { type: "string" },
        check_in: { type: "string" },
        check_out: { type: "string" },
        guests: { type: "integer" },
      },
      required: ["listing_id", "check_in", "check_out", "guests"],
      additionalProperties: false,
    },
  },
  {
    name: "get_listing_details",
    description:
      "Full stored facts for one listing: amenities, pool specs, house rules & party policy, cancellation tier, booking mode, check-in/out times, capacity & fees, host response stats, host FAQ entries. Call whenever the guest asks ANY factual question about a specific villa.",
    input_schema: {
      type: "object",
      properties: { listing_id: { type: "string" } },
      required: ["listing_id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_nearby_attractions",
    description:
      "Curated points of interest near a listing (restaurants, beaches, markets). Call for 'มีอะไรกินแถวนั้น / เที่ยวไหนใกล้ๆ' questions. Only the returned entries may be recommended.",
    input_schema: {
      type: "object",
      properties: {
        listing_id: { type: "string" },
        category: {
          type: "string",
          enum: ["food", "beach", "activity", "shopping", "any"],
        },
      },
      required: ["listing_id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_saved_listings",
    description:
      "The guest's own saved villas (ที่บันทึกไว้). Call when the guest refers to villas they saved/hearted. Returns an empty list if the guest is logged out or has no saves.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "create_booking_draft",
    description:
      "Render the in-chat booking-summary confirmation card (dates, guests, per-night breakdown, total, house-rules note). Call when the guest has settled on a villa and dates. This does NOT create a booking.",
    input_schema: {
      type: "object",
      properties: {
        listing_id: { type: "string" },
        check_in: { type: "string" },
        check_out: { type: "string" },
        guests: { type: "integer" },
        note_to_host: { type: "string" },
      },
      required: ["listing_id", "check_in", "check_out", "guests"],
      additionalProperties: false,
    },
  },
  {
    name: "submit_booking_request",
    description:
      "Create the real booking request (REQUESTED state). Only callable after the guest tapped the confirmation card — requires the confirmation_token from that tap.",
    input_schema: {
      type: "object",
      properties: {
        draft_id: { type: "string" },
        confirmation_token: { type: "string" },
      },
      required: ["draft_id", "confirmation_token"],
      additionalProperties: false,
    },
  },
];

export type ToolInput = Record<string, unknown>;

// Stub handlers — replaced by real implementations in issue #31.
// All return is_error so the model apologizes and offers manual search.
export async function handleToolCall(
  name: string,
  input: ToolInput,
  userId: string | null,
): Promise<{ is_error: boolean; content: string }> {
  // Stubs — replaced in issue #31. Silence unused-var warnings on the params:
  void [name, input, userId];
  return {
    is_error: true,
    content:
      "ขออภัยค่ะ ระบบค้นหายังไม่พร้อมใช้งาน กรุณาลองค้นหาด้วยตัวเองผ่านหน้าค้นหาได้เลยค่ะ",
  };
}
