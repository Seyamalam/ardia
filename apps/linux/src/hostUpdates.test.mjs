import assert from "node:assert/strict";
import test from "node:test";
import { CHECK_EVERY_MS, FIRST_CHECK_AFTER_MS, UPDATE_CHECK_LOCK, UPDATE_PREFERENCES, linuxSwitchesFetch, linuxUpdater, scheduleUpdateChecks } from "./hostUpdates.ts";
import { compareVersions, linuxReleases, newestRelease } from "./updateReleases.ts";
import { takeUpdateCounts } from "../../browser/src/state/telemetry/updateCounts.ts";

const page = (tag) => `https://github.com/ardia-browser/ardia/releases/tag/${tag}`;
const release = (tag, { prerelease = false, draft = false, assets = [`Ardia-${tag.replace(/^v/, "")}-linux-x64.tar.xz`] } = {}) =>
  ({ tag_name: tag, html_url: page(tag), prerelease, draft, assets: assets.map((name) => ({ name })) });
const LIST = [
  release("engine-0be922b5d707", { prerelease: true, assets: ["ArdiaCore-0be922b5d707-linux-x64.tar.xz"] }),
  release("v0.2.47-nightly.3", { prerelease: true }),
  release("v0.2.47-nightly.2", { prerelease: true }),
  release("v0.2.46", { assets: ["Ardia-0.2.46.dmg", "Ardia-0.2.46-linux-x64.tar.xz", "Ardia-0.2.46-linux-x64.deb"] }),
  release("v0.2.48", { assets: ["Ardia-0.2.48.dmg"] }),
  release("v0.2.49", { draft: true }),
  { ...release("v0.2.50"), html_url: "https://evil.example/ardia" },
];

test("release tags compare by version, nightly builds before their stable release", () => {
  assert.equal(compareVersions("0.2.46", "0.2.46-nightly.9"), 1);
  assert.equal(compareVersions("0.2.47-nightly.2", "0.2.46"), 1);
  assert.equal(compareVersions("0.2.47-nightly.10", "0.2.47-nightly.9"), 1);
  assert.equal(compareVersions("0.10.0", "0.9.9"), 1);
  assert.equal(compareVersions("0.2.46", "0.2.46"), 0);
});

test("only published releases with a Linux package and a GitHub release page count, newest per channel", () => {
  const releases = linuxReleases(JSON.stringify(LIST));
  assert.deepEqual(releases.map((r) => r.version), ["0.2.47-nightly.3", "0.2.47-nightly.2", "0.2.46"]);
  assert.equal(newestRelease(releases, "stable")?.version, "0.2.46");
  assert.equal(newestRelease(releases, "nightly")?.version, "0.2.47-nightly.3");
  assert.throws(() => linuxReleases("{}"), /not a list/);
});

function harness({ version = "0.2.45", body = JSON.stringify(LIST), status = 200, launch = {}, capabilities = ["ArdiaUpdates.releases"] } = {}) {
  const docs = new Map();
  const seen = { asked: [], told: [], offered: [], opened: [], requests: 0 };
  const host = {
    bootstrap: { launchConfig: launch, capabilities },
    invoke: async (method) => {
      assert.equal(method, "ArdiaUpdates.releases");
      seen.requests++;
      return { status, body };
    },
  };
  const updater = linuxUpdater({
    host,
    appVersion: () => version,
    read: (name) => docs.get(name) ?? null,
    write: (name, contents) => docs.set(name, contents),
    ask: async (r, current) => (seen.asked.push([r.version, current]), true),
    tell: async (title) => void seen.told.push(title),
    offer: (r) => void seen.offered.push(r.version),
    open: (url) => void seen.opened.push(url),
    now: () => 1_000,
  });
  return { updater, docs, seen };
}

test("Check Now finds the newest stable Linux release, offers its page and records the check", async () => {
  takeUpdateCounts();
  const { updater, docs, seen } = harness();
  await updater.methods.checkForUpdates();
  assert.deepEqual(seen.asked, [["0.2.46", "0.2.45"]]);
  assert.deepEqual(seen.opened, [page("v0.2.46")]);
  const state = await updater.methods.updaterState();
  assert.equal(state.configured, true);
  assert.equal(state.lastCheck, 1_000);
  assert.deepEqual(state.switchCheck, { phase: "found", channel: "stable", version: "0.2.46" });
  assert.equal(state.automaticDownloads, false);
  assert.equal(JSON.parse(docs.get(UPDATE_PREFERENCES)).lastCheck, 1_000);
  const counts = takeUpdateCounts();
  assert.equal(counts.update_checks_asked, 1);
  assert.equal(counts.update_checks_found, 1);
  assert.equal(counts.update_release_page_opens, 1);
});

test("a nightly build follows nightly releases, and switching channel checks again", async () => {
  const { updater, seen } = harness({ version: "0.2.47-nightly.2" });
  assert.equal((await updater.methods.updaterState()).channel, "nightly");
  await updater.methods.checkForUpdates();
  assert.deepEqual(seen.asked.at(-1), ["0.2.47-nightly.3", "0.2.47-nightly.2"]);
  await updater.methods.setUpdateChannel("stable");
  assert.equal((await updater.methods.updaterState()).channel, "stable");
  assert.deepEqual(seen.told, ["Ardia is up to date"], "0.2.46 is older than this nightly");
});

test("an automatic check offers a new release once and never opens a dialog", async () => {
  const { updater, seen } = harness();
  await updater.check(false);
  await updater.check(false);
  assert.deepEqual(seen.offered, ["0.2.46"]);
  assert.deepEqual(seen.asked, []);
});

test("a failed check says so when asked, counts the failure and shows failed in Settings", async () => {
  takeUpdateCounts();
  const { updater, seen } = harness({ status: 0, body: "" });
  await updater.methods.checkForUpdates();
  assert.deepEqual(seen.told, ["Ardia couldn't check for updates"]);
  assert.equal((await updater.methods.updaterState()).switchCheck.phase, "failed");
  assert.equal(takeUpdateCounts().update_check_failures, 1);
});

test("a dev build without a release version isn't set up to update and never asks GitHub", async () => {
  const { updater, seen } = harness({ version: "157.0.8103.50" });
  assert.equal((await updater.methods.updaterState()).configured, false);
  await updater.methods.checkForUpdates();
  assert.equal(seen.requests, 0);
  assert.equal(updater.checksByItself(), false);
});

test("automatic checks stay off in hidden instances and when turned off, and run in one window only", async () => {
  assert.equal(harness({ launch: { background: true } }).updater.checksByItself(), false);
  const { updater } = harness();
  assert.equal(updater.checksByItself(), true);
  await updater.methods.setAutomaticUpdateChecks(false);
  assert.equal(updater.checksByItself(), false);
  const requested = [];
  const timers = { setTimeout: (fn, ms) => requested.push(["timeout", ms]), setInterval: (fn, ms) => requested.push(["interval", ms]) };
  scheduleUpdateChecks(updater, { locks: { request: (name, callback) => (requested.push(["lock", name]), callback(), new Promise(() => {})) }, timers });
  assert.deepEqual(requested, [["lock", UPDATE_CHECK_LOCK], ["timeout", FIRST_CHECK_AFTER_MS], ["interval", CHECK_EVERY_MS]]);
});

test("the kill-switch file comes through the native host and every other fetch is left alone", async () => {
  const calls = [];
  const host = { bootstrap: { capabilities: ["ArdiaShell.fetchKillSwitches"] }, invoke: async (method) => (calls.push(method), { status: 200, body: "{\"version\":1,\"switches\":{}}" }) };
  const original = async (input) => new Response(`original ${input}`);
  const fetchFn = linuxSwitchesFetch(host, original);
  assert.equal(await (await fetchFn("https://ardia.dev/switches.json")).text(), "{\"version\":1,\"switches\":{}}");
  assert.equal(await (await fetchFn("https://example.com/")).text(), "original https://example.com/");
  assert.deepEqual(calls, ["ArdiaShell.fetchKillSwitches"]);
  const refused = linuxSwitchesFetch({ ...host, invoke: async () => ({ status: 0, body: "" }) }, original);
  await assert.rejects(refused("https://ardia.dev/switches.json"), TypeError);
});

test("the switch refresh through the native host updates the cached switches", async () => {
  globalThis.__DEV__ = false;
  await import("../../browser/src/test-native/index.ts");
  const { refreshSwitches, resetRefreshForTests } = await import("../../browser/src/platform/killSwitches.ts");
  resetRefreshForTests();
  const host = { bootstrap: { capabilities: [] }, invoke: async () => ({ status: 200, body: JSON.stringify({ version: 1, switches: { newTabPrewarm: false } }) }) };
  assert.equal(await refreshSwitches(linuxSwitchesFetch(host, async () => { throw new Error("the shell can't fetch"); })), "updated");
});
