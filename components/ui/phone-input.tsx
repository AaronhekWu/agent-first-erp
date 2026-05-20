"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { isValidPhone, sanitizePhone } from "@/lib/format";
import { inputCls } from "./form";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function PhoneInput({ value, onChange, placeholder, disabled }: Props) {
  const [touched, setTouched] = useState(false);
  const invalid = touched && value.length > 0 && !isValidPhone(value);
  return (
    <div className="space-y-1">
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(sanitizePhone(e.target.value))}
        onBlur={() => setTouched(true)}
        placeholder={placeholder ?? "13800000000"}
        className={cn(inputCls, invalid && "border-red-400 focus:border-red-500 focus:ring-red-100")}
      />
      {invalid && (
        <p className="text-[11px] text-red-500">手机号必须为 6-15 位数字</p>
      )}
    </div>
  );
}
