import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../public/js/dashboard.js', import.meta.url), 'utf8');
const initialize = source.slice(source.indexOf('function initializeHlsPlayers()'), source.indexOf('function applyStreamExpansion()'));

function setup(saved) {
  const storage = new Map(saved ? [['stream-audio:ria-broadcast', JSON.stringify(saved)]] : []);
  const listeners = {};
  const video = {
    dataset: { hlsUrl: 'https://example.com/live.m3u8' },
    volume: 1, muted: false,
    closest: () => ({ dataset: { streamKey: 'ria-broadcast' } }),
    addEventListener: (name, callback) => { listeners[name] = callback; },
    canPlayType: () => '',
    play: () => Promise.resolve(),
  };
  class Hls {
    static isSupported = () => true;
    static Events = { MANIFEST_PARSED: 'manifest', ERROR: 'error' };
    static ErrorTypes = { NETWORK_ERROR: 'network', MEDIA_ERROR: 'media' };
    handlers = {};
    retries = 0;
    recoveries = 0;
    loadSource() {}
    attachMedia() {}
    on(name, callback) { this.handlers[name] = callback; }
    startLoad() { this.retries++; }
    recoverMediaError() { this.recoveries++; }
  }
  const players = [];
  vm.runInNewContext(`${initialize}\ninitializeHlsPlayers();`, {
    document: { querySelectorAll: () => [video] },
    window: { Hls }, hlsPlayers: players,
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  });
  return { video, player: players[0], storage, listeners };
}

test('stream starts with sound and retains the selected audio settings after restart', () => {
  const { video, listeners, storage } = setup();
  assert.equal(video.muted, false);
  assert.equal(video.volume, 1);
  video.volume = 0.35;
  video.muted = true;
  listeners.volumechange();
  const restarted = setup(JSON.parse(storage.get('stream-audio:ria-broadcast')));
  assert.equal(restarted.video.volume, 0.35);
  assert.equal(restarted.video.muted, true);
});

test('network and media recovery preserve audio settings', () => {
  const { video, player } = setup({ volume: 0.6, muted: false });
  player.handlers.error(null, { fatal: false, type: 'network' });
  assert.equal(player.retries, 0);
  player.handlers.error(null, { fatal: true, type: 'network' });
  player.handlers.error(null, { fatal: true, type: 'media' });
  assert.equal(player.retries, 1);
  assert.equal(player.recoveries, 1);
  assert.equal(video.volume, 0.6);
  assert.equal(video.muted, false);
});
