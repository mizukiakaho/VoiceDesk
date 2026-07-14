'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadIndex } = require('./helpers/loadIndex.js');

function sampleQuery(){
  return {
    accent_phrases: [{ moras: [{ text: 'ア', consonant: null, vowel: 'a', pitch: 5.5 }] }],
    speedScale: 1.0,
    pitchScale: 0.0,
    intonationScale: 1.0,
    volumeScale: 1.0,
    prePhonemeLength: 0.1,
    postPhonemeLength: 0.1,
    outputSamplingRate: 24000,
    kana: 'ア'
  };
}

function assertAllKeysUnchanged(out, query){
  for(const k of ['speedScale','pitchScale','intonationScale','volumeScale','prePhonemeLength','postPhonemeLength','outputSamplingRate','kana']){
    assert.equal(out[k], query[k]);
  }
  assert.equal(out.accent_phrases, query.accent_phrases); // 浅いコピーで参照が保持される
}

test('applyVvTuning: tuningが{}の場合は無改変', () => {
  const api = loadIndex();
  const query = sampleQuery();
  const out = api.applyVvTuning(query, {});
  assertAllKeysUnchanged(out, query);
});

test('applyVvTuning: tuningがundefinedの場合は無改変', () => {
  const api = loadIndex();
  const query = sampleQuery();
  const out = api.applyVvTuning(query, undefined);
  assertAllKeysUnchanged(out, query);
});

test('applyVvTuning: tuningがnullの場合は無改変', () => {
  const api = loadIndex();
  const query = sampleQuery();
  const out = api.applyVvTuning(query, null);
  assertAllKeysUnchanged(out, query);
});

test('applyVvTuning: 全6キー指定で全て上書きされる', () => {
  const api = loadIndex();
  const query = sampleQuery();
  const tuning = {
    speedScale: 1.3, pitchScale: 0.05, intonationScale: 1.4,
    volumeScale: 0.8, prePhonemeLength: 0.2, postPhonemeLength: 0.3
  };
  const out = api.applyVvTuning(query, tuning);
  assert.equal(out.speedScale, 1.3);
  assert.equal(out.pitchScale, 0.05);
  assert.equal(out.intonationScale, 1.4);
  assert.equal(out.volumeScale, 0.8);
  assert.equal(out.prePhonemeLength, 0.2);
  assert.equal(out.postPhonemeLength, 0.3);
});

test('applyVvTuning: 一部キーのみ指定した場合は残りが元の値のまま', () => {
  const api = loadIndex();
  const query = sampleQuery();
  const out = api.applyVvTuning(query, { speedScale: 1.3 });
  assert.equal(out.speedScale, 1.3);
  assert.equal(out.pitchScale, query.pitchScale);
  assert.equal(out.intonationScale, query.intonationScale);
  assert.equal(out.volumeScale, query.volumeScale);
  assert.equal(out.prePhonemeLength, query.prePhonemeLength);
  assert.equal(out.postPhonemeLength, query.postPhonemeLength);
  assert.equal(out.accent_phrases, query.accent_phrases);
  assert.equal(out.outputSamplingRate, query.outputSamplingRate);
});

test('applyVvTuning: 未知キーは無視される', () => {
  const api = loadIndex();
  const query = sampleQuery();
  const out = api.applyVvTuning(query, { speedScale: 1.2, unknownKey: 99 });
  assert.equal(out.speedScale, 1.2);
  assert.equal(out.unknownKey, undefined);
});

test('applyVvTuning: 非数値・不正値は無視され元の値が保持される', () => {
  const api = loadIndex();
  const query = sampleQuery();
  const out = api.applyVvTuning(query, { speedScale: 'abc', pitchScale: NaN });
  assert.equal(out.speedScale, query.speedScale);
  assert.equal(out.pitchScale, query.pitchScale);
});

test('applyVvTuning: 非破壊性(元のqueryは変更されず、返り値は別オブジェクト)', () => {
  const api = loadIndex();
  const query = sampleQuery();
  const before = JSON.parse(JSON.stringify(query));
  const out = api.applyVvTuning(query, { speedScale: 1.5 });
  assert.notEqual(out, query);
  assert.deepEqual(query, before);
  assert.equal(out.accent_phrases, query.accent_phrases); // 浅いコピーで参照は保持
});

test('applyVvTuning: 数値化できる文字列はNumber型に変換されて入る', () => {
  const api = loadIndex();
  const query = sampleQuery();
  const out = api.applyVvTuning(query, { speedScale: '1.5' });
  assert.equal(out.speedScale, 1.5);
  assert.equal(typeof out.speedScale, 'number');
});
