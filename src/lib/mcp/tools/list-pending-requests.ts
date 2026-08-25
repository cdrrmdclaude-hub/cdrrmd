import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_pending_requests",
  title: "List pending requests (admin)",
  description:
    "List pending requests across all employees. Only returns rows the signed-in user is allowed to see, so non-admins see only their own.",
  inputSchema: {
    limit: z.number().int().optional().describe("Maximum number of requests to return (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const capped = Math.min(Math.max(limit ?? 50, 1), 200);
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("requests")
      .select(
        "id,employee_id,type,leave_type_id,start_date,end_date,start_time,end_time,hours,days,reason,status,submitted_at",
      )
      .eq("status", "pending")
      .order("submitted_at", { ascending: false })
      .limit(capped);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { requests: data ?? [] },
    };
  },
});
