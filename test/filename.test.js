'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadIndex } = require('./helpers/loadIndex.js');

test('safeFileName: 禁則文字 \\/:*?"<>| を除去する', () => {
  const api = loadIndex();
  assert.equal(api.safeFileName('a\\b/c:d*e?f"g<h>i|j'), 'abcdefghij');
});

test('safeFileName: 先頭の "#>" 除去は禁則文字除去の後に行われるため "#" のみ残る', () => {
  // 実装上、禁則文字除去(\/:*?"<>|)が先に行われて '>' が既に消えているため、
  // ^#> にマッチするのは常に禁則文字除去後の文字列であり、結果として先頭の
  // '#' は除去されずに残る。これは index.html 側の既存の挙動(処理順の副作用)であり、
  // ここでは現状の実際の挙動をそのままテストとして固定している。
  const api = loadIndex();
  assert.equal(api.safeFileName('#>タイトル'), '#タイトル');
});

test('safeFileName: 改行はスペースに、連続する空白はアンダースコアになる', () => {
  const api = loadIndex();
  assert.equal(api.safeFileName('行1\n行2  行3'), '行1_行2_行3');
});

test('safeFileName: 50文字を超える場合は50文字に切り詰める', () => {
  const api = loadIndex();
  const longText = 'a'.repeat(60);
  const result = api.safeFileName(longText);
  assert.equal(result.length, 50);
  assert.equal(result, 'a'.repeat(50));
});

test('safeFileName: 結果が空文字列になる場合は "output" になる', () => {
  const api = loadIndex();
  assert.equal(api.safeFileName(''), 'output');
  assert.equal(api.safeFileName('///***'), 'output');
});

test('safeFileName: 第2引数maxLenを指定すると指定文字数で切り詰める', () => {
  const api = loadIndex();
  const longText = 'a'.repeat(30);
  const result = api.safeFileName(longText, 20);
  assert.equal(result.length, 20);
  assert.equal(result, 'a'.repeat(20));
});

test('safeFileName: 第2引数省略時は従来どおり50文字上限のまま', () => {
  const api = loadIndex();
  const longText = 'a'.repeat(60);
  assert.equal(api.safeFileName(longText).length, 50);
  assert.equal(api.safeFileName(longText, undefined).length, 50);
});

test('uniqueWavPath: 衝突が無ければ base.wav をそのまま返す', (t) => {
  const api = loadIndex();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voicedesk-uniq-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  assert.equal(api.uniqueWavPath(dir, 'base'), path.join(dir, 'base.wav'));
});

test('uniqueWavPath: 衝突がある場合は _1, _2 ... とサフィックスを付ける', (t) => {
  const api = loadIndex();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voicedesk-uniq-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  fs.writeFileSync(path.join(dir, 'base.wav'), '');
  assert.equal(api.uniqueWavPath(dir, 'base'), path.join(dir, 'base_1.wav'));

  fs.writeFileSync(path.join(dir, 'base_1.wav'), '');
  assert.equal(api.uniqueWavPath(dir, 'base'), path.join(dir, 'base_2.wav'));
});

test('nextSeqWavPath: 空フォルダでは 001_ から始まる', (t) => {
  const api = loadIndex();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voicedesk-seq-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  assert.equal(api.nextSeqWavPath(dir, 'foo'), path.join(dir, '001_foo.wav'));
});

test('nextSeqWavPath: 既存最大値 005_ の隣は 006_ になる', (t) => {
  const api = loadIndex();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voicedesk-seq-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  fs.writeFileSync(path.join(dir, '005_bar.wav'), '');
  assert.equal(api.nextSeqWavPath(dir, 'baz'), path.join(dir, '006_baz.wav'));
});

test('nextSeqWavPath: 先頭が数字_で始まらないファイルは連番走査で無視される', (t) => {
  const api = loadIndex();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voicedesk-seq-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  fs.writeFileSync(path.join(dir, 'notseq.wav'), '');
  fs.writeFileSync(path.join(dir, 'foo_002_bar.wav'), '');
  assert.equal(api.nextSeqWavPath(dir, 'x'), path.join(dir, '001_x.wav'));
});

test('nextSeqWavPath: 同一連番・同名ファイルが既にある場合は既存ファイルを上書きしない', (t) => {
  const api = loadIndex();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voicedesk-seq-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  // 001_x.wav が既にある状態で同じベース名を要求すると
  // 連番自体は 002 になるため衝突しない
  fs.writeFileSync(path.join(dir, '001_x.wav'), 'existing content');
  const p = api.nextSeqWavPath(dir, 'x');
  assert.equal(p, path.join(dir, '002_x.wav'));
  assert.equal(fs.readFileSync(path.join(dir, '001_x.wav'), 'utf8'), 'existing content');
});

test('voiceOutDir: サブフォルダを作成しパスを返す(冪等)', (t) => {
  const api = loadIndex();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voicedesk-outdir-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const p1 = api.voiceOutDir(dir, 'aq:れいむ');
  assert.equal(p1, path.join(dir, 'AQ_れいむ'));
  assert.ok(fs.existsSync(p1) && fs.statSync(p1).isDirectory());

  // 2回目呼んでもエラーにならず同じパスを返す(mkdirSyncのrecursive:trueで冪等)
  const p2 = api.voiceOutDir(dir, 'aq:れいむ');
  assert.equal(p2, p1);
});

test('wavBaseName: namePrefix設定OFFならセリフのみ(safeFileName)になる', () => {
  const api = loadIndex();
  api.setEl('namePrefix', { checked: false });
  assert.equal(api.wavBaseName('av', 'こんにちは、世界'), 'こんにちは、世界');
});

test('wavBaseName: namePrefix設定ONならキャラ名_セリフになる', () => {
  const api = loadIndex();
  api.setEl('namePrefix', { checked: true });
  api.__setState({ voiceList: [{ id: 'av', label: '[A.I.VOICE2]' }] });
  assert.equal(api.wavBaseName('av', 'こんにちは'), 'AIVOICE2_こんにちは');
});

test('wavBaseName: namePrefix設定OFFなら長いセリフは20文字(SPEECH_NAME_MAX)に切り詰められる', () => {
  const api = loadIndex();
  api.setEl('namePrefix', { checked: false });
  const longText = 'あ'.repeat(30);
  const result = api.wavBaseName('av', longText);
  assert.equal(result.length, 20);
  assert.equal(result, 'あ'.repeat(20));
});

test('wavBaseName: namePrefix設定ONでもキャラ名prefixは50文字上限のまま、セリフ部分は20文字', () => {
  const api = loadIndex();
  api.setEl('namePrefix', { checked: true });
  api.__setState({ voiceList: [{ id: 'av', label: '[A.I.VOICE2]' }] });
  const longText = 'あ'.repeat(30);
  const result = api.wavBaseName('av', longText);
  assert.equal(result, 'AIVOICE2_' + 'あ'.repeat(20));
});

test('pathTooLong: MAX_PATH_LEN文字ちょうどはfalse、+1文字はtrue', () => {
  const api = loadIndex();
  const exact = 'a'.repeat(240);
  const over = 'a'.repeat(241);
  assert.equal(api.pathTooLong(exact), false);
  assert.equal(api.pathTooLong(over), true);
});

test('pathLenMsg: 文字数と上限を含む日本語メッセージを返す', () => {
  const api = loadIndex();
  const p = 'a'.repeat(241);
  const msg = api.pathLenMsg(p);
  assert.match(msg, /ファイルパスが長すぎます/);
  assert.match(msg, /241文字/);
  assert.match(msg, /上限240文字/);
  assert.match(msg, new RegExp(p));
});
