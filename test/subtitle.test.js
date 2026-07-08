'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadIndex } = require('./helpers/loadIndex.js');

test('secToSrt: 0秒は 00:00:00,000 になる', () => {
  const api = loadIndex();
  assert.equal(api.secToSrt(0), '00:00:00,000');
});

test('secToSrt: 時分秒ミリ秒を正しくフォーマットする', () => {
  const api = loadIndex();
  assert.equal(api.secToSrt(3661.5), '01:01:01,500');
});

test('secToSrt: 負の値は0にクランプされる', () => {
  const api = loadIndex();
  assert.equal(api.secToSrt(-5), '00:00:00,000');
});

test('secToSrt: ミリ秒は四捨五入される', () => {
  const api = loadIndex();
  // 1.2345 sec -> 1234.5ms -> round -> 1235ms -> 00:00:01,235
  assert.equal(api.secToSrt(1.2345), '00:00:01,235');
});

test('writeSrt: UTF-8 BOM付きで、連番・矢印書式・空行区切りが正しい', (t) => {
  const api = loadIndex();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voicedesk-srt-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const srtPath = path.join(dir, 'out.srt');
  api.writeSrt(srtPath, [
    { start: 0, end: 1.5, text: 'こんにちは' },
    { start: 2, end: 3.25, text: 'さようなら' }
  ]);

  const buf = fs.readFileSync(srtPath);
  // 先頭バイトがUTF-8 BOM (EF BB BF)
  assert.equal(buf[0], 0xef);
  assert.equal(buf[1], 0xbb);
  assert.equal(buf[2], 0xbf);

  const text = buf.toString('utf8').replace(/^﻿/, '');
  const expected =
    '1\n00:00:00,000 --> 00:00:01,500\nこんにちは\n\n' +
    '2\n00:00:02,000 --> 00:00:03,250\nさようなら\n\n';
  assert.equal(text, expected);
});

test('readTxtAuto: UTF-8 BOM付きテキストを検出して読む', (t) => {
  const api = loadIndex();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voicedesk-txt-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const p = path.join(dir, 'bom.txt');
  fs.writeFileSync(p, Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from('こんにちは\r\n', 'utf8')
  ]));
  assert.equal(api.readTxtAuto(p), 'こんにちは');
});

test('readTxtAuto: txtEnc=utf8設定時はBOM無しUTF-8として読む(CRLF->LF, trim)', (t) => {
  const api = loadIndex();
  api.setEl('txtEnc', { value: 'utf8' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voicedesk-txt-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const p = path.join(dir, 'utf8.txt');
  fs.writeFileSync(p, '  行1\r\n行2  ', 'utf8');
  assert.equal(api.readTxtAuto(p), '行1\n行2');
});

test('readTxtAuto: txtEnc=sjis設定時はShift-JISとしてデコードする', (t) => {
  const api = loadIndex();
  api.setEl('txtEnc', { value: 'sjis' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voicedesk-txt-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const p = path.join(dir, 'sjis.txt');
  // 'こんにちは' の Shift-JIS バイト列
  fs.writeFileSync(p, Buffer.from([0x82, 0xb1, 0x82, 0xf1, 0x82, 0xc9, 0x82, 0xbf, 0x82, 0xcd]));
  assert.equal(api.readTxtAuto(p), 'こんにちは');
});

test('readTxtAuto: ファイルが存在しない場合はnullを返す', () => {
  const api = loadIndex();
  assert.equal(api.readTxtAuto(path.join(os.tmpdir(), 'voicedesk-does-not-exist.txt')), null);
});
