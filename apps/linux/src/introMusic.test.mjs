import assert from "node:assert/strict";
import test from "node:test";
import { introMusicSilenced, linuxIntroMusic } from "./introMusic.ts";
import { linuxModuleMethod } from "./hostSystem.ts";

const hostWith = (launchConfig, capabilities = []) => ({ bootstrap: { launchConfig, capabilities } });
const players = [];
const createPlayer = (src) => {
  const player = { src, volume: -1, paused: false, play: async () => {}, pause() { this.paused = true; }, addEventListener() {} };
  players.push(player);
  return player;
};
const track = async () => "/assets/IntroMusic-test.wav";

test("the intro music plays the bundled track, follows mute, and fades out on stop", async () => {
  players.length = 0;
  const music = linuxIntroMusic({ host: hostWith({}), track, createPlayer });
  await music.playIntroMusic({}, true);
  assert.equal(players.length, 1);
  assert.equal(players[0].src, "/assets/IntroMusic-test.wav");
  assert.equal(players[0].volume, 0, "a muted intro starts silent");
  await music.setIntroMusicMuted(false);
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(players[0].volume, 1);
  await music.stopIntroMusic(0);
  assert.equal(players[0].paused, true);
  assert.equal(players[0].volume, 0);
});

test("a hidden instance keeps quiet unless allowAudio is set, as on the Mac and Windows", async () => {
  assert.equal(introMusicSilenced(hostWith({ background: true })), true);
  assert.equal(introMusicSilenced(hostWith({ background: true, instance: { allowAudio: "1" } })), false);
  assert.equal(introMusicSilenced(hostWith({ background: true, instance: { allowAudio: "off" } })), true);
  assert.equal(introMusicSilenced(hostWith({})), false);
  players.length = 0;
  await linuxIntroMusic({ host: hostWith({ background: true }), track, createPlayer }).playIntroMusic({}, false);
  assert.equal(players.length, 0);
});

test("a track that won't play is reported once and leaves nothing playing", async () => {
  const played = [];
  const refusing = (src) => ({ ...createPlayer(src), play: async () => { throw new Error("NotAllowedError"); } });
  const music = linuxIntroMusic({ host: hostWith({}), track, createPlayer: refusing, onPlayed: (ok) => played.push(ok) });
  await music.playIntroMusic({}, false);
  await music.stopIntroMusic(0.4);
  assert.deepEqual(played, [false]);
});

test("the shell answers ArdiaApp's intro music calls itself instead of dropping them", () => {
  const host = hostWith({});
  for (const method of ["playIntroMusic", "setIntroMusicMuted", "stopIntroMusic"]) {
    assert.equal(typeof linuxModuleMethod(host, "ArdiaApp", method), "function");
  }
  assert.equal(linuxModuleMethod(host, "ArdiaApp", "playIntroMusic"), linuxModuleMethod(host, "ArdiaApp", "playIntroMusic"));
});
