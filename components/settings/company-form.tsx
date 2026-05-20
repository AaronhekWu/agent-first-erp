"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Save } from "lucide-react";
import { Field, inputCls, textareaCls } from "@/components/ui/form";
import { PhoneInput } from "@/components/ui/phone-input";
import { updateCompany } from "@/lib/api/create";
import { isValidPhone } from "@/lib/format";
import type { Company } from "@/lib/api/company";

export function CompanyForm({ company }: { company: Company | null }) {
  const router = useRouter();
  const [name, setName] = useState(company?.name ?? "");
  const [slogan, setSlogan] = useState(company?.slogan ?? "");
  const [contactPhone, setContactPhone] = useState(company?.contact_phone ?? "");
  const [contactEmail, setContactEmail] = useState(company?.contact_email ?? "");
  const [address, setAddress] = useState(company?.address ?? "");
  const [logoUrl, setLogoUrl] = useState(company?.logo_url ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!isValidPhone(contactPhone)) {
      setError("INVALID_INPUT: 联系电话必须为 6-15 位数字");
      return;
    }
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await updateCompany({
        p_name: name.trim() || null,
        p_slogan: slogan.trim() || null,
        p_contact_phone: contactPhone || null,
        p_contact_email: contactEmail.trim() || null,
        p_address: address.trim() || null,
        p_logo_url: logoUrl.trim() || null,
      });
      setMessage("已保存");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-700">
        <Building2 className="h-4 w-4 text-blue-500" />
        机构信息
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="公司 / 机构名称" required className="col-span-2">
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如 墨曦教育"
          />
        </Field>
        <Field label="品牌口号" className="col-span-2">
          <input
            className={inputCls}
            value={slogan}
            onChange={(e) => setSlogan(e.target.value)}
            placeholder="一句话品牌主张"
          />
        </Field>
        <Field label="联系电话">
          <PhoneInput value={contactPhone} onChange={setContactPhone} placeholder="4000000000" />
        </Field>
        <Field label="联系邮箱">
          <input
            type="email"
            className={inputCls}
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="hello@moxi.edu"
          />
        </Field>
        <Field label="公司地址" className="col-span-2">
          <textarea
            className={textareaCls}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="如 上海市徐汇区 ..."
          />
        </Field>
        <Field label="Logo URL" className="col-span-2">
          <input
            className={inputCls}
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://..."
          />
        </Field>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={submit}
          disabled={submitting}
          className="inline-flex h-10 items-center gap-1.5 rounded-md bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {submitting ? "保存中…" : "保存修改"}
        </button>
        {error && <span className="text-xs text-red-500">{error}</span>}
        {message && <span className="text-xs text-emerald-600">{message}</span>}
      </div>
    </div>
  );
}
