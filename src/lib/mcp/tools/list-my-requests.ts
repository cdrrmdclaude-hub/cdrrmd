import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_my_requests",
  title: "List my requests",
  description:
    "List the signed-in employee's leave, overtime, duty day-off and offset requests, optionally filtered by status.",
  inputSchema: {
    status: z
      .enum(["pending", "approved", "rejected"])
      .optional()
      .describe("Only return requests with this status."),
    limit: z.number().int().optional().describe("Maximum number of requests to return (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const capped = Math.min(Math.max(limit ?? 50, 1), 200);
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("requests")
      .select(
        "id,type,leave_type_id,start_date,end_date,start_time,end_time,hours,days,reason,status,decision_note,decided_at,submitted_at",
      )
      .eq("employee_id", ctx.getUserId())
      .order("submitted_at", { ascending: false })
      .limit(capped);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { requests: data ?? [] },
    };
  },
});
