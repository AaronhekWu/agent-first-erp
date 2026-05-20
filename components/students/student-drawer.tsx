"use client";

import { X, ExternalLink, User } from "lucide-react";
import Link from "next/link";
import type { StudentRow } from "@/lib/api/students";
import {
  formatCurrency,
  formatDate,
  followupTypeLabel,
} from "@/lib/format";
import { StatusBadge } from "./status-badge";

interface Props {
  student: StudentRow | null;
  onClose: () => void;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
  );
}

export function StudentDrawer({ student, onClose }: Props) {
  if (!student) return null;
  return (
    <>
      <div
        className="fixed inset-0 z-30 bg-slate-900/20"
        onClick={onClose}
        aria-hidden
      />
      <aside className="fixed right-0 top-0 z-40 flex h-screen w-[360px] flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-800">学员摘要</h3>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col items-center gap-2 px-5 py-5">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-sky-200 to-indigo-300 text-2xl text-white">
            <User className="h-8 w-8" />
          </div>
          <div className="text-lg font-semibold text-slate-900">
            {student.name}
          </div>
          <StatusBadge status={student.status} />
        </div>

        <div className="flex-1 overflow-y-auto px-5">
          <div className="divide-y divide-slate-100">
            <Row
              label="学员编号"
              value={student.student_code ?? "—"}
            />
            <Row
              label="顾问"
              value={student.counselor_name ?? "—"}
            />
            <Row
              label="当前余额"
              value={
                <span
                  className={
                    Number(student.balance) < 0 ? "text-red-500" : "text-amber-600"
                  }
                >
                  {formatCurrency(student.balance)}
                </span>
              }
            />
            <Row
              label="累计充值"
              value={formatCurrency(student.total_recharged)}
            />
            <Row
              label="在读课程"
              value={`${student.active_enrollment_count} 门`}
            />
            <Row
              label="最后跟进"
              value={
                student.last_followup_at ? (
                  <div className="text-right leading-tight">
                    <div>{formatDate(student.last_followup_at, true)}</div>
                    <div className="text-xs text-slate-400">
                      {student.counselor_name ?? "—"}{" "}
                      {followupTypeLabel(student.last_followup_type)}
                    </div>
                  </div>
                ) : (
                  "—"
                )
              }
            />
            <Row
              label="创建时间"
              value={formatDate(student.created_at, true)}
            />
          </div>
        </div>

        <div className="border-t border-slate-100 p-5">
          <Link
            href={`/students/${student.id}`}
            onClick={onClose}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-brand-600 text-sm font-medium text-white hover:bg-brand-700"
          >
            <ExternalLink className="h-4 w-4" />
            进入完整详情
          </Link>
        </div>
      </aside>
    </>
  );
}
