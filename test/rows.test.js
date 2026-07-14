'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadIndex } = require('./helpers/loadIndex.js');

test('clearSavedRowsText: saved行のtextが空になりsavedが解除される', () => {
  const api = loadIndex();
  const rows = [
    { voice: 'aq:a', text: 'foo', saved: true }
  ];
  const r = api.clearSavedRowsText(rows);
  assert.equal(r.length, 1);
  assert.equal(r[0].voice, 'aq:a');
  assert.equal(r[0].text, '');
  assert.equal(r[0].saved, false);
});

test('clearSavedRowsText: 行数は維持される(削除されない)', () => {
  const api = loadIndex();
  const rows = [
    { voice: 'aq:a', text: 'foo', saved: true },
    { voice: 'aq:b', text: 'bar', saved: true },
    { voice: 'aq:c', text: 'baz' }
  ];
  const r = api.clearSavedRowsText(rows);
  assert.equal(r.length, 3);
});

test('clearSavedRowsText: 一部がsavedの場合、saved行だけtextが空・非saved行はそのまま', () => {
  const api = loadIndex();
  const rows = [
    { voice: 'aq:a', text: 'foo', saved: true },
    { voice: 'aq:b', text: 'bar' },
    { voice: 'aq:c', text: 'baz', saved: false },
    { voice: 'aq:d', text: 'qux', saved: true }
  ];
  const r = api.clearSavedRowsText(rows);
  assert.equal(r.length, 4);
  assert.equal(r[0].voice, 'aq:a');
  assert.equal(r[0].text, '');
  assert.equal(r[0].saved, false);
  assert.equal(r[1].voice, 'aq:b');
  assert.equal(r[1].text, 'bar');
  assert.equal(r[2].voice, 'aq:c');
  assert.equal(r[2].text, 'baz');
  assert.equal(r[3].voice, 'aq:d');
  assert.equal(r[3].text, '');
  assert.equal(r[3].saved, false);
});

test('clearSavedRowsText: 全行未保存の場合は全行そのまま残る', () => {
  const api = loadIndex();
  const rows = [
    { voice: 'aq:a', text: 'foo' },
    { voice: 'aq:b', text: 'bar', saved: false }
  ];
  const r = api.clearSavedRowsText(rows);
  assert.equal(r.length, 2);
  assert.equal(r[0].text, 'foo');
  assert.equal(r[1].text, 'bar');
});

test('clearSavedRowsText: voice/trackに関わる情報(voice)は保持される', () => {
  const api = loadIndex();
  const rows = [
    { voice: 'vv:engineA:1', text: 'hello world', saved: true }
  ];
  const r = api.clearSavedRowsText(rows);
  assert.equal(r.length, 1);
  assert.equal(r[0].voice, 'vv:engineA:1');
  assert.equal(r[0].text, '');
});

test('clearSavedRowsText: 入力配列を破壊しない(非破壊性)', () => {
  const api = loadIndex();
  const rows = [
    { voice: 'aq:a', text: 'foo', saved: true },
    { voice: 'aq:b', text: 'bar' }
  ];
  const rowsLengthBefore = rows.length;
  const r = api.clearSavedRowsText(rows);
  assert.equal(rows.length, rowsLengthBefore);
  assert.equal(rows[0].voice, 'aq:a');
  assert.equal(rows[0].text, 'foo');
  assert.equal(rows[0].saved, true);
  assert.equal(rows[1].voice, 'aq:b');
  assert.notEqual(r, rows);
  assert.notEqual(r[0], rows[0]);
});

test('clearSavedRowsText: 全行savedでも空配列にはならず、textが空の同数の行になる', () => {
  const api = loadIndex();
  const rows = [
    { voice: 'aq:a', text: 'foo', saved: true },
    { voice: 'aq:b', text: 'bar', saved: true }
  ];
  const r = api.clearSavedRowsText(rows);
  assert.equal(r.length, 2);
  assert.equal(r[0].text, '');
  assert.equal(r[0].saved, false);
  assert.equal(r[1].text, '');
  assert.equal(r[1].saved, false);
});
