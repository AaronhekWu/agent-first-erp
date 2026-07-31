import { listFollowupOverview } from "@/lib/api/followups";
import { FollowupsShell } from "@/components/followups/followups-shell";
import { AiFollowupWorkbench } from "@/components/followups/ai-followup-workbench";
import { Tabs } from "@/components/settings/tabs";

export const dynamic = "force-dynamic";

export default async function FollowupsPage({ searchParams }: { searchParams: { tab?: string } }) {
  const overview = await listFollowupOverview();
  return (
    <div className="space-y-4 p-6">
      <div>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">智能跟进系统</h1>
          <p className="mt-1 text-sm text-slate-500">
            日常跟进闭环与基于学员 Ontology 知识图谱的 AI 推进话术
          </p>
        </div>
      </div>
      <Tabs
        defaultActiveKey={searchParams.tab === "ai" ? "ai" : "smart"}
        queryParam="tab"
        tabs={[
          { key: "smart", label: "智能跟进系统", content: <FollowupsShell overview={overview} /> },
          { key: "ai", label: "AI 知识图谱话术", content: <AiFollowupWorkbench overview={overview} model="deepseek-v4-flash" /> },
        ]}
      />
    </div>
  );
}
