import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getMyProfile from "./tools/get-my-profile";
import getMyBalances from "./tools/get-my-balances";
import listLeaveTypes from "./tools/list-leave-types";
import listMyRequests from "./tools/list-my-requests";
import createRequest from "./tools/create-request";
import listPendingRequests from "./tools/list-pending-requests";

// The OAuth issuer must be the direct Supabase host; the project ref is the only
// value that survives publish unchanged.
const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "cdrrmd",
  title: "CDRRMD",
  version: "0.1.0",
  instructions:
    "Tools for the CDRRMD Time & Leave Management portal. Read the signed-in employee's profile, leave/overtime balances and requests, and submit new leave, overtime, duty day-off or offset requests. All data access runs as the signed-in user.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    getMyProfile,
    getMyBalances,
    listLeaveTypes,
    listMyRequests,
    createRequest,
    listPendingRequests,
  ],
});
