import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiContext, jsonError, parseJson } from "@/lib/http/api";
import { runFinancialAudit } from "@/lib/server/financial-audit";

const bodySchema = z.object({ repair: z.boolean().optional().default(false) });

export async function GET() {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  try {
    const data = await runFinancialAudit(context.supabase, context.user.id, { repair: false });
    return NextResponse.json({ data });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível auditar os dados financeiros.", 500);
  }
}

export async function POST(request: Request) {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, bodySchema);
    const data = await runFinancialAudit(context.supabase, context.user.id, { repair: payload.repair });
    return NextResponse.json({ data });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível revisar os dados financeiros.", 500);
  }
}
