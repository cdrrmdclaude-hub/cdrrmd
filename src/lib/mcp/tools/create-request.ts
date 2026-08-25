import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "create_request",
  title: "Submit a request",
  description:
    "Submit a new request for the signed-in employee. Types: 'leave' (needs leave_type_id and days), 'overtime' or 'duty' (needs start_time/end_time and hours), 'offset' (needs days; hours = days x 8). Requests are created as pending and must be approved by an admin.",
  inputSchema: {
    type: z.enum(["leave", "overtime", "duty", "offset"]).describe("Request type."),
    start_date: z.string().describe("Start date in YYYY-MM-DD format."),
    end_date: z.string().describe("End date in YYYY-MM-DD format; must be on or after start_date."),
    reason: z.string().describe("Reason or purpose for the request."),
    leave_type_id: z.string().optional().describe("Leave type id, required when type is 'leave'."),
    start_time: z.string().optional().describe("Start time HH:MM, for overtime/duty."),
    end_time: z.string().optional().describe("End time HH:MM, for overtime/duty."),
    hours: z.number().optional().describe("Hours requested (0-24), for overtime/duty."),
    days: z.number().optional().describe("Days requested (0-365), for leave/offset."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    if (input.end_date < input.start_date) {
      return { content: [{ type: "text", text: "end_date must be on or after start_date." }], isError: true };
    }
    if (input.type === "leave" && !input.leave_type_id) {
      return { content: [{ type: "text", text: "leave_type_id is required for leave requests." }], isError: true };
    }

    const days = input.days ?? 0;
    const hours = input.type === "offset" ? days * 8 : (input.hours ?? 0);
    if (days < 0 || days > 365) {
      return { content: [{ type: "text", text: "days must be between 0 and 365." }], isError: true };
    }
    if (hours < 0 || hours > 24) {
      return { content: [{ type: "text", text: "hours must be between 0 and 24." }], isError: true };
    }

    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("requests")
      .insert({
        employee_id: ctx.getUserId(),
        type: input.type,
        leave_type_id: input.leave_type_id ?? null,
        start_date: input.start_date,
        end_date: input.end_date,
        start_time: input.start_time ?? null,
        end_time: input.end_time ?? null,
        hours,
        days,
        reason: input.reason,
        status: "pending",
      })
      .select("id,type,start_date,end_date,hours,days,status")
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { request: data },
    };
  },
});
