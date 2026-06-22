import { createFileRoute } from "@tanstack/react-router";
// @ts-expect-error - JS module without type declarations
import HRApp from "../HRApp.jsx";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "HR Portal" },
      { name: "description", content: "Employee leave, overtime, and timesheet management." },
    ],
  }),
  component: HRApp,
});
