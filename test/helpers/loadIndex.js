'use strict';
/**
 * index.html を書き換えずに、その <script> 内の純粋ロジック関数だけを
 * node:vm で評価して取り出すためのテストハーネス。
 *
 * 方針(docs/SPEC.md 7章 / CLAUDE.md 参照):
 *  - index.html は一切変更しない。
 *  - Premiere操作(jsx/host.jsx)・A.I.VOICE2連携(bridge/*.ps1)・実際の音声合成エンジンとの
 *    通信は実環境前提のためテスト対象外。
 *  - `// ================= 初期化 =================` というマーカーコメントより前の部分だけを
 *    評価する。これにより loadSettings()/renderEngines()/buildVoiceList()/renderRows()/reloadVoices()
 *    などの副作用が大きい初期化コード(DOM大量操作+HTTP接続)は実行されない。
 *  - マーカーが見つからない場合は index.html の構造が変わったとみなし、明示的に throw する。
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const INDEX_HTML_PATH = path.join(__dirname, '..', '..', 'index.html');
const INIT_MARKER = '// ================= 初期化 =================';

function extractScriptSource() {
  const html = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) {
    throw new Error(
      'loadIndex: index.html から <script> タグの中身を抽出できませんでした。' +
      'index.html の構造が変わった可能性があります。'
    );
  }
  const full = m[1];
  const idx = full.indexOf(INIT_MARKER);
  if (idx < 0) {
    throw new Error(
      'loadIndex: 初期化マーカー "' + INIT_MARKER + '" が index.html 内に見つかりませんでした。' +
      'index.html の構造が変わっている可能性があるため、test/helpers/loadIndex.js を確認してください。'
    );
  }
  return full.slice(0, idx);
}

// テスト専用エピローグ。切り詰めたソースと同じ vm.runInContext 呼び出しの中で連結して
// 評価することで、let engines / trackMap / vvSpeakerCache / voiceList と同じレキシカル
// スコープに入り、対象関数の参照を globalThis.__test 経由で取り出せるようにする。
const EPILOGUE = [
  ';globalThis.__test = {',
  '  errMsg: errMsg,',
  '  jsxErrMsg: jsxErrMsg,',
  '  secToSrt: secToSrt,',
  '  safeFileName: safeFileName,',
  '  sanitizeEngineName: sanitizeEngineName,',
  '  vvBase: vvBase,',
  '  parseVvVoice: parseVvVoice,',
  '  vvCharacterName: vvCharacterName,',
  '  voiceShortName: voiceShortName,',
  '  trackFor: trackFor,',
  '  voiceFolderName: voiceFolderName,',
  '  wavBaseName: wavBaseName,',
  '  readTxtAuto: readTxtAuto,',
  '  uniqueWavPath: uniqueWavPath,',
  '  nextSeqWavPath: nextSeqWavPath,',
  '  voiceOutDir: voiceOutDir,',
  '  wavDurationSec: wavDurationSec,',
  '  writeSrt: writeSrt,',
  '  __setState: function(s){',
  '    if(s.engines)        engines = s.engines;',
  '    if(s.trackMap)       trackMap = s.trackMap;',
  '    if(s.vvSpeakerCache) vvSpeakerCache = s.vvSpeakerCache;',
  '    if(s.voiceList)      voiceList = s.voiceList;',
  '  }',
  '};'
].join('\n');

function makeElementStub(id) {
  const el = {
    id: id,
    value: '',
    checked: false,
    textContent: '',
    innerHTML: '',
    className: '',
    style: {},
    disabled: false,
    open: false,
    title: '',
    placeholder: '',
    children: [],
    addEventListener: function () {},
    removeEventListener: function () {},
    appendChild: function (child) { el.children.push(child); return child; },
    insertBefore: function (child) { el.children.unshift(child); return child; },
    removeChild: function (child) {
      const i = el.children.indexOf(child);
      if (i >= 0) el.children.splice(i, 1);
      return child;
    },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    focus: function () {}
  };
  return el;
}

function createDocumentMock() {
  const cache = {};
  return {
    getElementById: function (id) {
      if (!cache[id]) cache[id] = makeElementStub(id);
      return cache[id];
    },
    createElement: function (tag) {
      return makeElementStub('__created_' + tag);
    },
    querySelectorAll: function () { return []; },
    __cache: cache
  };
}

function createLocalStorageMock() {
  const store = {};
  return {
    getItem: function (k) {
      return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
    },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; },
    clear: function () { Object.keys(store).forEach(function (k) { delete store[k]; }); }
  };
}

function loadIndex() {
  const src = extractScriptSource();
  const doc = createDocumentMock();
  const localStorage = createLocalStorageMock();
  const windowStub = {
    cep: {
      fs: {
        showOpenDialogEx: function () { return { data: [] }; }
      }
    },
    __adobe_cep__: {
      evalScript: function (script, cb) { if (cb) cb(''); },
      getSystemPath: function () { return 'file:///C:/dummy'; }
    },
    clipboardData: null
  };

  const sandbox = {
    require: require,
    document: doc,
    window: windowStub,
    localStorage: localStorage,
    process: process,
    Buffer: Buffer,
    URL: URL,
    TextDecoder: TextDecoder,
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval
  };

  const context = vm.createContext(sandbox);
  vm.runInContext(src + '\n' + EPILOGUE, context, {
    filename: 'index.html#inline-script(truncated-before-init)'
  });

  const api = context.__test;
  if (!api) {
    throw new Error('loadIndex: __test オブジェクトの取得に失敗しました。');
  }

  return Object.assign({}, api, {
    setEl: function (id, props) {
      const el = doc.getElementById(id);
      Object.assign(el, props);
      return el;
    },
    getEl: function (id) {
      return doc.getElementById(id);
    }
  });
}

module.exports = { loadIndex: loadIndex, INDEX_HTML_PATH: INDEX_HTML_PATH };
