'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadIndex } = require('./helpers/loadIndex.js');

test('removeSavedRows: 空配列を渡すとフォールバック1件を返す', () => {
  const api = loadIndex();
  const r = api.removeSavedRows([], 'aq:x');
  assert.equal(r.length, 1);
  assert.equal(r[0].voice, 'aq:x');
  assert.equal(r[0].text, '');
});

test('removeSavedRows: 全行savedの場合はフォールバック1件のみ', () => {
  const api = loadIndex();
  const rows = [
    { voice: 'aq:a', text: 'foo', saved: true },
    { voice: 'aq:b', text: 'bar', saved: true }
  ];
  const r = api.removeSavedRows(rows, 'aq:default');
  assert.equal(r.length, 1);
  assert.equal(r[0].voice, 'aq:default');
  assert.equal(r[0].text, '');
});

test('removeSavedRows: 一部がsavedの場合、非saved行だけが元の順序で残る', () => {
  const api = loadIndex();
  const rows = [
    { voice: 'aq:a', text: 'foo', saved: true },
    { voice: 'aq:b', text: 'bar' },
    { voice: 'aq:c', text: 'baz', saved: false },
    { voice: 'aq:d', text: 'qux', saved: true }
  ];
  const r = api.removeSavedRows(rows, 'aq:default');
  assert.equal(r.length, 2);
  assert.equal(r[0].voice, 'aq:b');
  assert.equal(r[0].text, 'bar');
  assert.equal(r[1].voice, 'aq:c');
  assert.equal(r[1].text, 'baz');
});

test('removeSavedRows: 全行未保存の場合は全行そのまま残る', () => {
  const api = loadIndex();
  const rows = [
    { voice: 'aq:a', text: 'foo' },
    { voice: 'aq:b', text: 'bar', saved: false }
  ];
  const r = api.removeSavedRows(rows, 'aq:default');
  assert.equal(r.length, 2);
  assert.equal(r[0].voice, 'aq:a');
  assert.equal(r[1].voice, 'aq:b');
});

test('removeSavedRows: defaultVoiceが空文字の場合はvoiceも空文字になる', () => {
  const api = loadIndex();
  const rows = [{ voice: 'aq:a', text: 'foo', saved: true }];
  const r = api.removeSavedRows(rows, '');
  assert.equal(r.length, 1);
  assert.equal(r[0].voice, '');
  assert.equal(r[0].text, '');
});

test('removeSavedRows: 入力配列を破壊しない(非破壊性)', () => {
  const api = loadIndex();
  const rows = [
    { voice: 'aq:a', text: 'foo', saved: true },
    { voice: 'aq:b', text: 'bar' }
  ];
  const rowsLengthBefore = rows.length;
  const r = api.removeSavedRows(rows, 'aq:default');
  assert.equal(rows.length, rowsLengthBefore);
  assert.equal(rows[0].voice, 'aq:a');
  assert.equal(rows[0].saved, true);
  assert.equal(rows[1].voice, 'aq:b');
  assert.notEqual(r, rows);
});

test('removeSavedRows: 生存行のオブジェクトはvoice/textを保持する', () => {
  const api = loadIndex();
  const rows = [
    { voice: 'aq:a', text: 'hello world', saved: true },
    { voice: 'aq:b', text: 'keep me' }
  ];
  const r = api.removeSavedRows(rows, 'aq:default');
  assert.equal(r.length, 1);
  assert.equal(r[0].voice, 'aq:b');
  assert.equal(r[0].text, 'keep me');
});
