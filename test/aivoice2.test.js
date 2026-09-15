'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadIndex } = require('./helpers/loadIndex.js');

// ---------- voiceId ----------
test('isAvVoice / avCharName: av: 形式と旧 av を判定し、キャラ名を取り出す', () => {
  const api = loadIndex();
  assert.equal(api.isAvVoice('av'), true);
  assert.equal(api.isAvVoice('av:結月ゆかり(通常'), true);
  assert.equal(api.isAvVoice('aq:れいむ'), false);
  assert.equal(api.isAvVoice('vv:VOICEVOX:3'), false);
  assert.equal(api.isAvVoice(''), false);
  assert.equal(api.avCharName('av:結月ゆかり(通常'), '結月ゆかり(通常');
  assert.equal(api.avCharName('av'), '');
  assert.equal(api.avCharName('aq:れいむ'), '');
});

test('voiceShortName / voiceFolderName / trackFor: av:<キャラ名> の扱い', () => {
  const api = loadIndex();
  api.__setState({ trackMap: {}, voiceList: [] });
  assert.equal(api.voiceShortName('av:結月ゆかり(通常'), '結月ゆかり');
  assert.equal(api.voiceShortName('av'), 'AIVOICE2');
  assert.equal(api.voiceFolderName('av:結月ゆかり(通常'), 'AIVOICE2_結月ゆかり(通常');
  assert.equal(api.voiceFolderName('av'), 'AIVOICE2');
  assert.equal(api.voiceFolderName('av:a/b:c'), 'AIVOICE2_abc'); // 禁則文字は除去
  assert.equal(api.trackFor('av:結月ゆかり(通常'), '2');
  assert.equal(api.trackFor('av'), '2');
  assert.equal(api.trackFor('aq:れいむ'), '1');
});

// ---------- characters.vpcx ----------
test('avParseCharacters: characters[].name を順序どおり返す', () => {
  const api = loadIndex();
  const json = JSON.stringify({ version: '2.1', characters: [
    { name: '結月ゆかり(NV)', voice: 'x', userCustom: false },
    { name: '結月ゆかり(通常', voice: 'x', userCustom: true },
    { name: '', voice: 'x' },
    { voice: 'x' }
  ]});
  assert.equal(JSON.stringify(api.avParseCharacters(json)), JSON.stringify(['結月ゆかり(NV)', '結月ゆかり(通常']));
});

test('avParseCharacters: 壊れたJSON/形式違いは空配列', () => {
  const api = loadIndex();
  assert.equal(api.avParseCharacters('{').length, 0);
  assert.equal(api.avParseCharacters('{"characters":"x"}').length, 0);
  assert.equal(api.avParseCharacters('[]').length, 0);
});

// ---------- app_settings.json ----------
function goodSettings() {
  return { version: '1.6', general: { language: 'ja_JP' }, saveWave: {
    format: 'wav-16-48000', exportAllAction: 'textblock', saveText: true, textEncoding: 'UTF-8',
    filePathSelectionMode: 'namingRule',
    namingRule: { directory: '', file: '{Number=3}_{Character}_{Text=10}', textLength: 10, numberDigit: 3, numberStart: 1 }
  } };
}

test('avSettingsIssues: 必要設定がそろっていれば空', () => {
  const api = loadIndex();
  assert.equal(api.avSettingsIssues(goodSettings()).length, 0);
});

test('avSettingsIssues: ダイアログ指定/結合書き出し/連番無し/開始番号違いを列挙する', () => {
  const api = loadIndex();
  const s = goodSettings();
  s.saveWave.filePathSelectionMode = 'dialog';
  s.saveWave.exportAllAction = 'combine';
  s.saveWave.namingRule.file = '{Character}_{Text=10}';
  s.saveWave.namingRule.numberStart = 0;
  const issues = api.avSettingsIssues(s);
  assert.equal(issues.length, 4);
  assert.ok(issues.some(i => i.indexOf('ファイル名の指定方法') === 0));
  assert.ok(issues.some(i => i.indexOf('命名規則') === 0));
  assert.ok(issues.some(i => i.indexOf('連番の開始番号') === 0));
  assert.ok(issues.some(i => i.indexOf('一括書き出しの動作') === 0));
  assert.equal(api.avSettingsIssues({}).length, 1);
  assert.equal(api.avSettingsIssues(null).length, 1);
});

test('avSettingsIssues: {Number} は桁指定の有無どちらも可', () => {
  const api = loadIndex();
  const s = goodSettings();
  s.saveWave.namingRule.file = '{Number}_{Text}';
  assert.equal(api.avSettingsIssues(s).length, 0);
});

test('avPatchSettings: 必要項目だけ書き換え、他の設定は保持し、元オブジェクトを変更しない', () => {
  const api = loadIndex();
  const src = goodSettings();
  src.saveWave.filePathSelectionMode = 'dialog';
  src.saveWave.exportAllAction = 'combine';
  src.saveWave.namingRule.file = '';
  src.saveWave.namingRule.numberStart = 0;
  src.saveWave.namingRule.directory = 'file:///C:/keep';
  src.saveWave.saveText = false;
  src.general.audioDevice = { index: 6, name: 'dev' };
  const before = JSON.stringify(src);
  const out = api.avPatchSettings(src);
  assert.equal(JSON.stringify(src), before, '入力は変更されない');
  assert.equal(api.avSettingsIssues(out).length, 0);
  assert.equal(out.saveWave.namingRule.file, '{Number=3}_{Character}_{Text=10}');
  assert.equal(out.saveWave.namingRule.directory, 'file:///C:/keep', '保存先は維持');
  assert.equal(out.saveWave.saveText, false, '無関係な項目は維持');
  assert.equal(out.saveWave.format, 'wav-16-48000');
  assert.equal(JSON.stringify(out.general.audioDevice), JSON.stringify({ index: 6, name: 'dev' }));
});

test('avPatchSettings: 既に {Number} を含む命名規則は維持する', () => {
  const api = loadIndex();
  const src = goodSettings();
  src.saveWave.namingRule.file = '{Number}_{Text}';
  src.saveWave.filePathSelectionMode = 'dialog';
  const out = api.avPatchSettings(src);
  assert.equal(out.saveWave.namingRule.file, '{Number}_{Text}');
  assert.equal(out.saveWave.filePathSelectionMode, 'namingRule');
});

test('avPatchSettings: saveWave が無い設定でも必要項目を生成する', () => {
  const api = loadIndex();
  const out = api.avPatchSettings({ version: '1.6' });
  assert.equal(api.avSettingsIssues(out).length, 0);
  assert.equal(out.version, '1.6');
});

// ---------- プロジェクト / 書き出しファイル名 ----------
test('avProjectJson: A.I.VOICE2 が読めるプロジェクトJSON(version 3.1, textblocks)を作る', () => {
  const api = loadIndex();
  const json = api.avProjectJson([{ character: '結月ゆかり(通常', text: 'こんにちは' }, { character: '結月ゆかり(喜び', text: 'やった' }]);
  const obj = JSON.parse(json);
  assert.equal(obj.version, '3.1');
  assert.deepEqual(obj.textblocks, [
    { character: '結月ゆかり(通常', text: 'こんにちは' },
    { character: '結月ゆかり(喜び', text: 'やった' }
  ]);
});

test('avParseExportNumber: 先頭の連番を取り出す(wav以外・連番無しは null)', () => {
  const api = loadIndex();
  assert.equal(api.avParseExportNumber('001_結月ゆかり(通常_一行目のテストです。.wav'), 1);
  assert.equal(api.avParseExportNumber('012_x… .WAV'), 12);
  assert.equal(api.avParseExportNumber('001_結月ゆかり(通常_一行目.txt'), null);
  assert.equal(api.avParseExportNumber('ブリッジ経由の一つ目… .wav'), null);
  assert.equal(api.avParseExportNumber('voicedesk.wav'), null);
});

// ---------- パス既定値 ----------
test('avExportDir: 作業フォルダ未設定なら outDir 配下の _aivoice2_export', () => {
  const api = loadIndex();
  api.setEl('avOutDir', { value: '' });
  assert.equal(api.avExportDir('D:\\out'), path.join('D:\\out', '_aivoice2_export'));
  api.setEl('avOutDir', { value: 'E:\\work ' });
  assert.equal(api.avExportDir('D:\\out'), 'E:\\work');
});

test('avDefaultCharsPath / avDefaultSettingsPath: A.I.VOICE2 の既定配置を指す', () => {
  const api = loadIndex();
  assert.ok(/characters\.vpcx$/.test(api.avDefaultCharsPath()));
  assert.ok(/A\.I\.VOICE Editor[\\\/]2\.0[\\\/]characters\.vpcx$/.test(api.avDefaultCharsPath()));
  assert.ok(/A\.I\.VOICE Editor[\\\/]2\.0[\\\/]app_settings\.json$/.test(api.avDefaultSettingsPath()));
});
