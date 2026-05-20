"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { NewCourseModal } from "./new-course-modal";
import type { Department } from "@/lib/api/students";

export function NewCourseButton({ departments }: { departments: Department[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-1.5 rounded-md bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
      >
        <Plus className="h-4 w-4" />
        新增课程
      </button>
      <NewCourseModal open={open} onClose={() => setOpen(false)} departments={departments} />
    </>
  );
}
