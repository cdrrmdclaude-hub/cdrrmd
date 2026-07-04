// Pure helpers for the Timesheet Excel export.
// Extracted so that export behavior can be covered by unit tests.

export const LEAVE_ELIGIBLE_STATUSES = ["Regular", "Casual"];

export function totalLeaveRemaining(bal) {
  const m = (bal && bal.leaveBalances) || {};
  return Object.values(m).reduce((s, v) => s + (v || 0), 0);
}

// Returns the value that belongs in the Balance Summary sheet's
// "Total Leave (days)" column for a given employee.
// Job Order / Service Contract employees do not accrue leave, so
// we emit an explicit "N/A" instead of a blank cell.
export function totalLeaveCell(employmentStatus, balance) {
  const status = employmentStatus || "Regular";
  if (!LEAVE_ELIGIBLE_STATUSES.includes(status)) return "N/A";
  return totalLeaveRemaining(balance || {});
}
