'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadIndex } = require('./helpers/loadIndex.js');

test('pickGlobalSettings: rowsDataや未知キーは落ち、共通15キーのみ保持される', () => {
  const api = loadIndex();
  const input = {
    exePath: 'C:\\aq.exe', avExePath: '', outDir: 'C:\\out', avOutDir: '',
    engines: [{ name: 'VOICEVOX', url: 'http://127.0.0.1:50021', exe: '' }],
    vvAutoLaunch: true, txtEnc: 'sjis', makeTxt: true, namePrefix: false,
    insAudio: false, insGap: 0, trackMap: { av: '2' }, vvSpeakerCache: {},
    vvTuning: {}, favVoices: ['av'],
    rowsData: [{ voice: 'av', text: 'hello' }],
    someUnknownKey: 'should be dropped'
  };
  const out = api.pickGlobalSettings(input);
  assert.equal(Object.prototype.hasOwnProperty.call(out, 'rowsData'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(out, 'someUnknownKey'), false);
  const expectedKeys = [
    'exePath', 'avExePath', 'outDir', 'avOutDir', 'engines', 'vvAutoLaunch',
    'txtEnc', 'makeTxt', 'namePrefix', 'insAudio', 'insGap',
    'trackMap', 'vvSpeakerCache', 'vvTuning', 'favVoices'
  ];
  assert.deepEqual(Object.keys(out).sort(), expectedKeys.sort());
  assert.equal(out.exePath, 'C:\\aq.exe');
  assert.deepEqual(out.trackMap, { av: '2' });
  assert.deepEqual(out.favVoices, ['av']);
});

test('pickGlobalSettings: undefinedなキーは出力に含まれない', () => {
  const api = loadIndex();
  const out = api.pickGlobalSettings({ exePath: 'x', avExePath: undefined });
  assert.equal(Object.prototype.hasOwnProperty.call(out, 'avExePath'), false);
  assert.equal(out.exePath, 'x');
});

test('pickGlobalSettings: 空オブジェクト/未定義キーのみの入力では空オブジェクトを返す', () => {
  const api = loadIndex();
  // api.pickGlobalSettings は node:vm サンドボックス内(別realm)のオブジェクトを返すため、
  // assert.deepEqual はプロトタイプの一致まで見て誤ってfailする。JSON経由で比較する。
  assert.equal(JSON.stringify(api.pickGlobalSettings({})), '{}');
});

test('globalSettingsPath: APPDATA配下の VoiceDesk\\settings.json を返す', () => {
  const api = loadIndex();
  const expected = path.join(api.__settingsDir, 'VoiceDesk', 'settings.json');
  assert.equal(api.globalSettingsPath(), expected);
});

test('globalSettingsDir: APPDATA配下の VoiceDesk フォルダを返す', () => {
  const api = loadIndex();
  const expected = path.join(api.__settingsDir, 'VoiceDesk');
  assert.equal(api.globalSettingsDir(), expected);
});

test('loadSettings: engines配列を持たない旧形式(vvUrl/vvExePath)の移行でVOICEVOXの' +
     'URL/実行ファイルパスが失われない(回帰テスト)', () => {
  const api = loadIndex();
  const legacy = {
    exePath: 'C:\\aq\\AquesTalkPlayer.exe',
    outDir: 'C:\\out',
    vvUrl: 'http://127.0.0.1:12345',
    vvExePath: 'C:\\voicevox\\run.exe',
    rowsData: [{ voice: 'aq:れいむ', text: 'こんにちは' }]
  };
  api.__localStorage.setItem('voicedesk_settings_v2', JSON.stringify(legacy));

  api.loadSettings();

  const engines = api.__getEngines();
  assert.equal(engines.length, 1);
  assert.equal(engines[0].url, 'http://127.0.0.1:12345');
  assert.equal(engines[0].exe, 'C:\\voicevox\\run.exe');

  // 移行時にsaveSettings()が呼ばれ、共通ファイルへ書き出される。
  // vvUrl/vvExePathというキー自体はGLOBAL_KEYSに含まれないため書き出されない
  // (値はengines[0]へ反映された状態で保存される)。
  const written = JSON.parse(fs.readFileSync(api.globalSettingsPath(), 'utf8'));
  assert.equal(Object.prototype.hasOwnProperty.call(written, 'vvUrl'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(written, 'vvExePath'), false);
  assert.equal(written.engines[0].url, 'http://127.0.0.1:12345');
  assert.equal(written.engines[0].exe, 'C:\\voicevox\\run.exe');
});
