import { env } from "../../env.js";
import { adminStanding } from "../testMode/index.js";
import { featureMode, videoInvitesVisibleTo } from "./policy.js";

/**
 * Whether this signed-in account sees and can use video invites, computed on
 * the SERVER from VIDEO_INVITES and the database role (never the JWT). The web
 * reads it from /auth/me `features.videoInvites`; the host routes 404 when it
 * is false, exactly as if the feature were off.
 */
export async function videoInvitesVisible(userId: string): Promise<boolean> {
  const mode = featureMode(env.VIDEO_INVITES);
  if (mode === "off") return false;
  if (mode === "on") return true;
  return videoInvitesVisibleTo(mode, await adminStanding(userId));
}
