import { AiConsultantClient } from "@/components/ai/ai-consultant-client";
import { requireUser } from "@/lib/auth";
import { buildCurrentFinancialContext, loadAiChatHistory } from "@/lib/server/financial-snapshot";

export default async function AiConsultantPage() {
  const { supabase, user } = await requireUser();
  const [{ aiContext }, messages] = await Promise.all([
    buildCurrentFinancialContext(supabase, user.id),
    loadAiChatHistory(supabase, user.id)
  ]);

  return <AiConsultantClient initialMessages={messages} initialContext={aiContext} />;
}
