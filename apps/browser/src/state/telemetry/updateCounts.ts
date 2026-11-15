let checks = { asked: 0, automatic: 0, failed: 0, found: 0, pageOpens: 0, switchRefreshes: 0, switchRefreshFailures: 0, unsandboxed: 0 };

export function noteUpdateCheck(asked: boolean, outcome: "found" | "upToDate" | "failed") {
  if (asked) checks.asked += 1;
  else checks.automatic += 1;
  if (outcome === "failed") checks.failed += 1;
  if (outcome === "found") checks.found += 1;
}

export const noteUpdatePageOpened = () => void (checks.pageOpens += 1);

export function noteSwitchRefresh(result: "updated" | "failed" | "already") {
  if (result === "updated") checks.switchRefreshes += 1;
  if (result === "failed") checks.switchRefreshFailures += 1;
}

export const noteUnsandboxedLaunch = () => void (checks.unsandboxed += 1);

export function takeUpdateCounts() {
  const taken = {
    update_checks_asked: checks.asked,
    update_checks_automatic: checks.automatic,
    update_check_failures: checks.failed,
    update_checks_found: checks.found,
    update_release_page_opens: checks.pageOpens,
    kill_switch_refreshes: checks.switchRefreshes,
    kill_switch_refresh_failures: checks.switchRefreshFailures,
    launches_without_sandbox: checks.unsandboxed,
  };
  checks = { asked: 0, automatic: 0, failed: 0, found: 0, pageOpens: 0, switchRefreshes: 0, switchRefreshFailures: 0, unsandboxed: 0 };
  return taken;
}
