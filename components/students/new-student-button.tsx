"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { NewStudentModal } from "./new-student-modal";
import type { Counselor, Department } from "@/lib/api/students";

export function NewStudentButton({
  counselors,
  departments,
}: {
  counselors: Counselor[];
  departments: Department[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-1.5 rounded-md bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
      >
        <Plus className="h-4 w-4" />
        新增学员
      </button>
      <NewStudentModal
        open={open}
        onClose={() => setOpen(false)}
        counselors={counselors}
        departments={departments}
      />
    </>
  );
}
