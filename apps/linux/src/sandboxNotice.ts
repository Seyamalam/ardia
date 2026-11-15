import type { ArdiaHost } from "./host";
import type { LaunchClaim } from "./appServices";
import { showToast } from "../../browser/src/state/app/toasts";
import { noteUnsandboxedLaunch } from "../../browser/src/state/telemetry/updateCounts.ts";

export function sandboxNotice(decision: string | undefined): { title: string; message: string } | null {
  if (!decision) return null;
  const reason = decision.replace(/\s+/g, " ").trim().slice(0, 300);
  return {
    title: "Ardia is running without Chromium's sandbox",
    message: `${reason}. Install Ardia's .deb, or run its tarball's install.sh with sudo, to turn the sandbox on.`,
  };
}

export async function noticeUnsandboxedLaunch(host: ArdiaHost, windowId: string, launch: Promise<LaunchClaim>, show = showToast) {
  const notice = sandboxNotice(host.bootstrap.sandboxDecision);
  if (!notice || (await launch) !== "ran") return false;
  noteUnsandboxedLaunch();
  show(windowId, notice.title, notice.message, { icon: "exclamationmark.triangle", sticky: true, key: "linux-sandbox" });
  return true;
}
