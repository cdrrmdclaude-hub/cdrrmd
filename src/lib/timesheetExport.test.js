import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { totalLeaveCell } from "./timesheetExport";

// Mirrors the row shape produced by doExportExcel in src/HRApp.jsx
// for the "Balance Summary" sheet.
function buildBalanceSummarySheet(employees, balances) {
  const rows = employees.map((emp) => ({
    "Employee Name": emp.name,
    "Employment Status": emp.employmentStatus || "Regular",
    "Total Leave (days)": totalLeaveCell(
      emp.employmentStatus,
      balances[emp.id] || {}
    ),
  }));
  return XLSX.utils.json_to_sheet(rows);
}

const balances = {
  e1: { leaveBalances: { vacation: 5, sick: 3 } },
  e2: { leaveBalances: { vacation: 10 } },
  e3: { leaveBalances: { vacation: 7 } },
  e4: { leaveBalances: { vacation: 2 } },
};

const employees = [
  { id: "e1", name: "Alice",   employmentStatus: "Regular" },
  { id: "e2", name: "Bob",     employmentStatus: "Casual" },
  { id: "e3", name: "Carol",   employmentStatus: "Job Order" },
  { id: "e4", name: "Dan",     employmentStatus: "Service Contract" },
  { id: "e5", name: "NoBal",   employmentStatus: "Job Order" },
];

describe("totalLeaveCell", () => {
  it("returns numeric total for Regular employees", () => {
    expect(totalLeaveCell("Regular", balances.e1)).toBe(8);
  });
  it("returns numeric total for Casual employees", () => {
    expect(totalLeaveCell("Casual", balances.e2)).toBe(10);
  });
  it("returns 'N/A' for Job Order employees", () => {
    expect(totalLeaveCell("Job Order", balances.e3)).toBe("N/A");
  });
  it("returns 'N/A' for Service Contract employees", () => {
    expect(totalLeaveCell("Service Contract", balances.e4)).toBe("N/A");
  });
  it("returns 'N/A' even when no balance record exists", () => {
    expect(totalLeaveCell("Job Order", {})).toBe("N/A");
    expect(totalLeaveCell("Service Contract", undefined)).toBe("N/A");
  });
  it("defaults missing status to Regular (numeric)", () => {
    expect(totalLeaveCell(undefined, balances.e1)).toBe(8);
  });
});

describe("Balance Summary Excel sheet", () => {
  it("outputs 'N/A' (never blank) for Job Order and Service Contract rows", () => {
    const sheet = buildBalanceSummarySheet(employees, balances);
    const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    const byName = Object.fromEntries(json.map((r) => [r["Employee Name"], r]));

    // Eligible statuses -> numeric
    expect(byName.Alice["Total Leave (days)"]).toBe(8);
    expect(byName.Bob["Total Leave (days)"]).toBe(10);

    // Ineligible statuses -> literal "N/A", not blank/undefined/0
    for (const name of ["Carol", "Dan", "NoBal"]) {
      const cell = byName[name]["Total Leave (days)"];
      expect(cell).toBe("N/A");
      expect(cell).not.toBe("");
      expect(cell).not.toBe(0);
      expect(cell).not.toBeUndefined();
    }
  });

  it("writes 'N/A' as a string cell in the workbook (not a blank cell)", () => {
    const sheet = buildBalanceSummarySheet(employees, balances);
    // Header row is row 1; Carol is the 3rd data row -> row 4, column C.
    const carolCell = sheet["C4"];
    expect(carolCell).toBeDefined();
    expect(carolCell.t).toBe("s"); // string type
    expect(carolCell.v).toBe("N/A");
  });
});
