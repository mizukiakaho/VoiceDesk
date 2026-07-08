'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadIndex } = require('./helpers/loadIndex.js');

test('errMsg: 既知のAquesTalkエラーコードを日本語に変換する', () => {
  const api = loadIndex();
  assert.equal(api.errMsg(2014), 'テキストが空文');
  assert.equal(api.errMsg(2000), '予期せぬエラー');
});

test('errMsg: 未知のコードは "エラーコード N" 形式になる', () => {
  const api = loadIndex();
  assert.equal(api.errMsg(9999), 'エラーコード 9999');
});

test('jsxErrMsg: 既知のERR:キーを日本語に変換する', () => {
  const api = loadIndex();
  assert.equal(
    api.jsxErrMsg('ERR:NO_CLIPS'),
    '対象の音声クリップがありません(クリップを選択するか、オーディオトラックをターゲットにしてください)'
  );
  assert.equal(api.jsxErrMsg('ERR:NO_SEQUENCE'), 'アクティブなシーケンスがありません');
});

test('jsxErrMsg: "ERR:" プレフィックスは除去される', () => {
  const api = loadIndex();
  // 未知キーの場合は ERR: を取り除いた文字列がそのまま返る
  assert.equal(api.jsxErrMsg('ERR:SOMETHING_UNKNOWN'), 'SOMETHING_UNKNOWN');
});

test('jsxErrMsg: ERR:プレフィックスが無い未知の文字列はそのまま返る', () => {
  const api = loadIndex();
  assert.equal(api.jsxErrMsg('plain message'), 'plain message');
});

test('sanitizeEngineName: 禁則文字(: \\ |)を除去しtrimする', () => {
  const api = loadIndex();
  assert.equal(api.sanitizeEngineName('  VOICEVOX  '), 'VOICEVOX');
  assert.equal(api.sanitizeEngineName('a:b\\c|d'), 'abcd');
});

test('sanitizeEngineName: 空文字列は既定値ENGINEになる', () => {
  const api = loadIndex();
  assert.equal(api.sanitizeEngineName(''), 'ENGINE');
  assert.equal(api.sanitizeEngineName('   '), 'ENGINE');
  assert.equal(api.sanitizeEngineName(undefined), 'ENGINE');
});

test('vvBase: URLをtrimし末尾スラッシュを除去する', () => {
  const api = loadIndex();
  assert.equal(api.vvBase({ url: '  http://127.0.0.1:10101/  ' }), 'http://127.0.0.1:10101');
  assert.equal(api.vvBase({ url: 'http://127.0.0.1:50025///' }), 'http://127.0.0.1:50025');
});

test('vvBase: url未指定/空文字は既定のVOICEVOXポートになる', () => {
  const api = loadIndex();
  assert.equal(api.vvBase({ url: '' }), 'http://127.0.0.1:50021');
  assert.equal(api.vvBase(null), 'http://127.0.0.1:50021');
  assert.equal(api.vvBase(undefined), 'http://127.0.0.1:50021');
});
