'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadIndex } = require('./helpers/loadIndex.js');

function withVoicevoxEngine(api) {
  api.__setState({
    engines: [{ name: 'VOICEVOX', url: 'http://127.0.0.1:50021', exe: '' }],
    vvSpeakerCache: { VOICEVOX: [{ id: 3, label: 'ずんだもん(ノーマル)' }] },
    trackMap: {},
    voiceList: []
  });
}

test('parseVvVoice: 正常なvv:形式はエンジンとstyleIdを返す', () => {
  const api = loadIndex();
  withVoicevoxEngine(api);
  const r = api.parseVvVoice('vv:VOICEVOX:3');
  assert.equal(r.eng.name, 'VOICEVOX');
  assert.equal(r.styleId, '3');
});

test('parseVvVoice: エンジンが未登録の場合はnull', () => {
  const api = loadIndex();
  withVoicevoxEngine(api);
  assert.equal(api.parseVvVoice('vv:UNKNOWN_ENGINE:3'), null);
});

test('parseVvVoice: vv:形式でない/不正な文字列はnull', () => {
  const api = loadIndex();
  withVoicevoxEngine(api);
  assert.equal(api.parseVvVoice('av'), null);
  assert.equal(api.parseVvVoice('aq:れいむ'), null);
  assert.equal(api.parseVvVoice('vv:VOICEVOX'), null); // styleId無し
});

test('vvCharacterName: 半角括弧のラベルからキャラ名部分のみ抽出する', () => {
  const api = loadIndex();
  withVoicevoxEngine(api);
  assert.equal(api.vvCharacterName('vv:VOICEVOX:3'), 'ずんだもん');
});

test('vvCharacterName: 全角括弧のラベルにも対応する', () => {
  const api = loadIndex();
  api.__setState({
    engines: [{ name: 'VOICEVOX', url: '', exe: '' }],
    vvSpeakerCache: { VOICEVOX: [{ id: 5, label: '四国めたん（あまあま）' }] },
    trackMap: {},
    voiceList: []
  });
  assert.equal(api.vvCharacterName('vv:VOICEVOX:5'), '四国めたん');
});

test('vvCharacterName: キャッシュに無い/エンジン不明の場合は空文字列', () => {
  const api = loadIndex();
  withVoicevoxEngine(api);
  assert.equal(api.vvCharacterName('vv:VOICEVOX:999'), '');
  assert.equal(api.vvCharacterName('av'), '');
});

test('voiceShortName: avは常にAIVOICE2', () => {
  const api = loadIndex();
  assert.equal(api.voiceShortName('av'), 'AIVOICE2');
});

test('voiceShortName: ラベルから "[XX] " と "(...)" を除去する(2文字ブラケットの例: AquesTalk)', () => {
  const api = loadIndex();
  api.__setState({
    voiceList: [{ id: 'aq:れいむ', label: '[AQ] れいむ(ノーマル)' }]
  });
  assert.equal(api.voiceShortName('aq:れいむ'), 'れいむ');
});

test('voiceShortName: 未登録のvoiceIdは空文字列', () => {
  const api = loadIndex();
  api.__setState({ voiceList: [] });
  assert.equal(api.voiceShortName('vv:NOPE:1'), '');
});

test('trackFor: trackMapにヒットすればその値を返す', () => {
  const api = loadIndex();
  api.__setState({ trackMap: { 'aq:れいむ': '5' } });
  assert.equal(api.trackFor('aq:れいむ'), '5');
});

test('trackFor: 未設定時の既定値はavが2、それ以外は1', () => {
  const api = loadIndex();
  api.__setState({ trackMap: {} });
  assert.equal(api.trackFor('av'), '2');
  assert.equal(api.trackFor('aq:れいむ'), '1');
  assert.equal(api.trackFor('vv:VOICEVOX:3'), '1');
});

test('voiceFolderName: avは固定でAIVOICE2', () => {
  const api = loadIndex();
  assert.equal(api.voiceFolderName('av'), 'AIVOICE2');
});

test('voiceFolderName: aq:<プリセット名>はAQ_<プリセット名>', () => {
  const api = loadIndex();
  assert.equal(api.voiceFolderName('aq:れいむ'), 'AQ_れいむ');
});

test('voiceFolderName: vv:<エンジン名>:<styleId>は<エンジン名>_<キャラ名>', () => {
  const api = loadIndex();
  withVoicevoxEngine(api); // styleId 3 = ずんだもん
  assert.equal(api.voiceFolderName('vv:VOICEVOX:3'), 'VOICEVOX_ずんだもん');
});

test('voiceFolderName: キャラ名が解決できない場合は<エンジン名>_unknownになる', () => {
  const api = loadIndex();
  api.__setState({
    engines: [{ name: 'VOICEVOX', url: '', exe: '' }],
    vvSpeakerCache: {},
    trackMap: {}
  });
  assert.equal(api.voiceFolderName('vv:VOICEVOX:999'), 'VOICEVOX_unknown');
});
