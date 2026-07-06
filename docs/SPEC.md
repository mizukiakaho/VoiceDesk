# VoiceDesk 仕様書(開発者向け)

バージョン: 2.1.0 / ライセンス: MIT

## 1. 概要

Adobe Premiere Pro 用 CEP エクステンション。パネル(HTML/JS)から複数の音声合成ソフトを
操作し、WAV+txt生成、タイムライン配置、字幕(SRT→キャプショントラック)生成を行う。

## 2. ファイル構成

```
voicedesk/
├─ CSXS/manifest.xml      … CEPマニフェスト(ID: com.nakashima.voicedesk)
├─ index.html             … パネル本体(UI+全ロジック、単一ファイル)
├─ jsx/host.jsx           … ExtendScript(Premiere操作)※ASCII文字のみ
├─ bridge/aivoice2_bridge.ps1 … A.I.VOICE2 UIAutomationブリッジ ※UTF-8 BOM付き
├─ install.bat            … インストーラ(拡張コピー+PlayerDebugMode設定)
├─ docs/SPEC.md           … 本書
└─ docs/AI_PROMPT.md      … AI改修用プロンプト
```

## 3. アーキテクチャ

```
[index.html (CEF/Chromium + Node.js)]
   ├─ AquesTalk:  child_process.execFile(AquesTalkPlayer.exe /T /P /W)
   ├─ VOICEVOX系: Node http → GET /speakers, POST /audio_query, POST /synthesis
   ├─ A.I.VOICE2: child_process → powershell.exe → bridge.ps1(UIAutomation)
   └─ Premiere:   window.__adobe_cep__.evalScript → jsx/host.jsx ($._AQV_.*)
```

- Node統合はmanifestの `--enable-nodejs --mixed-context` で有効化
- PowerShellはPATHに無い環境があるため必ずフルパス
  `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe` で呼ぶ(定数 PS_EXE)

## 4. データ構造(localStorage: key `voicedesk_settings_v2`)

```json
{
  "exePath":   "AquesTalkPlayer.exeパス",
  "avExePath": "aivoice.exeパス",
  "outDir":    "WAV出力フォルダ",
  "avOutDir":  "A.I.VOICE2書き出しフォルダ",
  "engines":   [{"name":"VOICEVOX","url":"http://127.0.0.1:50021","exe":"run.exeパス"}],
  "vvAutoLaunch": true,
  "txtEnc": "sjis|utf8",
  "makeTxt": true, "namePrefix": false, "insAudio": false,
  "trackMap": {"voiceId": "トラック番号"},
  "vvSpeakerCache": {"エンジン名": [{"id":3,"label":"ずんだもん(ノーマル)"}]},
  "rowsData": [{"voice":"voiceId","text":"セリフ"}]
}
```

### voiceId 形式
- `aq:<プリセット名>` … AquesTalk (例 `aq:れいむ`)
- `vv:<エンジン名>:<styleId>` … VOICEVOX系 (例 `vv:VOICEVOX:3`)
- `av` … A.I.VOICE2

## 5. 外部連携仕様

### AquesTalkPlayer (CLI)
- 再生: `AquesTalkPlayer.exe /T "テキスト" /P "プリセット名"`
- WAV出力: 上記+ `/W "出力パス.wav"`(終了コード0=成功、2000番台=エラー)
- プリセット一覧: exeと同じ場所の `AquesTalkPlayer.preset`(Shift-JIS CSV、1列目が名前)

### VOICEVOX互換API
- `GET /version` … 死活確認
- `GET /speakers` … `[{name, styles:[{name,id}]}]`
- `POST /audio_query?speaker=<id>&text=<urlencoded>` … クエリJSON取得
- `POST /synthesis?speaker=<id>` (body=クエリJSON) … WAVバイナリ
- 既定ポート: VOICEVOX 50021 / AivisSpeech 10101 / SHAREVOX 50025
- fetchはCORSの都合でNodeの http.request を使用(vvRequest関数)

### A.I.VOICE2 (bridge/aivoice2_bridge.ps1)
公式APIが無いためUIAutomationで操作。
- 引数: `-Action play|set|save|saveall|dump -Text "..." [-ExePath aivoice.exe]`
- テキスト欄: 名前が空のEdit要素をクリック→クリップボード経由で貼り付け
  (FlutterアプリのためUIAのSetFocus/SetValueは効かない)
- ボタン: Name="再生"/"書き出し"/"一括書き出し" を検索してInvoke
- 書き出し完了はパネル側で出力フォルダの新規wav出現を監視(pollNewWav)
- 出力: 標準出力に `OK: ...` / `ERR: メッセージ`

### Premiere ExtendScript ($._AQV_ 名前空間 / jsx/host.jsx)
- `placeVoice(wavPath, audioTrack, offsetSec)` … VoiceDeskビンにインポートし
  再生ヘッド+offset位置の指定トラックへ overwriteClip
- `getSelectedAudioClips()` … 選択中(無ければターゲットトラック全)音声クリップの
  `mediaPath\tstart\tend` 一覧を返す
- `insertCaption(srtPath)` … SRTをインポートし createCaptionTrack(item, 0)
- 戻り値規約: `OK:...` / `ERR:<コード>`。コードは index.html の JSX_ERR で日本語化

## 6. 重要な実装上の注意(ハマりどころ)

1. **jsx/host.jsx は必ずASCIIのみ**。日本語コメントを入れると日本語Windowsの
   ExtendScriptがShift-JISとして誤読し構文エラーで全機能停止する
2. **bridge/*.ps1 はUTF-8 BOM付き+CRLF**。BOM無しだとPowerShell 5.1が
   日本語文字列を壊す
3. **powershell.exe はフルパスで呼ぶ**(PS_EXE定数)。PATHに無い環境がある
4. ExtendScriptエンジンはPremiere内で共有の可能性があるため、
   グローバルは `$._AQV_` 名前空間のみ使用($._PPP_ 等を上書きしない)
5. SRTはUTF-8 BOM付きで書く(Premiereの文字化け防止)
6. txtのShift-JIS書き込みはNodeでは不可のためPowerShell経由
   (テキストは環境変数渡しで文字化け回避)
7. キャプションは createCaptionTrack 1回=1トラック。まとめて1つのSRTにしてから
   1回で挿入する設計にしている(都度挿入はトラックが乱立するため廃止済み)

## 7. ビルド・テスト

- ビルド不要(スクリプトのみ)。zipに固めて配布
- 動作確認: install.bat → Premiere再起動 → パネル表示
- JS構文チェック: `node --check`(scriptタグ内を抽出して実行)
- デバッグ: `%APPDATA%\Adobe\CEP\extensions\voicedesk` を直接編集し
  パネルを閉じて開き直すと反映される。CEFデバッグは .debug ファイルで可能
