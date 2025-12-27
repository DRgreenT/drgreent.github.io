import { sb, getSession } from "./supabaseClient.js";

export async function signIn(email, password) {
  return sb.auth.signInWithPassword({ email, password });
}

export async function signUp(email, password) {
  return sb.auth.signUp({ email, password });
}

export async function signOut() {
  return sb.auth.signOut();
}

export async function isAdminUser() {
  const session = await getSession();
  if (!session) return false;

  // This select is allowed only if row.user_id == auth.uid() (policy)
  const { data, error } = await sb
    .from("admin_users")
    .select("user_id")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (error) return false;
  return !!data?.user_id;
}
