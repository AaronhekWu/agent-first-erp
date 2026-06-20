"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ListPagination } from "./list-pagination";

export function UrlListPagination({ page, pageSize, totalItems }: { page: number; pageSize: number; totalItems: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const navigate = (nextPage: number, nextPageSize = pageSize) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(nextPage));
    params.set("pageSize", String(nextPageSize));
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <ListPagination
      page={page}
      pageSize={pageSize}
      totalItems={totalItems}
      onPageChange={(value) => navigate(value)}
      onPageSizeChange={(value) => navigate(1, value)}
    />
  );
}
