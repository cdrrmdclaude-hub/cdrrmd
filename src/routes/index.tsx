import { createFileRoute } from "@tanstack/react-router";
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
