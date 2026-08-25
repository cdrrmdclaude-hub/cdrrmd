import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_my_balances",
  title: "Get my balances",
  description:
    "Get the signed-in employee's overtime credits, duty day-off credits, offset hours used and per-leave-type day balances.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("leave_balances")
      .select("credits_overtime,credits_duty_off,offset_used,leave_balances,updated_at")
      .eq("user_id", ctx.getUserId())
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const balances = data ?? {
      credits_overtime: 0,
      credits_duty_off: 0,
      offset_used: 0,
      leave_balances: {},
    };
    const remaining =
      Number(balances.credits_overtime ?? 0) +
      Number(balances.credits_duty_off ?? 0) -
      Number(balances.offset_used ?? 0);
    const payload = { ...balances, remaining_ot_duty_credits_hours: remaining };
    return {
      content: [{ type: "text", text: JSON.stringify(payload) }],
      structuredContent: { balances: payload },
    };
  },
});
