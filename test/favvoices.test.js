'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadIndex } = require('./helpers/loadIndex.js');

const SAMPLE_LIST = [
  { id: 'aq:れいむ', label: '[AQ] れいむ' },
  { id: 'vv:VOICEVOX:3', label: '[VOICEVOX] ずんだもん(ノーマル)' },
  { id: 'av', label: '[A.I.VOICE2]' }
];

// api.partitionVoices は node:vm サンドボックス内で実行されるため、返ってくる配列は
// このテストファイル(実realm)とは異なるrealmのArrayになる。assert.deepEqual/deepStrictEqual
// はプロトタイプの一致まで見るため、そのまま比較すると誤ってfailする。
// スプレッド構文(実realmでの配列生成)で実realmの配列に変換してから比較する。
function ids(list){ return [...list].map(v => v.id); }

test('partitionVoices: favVoices指定なしは全件restに入り favは空', () => {
  const api = loadIndex();
  const r = api.partitionVoices(SAMPLE_LIST, []);
  assert.deepEqual([...r.fav], []);
  assert.deepEqual(ids(r.rest), SAMPLE_LIST.map(v => v.id));
});

test('partitionVoices: favVoicesの順序でfavに入り、restから除外される', () => {
  const api = loadIndex();
  const r = api.partitionVoices(SAMPLE_LIST, ['av', 'aq:れいむ']);
  assert.deepEqual(ids(r.fav), ['av', 'aq:れいむ']);
  assert.deepEqual(ids(r.rest), ['vv:VOICEVOX:3']);
});

test('partitionVoices: 現行voiceListに無いstaleなfavVoicesは無視される(favVoices自体は変更しない)', () => {
  const api = loadIndex();
  const favs = ['vv:REMOVED_ENGINE:9', 'aq:れいむ'];
  const r = api.partitionVoices(SAMPLE_LIST, favs);
  assert.deepEqual(ids(r.fav), ['aq:れいむ']);
  assert.deepEqual(ids(r.rest), ['vv:VOICEVOX:3', 'av']);
  // 呼び出し元の配列自体は変更されない
  assert.deepEqual([...favs], ['vv:REMOVED_ENGINE:9', 'aq:れいむ']);
});

test('partitionVoices: favVoicesが空配列なら従来どおりフラットリストのみ', () => {
  const api = loadIndex();
  const r = api.partitionVoices(SAMPLE_LIST, []);
  assert.equal(r.fav.length, 0);
  assert.equal(r.rest.length, SAMPLE_LIST.length);
});

test('isFavVoice: favVoicesに含まれるIDはtrue、それ以外はfalse', () => {
  const api = loadIndex();
  api.__setState({ favVoices: ['aq:れいむ'] });
  assert.equal(api.isFavVoice('aq:れいむ'), true);
  assert.equal(api.isFavVoice('av'), false);
});

test('toggleFavVoice: 未登録のIDを渡すと追加され、再度渡すと削除される', () => {
  const api = loadIndex();
  api.__setState({ favVoices: [] });
  api.toggleFavVoice('aq:れいむ');
  assert.equal(api.isFavVoice('aq:れいむ'), true);
  api.toggleFavVoice('aq:れいむ');
  assert.equal(api.isFavVoice('aq:れいむ'), false);
});
