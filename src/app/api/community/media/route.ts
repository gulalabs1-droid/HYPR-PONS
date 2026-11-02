// The community session cookie is scoped to /api/community. Serve recording
// actions here so the browser sends the same sign-in used for chat and follows.
export { GET, POST } from "@/app/api/media/route";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
