import { GoalsClient } from "@/components/goals/goals-client";
import { requireUser } from "@/lib/auth";
import type { ActivityLog, Goal, GoalMovement, Profile, SharedItem } from "@/lib/domain/app-types";

async function loadVisibleProfiles(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], userId: string): Promise<Profile[]> {
  const rpc = await supabase.rpc("visible_profiles_for_user");
  if (!rpc.error) return (rpc.data || []) as Profile[];

  const own = await supabase.from("profiles").select("id,email,display_name,avatar_url").eq("id", userId);
  return (own.data || []) as Profile[];
}

export default async function GoalsPage() {
  const { supabase, user } = await requireUser();

  const { data: goalsData } = await supabase
    .from("goals")
    .select("*")
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });

  const goals = (goalsData || []) as Goal[];
  const goalIds = goals.map((goal: Goal) => goal.id);

  const [{ data: movements }, { data: shares }, { data: activityLogs }, profiles] = await Promise.all([
    goalIds.length
      ? supabase.from("goal_movements").select("*").in("goal_id", goalIds).eq("is_deleted", false).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    goalIds.length
      ? supabase.from("shared_items").select("*").eq("item_type", "goal").in("item_id", goalIds).order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
    goalIds.length
      ? supabase.from("activity_logs").select("*").in("entity_type", ["goal", "goal_movement"]).order("created_at", { ascending: false }).limit(120)
      : Promise.resolve({ data: [] }),
    loadVisibleProfiles(supabase, user.id)
  ]);

  return (
    <GoalsClient
      currentUserId={user.id}
      goals={goals}
      movements={(movements || []) as GoalMovement[]}
      shares={(shares || []) as SharedItem[]}
      activityLogs={(activityLogs || []) as ActivityLog[]}
      profiles={profiles}
    />
  );
}
