'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadIndex } = require('./helpers/loadIndex.js');

// 最小構成のPCM WAV(RIFF/WAVE, fmt + data のみ)を手組みで生成する。
function buildWavBuffer(sampleRate, bitsPerSample, channels, durationSec) {
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const dataBytes = Math.round(byteRate * durationSec);
  const data = Buffer.alloc(dataBytes);

  const fmt = Buffer.alloc(16);
  fmt.writeUInt16LE(1, 0); // PCM
  fmt.writeUInt16LE(channels, 2);
  fmt.writeUInt32LE(sampleRate, 4);
  fmt.writeUInt32LE(byteRate, 8);
  fmt.writeUInt16LE(blockAlign, 12);
  fmt.writeUInt16LE(bitsPerSample, 14);

  function chunk(id, buf) {
    const h = Buffer.alloc(8);
    h.write(id, 0, 'ascii');
    h.writeUInt32LE(buf.length, 4);
    return Buffer.concat([h, buf]);
  }

  const body = Buffer.concat([chunk('fmt ', fmt), chunk('data', data)]);
  const riffHeader = Buffer.alloc(12);
  riffHeader.write('RIFF', 0, 'ascii');
  riffHeader.writeUInt32LE(4 + body.length, 4);
  riffHeader.write('WAVE', 8, 'ascii');
  return Buffer.concat([riffHeader, body]);
}

test('wavDurationSec: sz/byteRate で秒数を計算する', (t) => {
  const api = loadIndex();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voicedesk-wav-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const p = path.join(dir, 't.wav');
  fs.writeFileSync(p, buildWavBuffer(44100, 16, 1, 2));
  assert.equal(api.wavDurationSec(p), 2);
});

test('wavDurationSec: ステレオ・別サンプルレートでも正しく計算する', (t) => {
  const api = loadIndex();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voicedesk-wav-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const p = path.join(dir, 't2.wav');
  fs.writeFileSync(p, buildWavBuffer(48000, 16, 2, 1.5));
  assert.equal(api.wavDurationSec(p), 1.5);
});

test('wavDurationSec: RIFFヘッダでないファイルは既定値3を返す', (t) => {
  const api = loadIndex();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voicedesk-wav-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const p = path.join(dir, 'notwav.wav');
  fs.writeFileSync(p, 'this is not a wav file');
  assert.equal(api.wavDurationSec(p), 3);
});

test('wavDurationSec: ファイルが存在しない場合は既定値3を返す', () => {
  const api = loadIndex();
  const p = path.join(os.tmpdir(), 'voicedesk-does-not-exist.wav');
  assert.equal(api.wavDurationSec(p), 3);
});
