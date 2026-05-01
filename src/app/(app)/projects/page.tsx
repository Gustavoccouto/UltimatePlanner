import { ProjectsClient } from "@/components/projects/projects-client";
import { requireUser } from "@/lib/auth";
import type { ActivityLog, Profile, Project, ProjectItem, ProjectMovement, SharedItem } from "@/lib/domain/app-types";

async function loadVisibleProfiles(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], userId: string): Promise<Profile[]> {
  const rpc = await supabase.rpc("visible_profiles_for_user");
  if (!rpc.error) return (rpc.data || []) as Profile[];

  const own = await supabase.from("profiles").select("id,email,display_name,avatar_url").eq("id", userId);
  return (own.data || []) as Profile[];
}

export default async function ProjectsPage() {
  const { supabase, user } = await requireUser();

  const { data: projectsData } = await supabase
    .from("projects")
    .select("*")
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });

  const projects = (projectsData || []) as Project[];
  const projectIds = projects.map((project: Project) => project.id);

  const [{ data: items }, { data: movements }, { data: shares }, { data: activityLogs }, profiles] = await Promise.all([
    projectIds.length
      ? supabase.from("project_items").select("*").in("project_id", projectIds).eq("is_deleted", false).order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
    projectIds.length
      ? supabase.from("project_movements").select("*").in("project_id", projectIds).eq("is_deleted", false).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    projectIds.length
      ? supabase.from("shared_items").select("*").eq("item_type", "project").in("item_id", projectIds).order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
    projectIds.length
      ? supabase.from("activity_logs").select("*").in("entity_type", ["project", "project_item", "project_movement"]).order("created_at", { ascending: false }).limit(120)
      : Promise.resolve({ data: [] }),
    loadVisibleProfiles(supabase, user.id)
  ]);

  return (
    <ProjectsClient
      currentUserId={user.id}
      projects={projects}
      items={(items || []) as ProjectItem[]}
      movements={(movements || []) as ProjectMovement[]}
      shares={(shares || []) as SharedItem[]}
      activityLogs={(activityLogs || []) as ActivityLog[]}
      profiles={profiles}
    />
  );
}
