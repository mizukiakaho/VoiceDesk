# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## これは何か

VoiceDesk は Adobe Premiere Pro 用の CEP エクステンション(パネル、ID: `com.nakashima.voicedesk`)です。
AquesTalk / VOICEVOX / VOICEVOX互換エンジン(AivisSpeech、SHAREVOX等) / A.I.VOICE2 という
複数の音声合成ソフトを、1つの掛け合い台本エディタからまとめて操作します。
行ごとにWAV+字幕用txtを生成し、Premiereのタイムラインへ配置、選択クリップからのキャプショントラック一括生成も行えます。

ビルドシステムはありません。プレーンなHTML/JS/ExtendScript/PowerShellのまま
CEPエクステンションフォルダへコピーして動かします。

## リポジトリ構成

```
CSXS/manifest.xml            CEPマニフェスト(バンドルID、対応ホストバージョン、パネルサイズ、CEFフラグ)
index.html                   パネル本体そのもの: UI+全ロジック(CEF/Chromium + Node.js)
jsx/host.jsx                 evalScript経由でPremiere内部で実行されるExtendScript($._AQV_ 名前空間)
bridge/aivoice2_bridge.ps1   A.I.VOICE2用のPowerShell UIAutomationブリッジ(公式APIが無いため)
install.bat                   %APPDATA%\Adobe\CEP\extensions へコピーしPlayerDebugModeを設定するインストーラ
docs/SPEC.md                  開発者向け仕様書(設定スキーマ・外部連携API仕様・ハマりどころ)。まず読むべき文書
docs/AI_PROMPT.md             AIに改修を依頼する際に使う定型プロンプトとルール
```

`docs/SPEC.md` が設定スキーマ(`localStorage` キー `voicedesk_settings_v2`)、
`voiceId` の形式(`aq:<プリセット名>`、`vv:<エンジン名>:<styleId>`、`av`)、
各外部連携のリクエスト/レスポンス仕様についての一次情報源です。
大きめの変更をする前に必ず目を通してください。

## コマンド

- **動作確認用インストール**: `install.bat` を実行する(リポジトリを `%APPDATA%\Adobe\CEP\extensions\voicedesk`
  へコピーし、CSXS 9〜12に対して `PlayerDebugMode=1` を設定する)。その後Premiere Proを再起動し、
  ウィンドウ > エクステンション > VoiceDesk を開く。
- **開発中の反映**: `%APPDATA%\Adobe\CEP\extensions\voicedesk` 内のファイルを直接編集するか、
  再度 `install.bat` を実行して同期する。パネルを閉じて開き直すと変更が反映される。
- **パネルJSの構文チェック**: `index.html` から `<script>` の中身を抽出し
  `node --check` で構文エラーが無いことを確認する。
- **自動テスト**: リポジトリ直下で `node --test`(または `npm test`)を実行する。
  `test/helpers/loadIndex.js` が `index.html` を一切変更せずに node:vm で読み込み、
  `<script>` 内の副作用の少ない純粋ロジック(ファイル名/パス計算、SRT/字幕生成、
  エラーメッセージ変換など)だけを切り出してテストする(npm依存パッケージは追加せず、
  Node標準モジュールのみ使用)。Premiere操作(`jsx/host.jsx`)・A.I.VOICE2連携
  (UIAutomation)・実際の音声合成エンジンとの通信は実環境前提のためテスト対象外。
- **ビルド・lintの仕組みは存在しない** — ビルドする提案・作業は行わないこと。動作確認は
  下記チェックリストによる手動確認 + `node --test` の自動テストを併用する。

## アーキテクチャ

```
index.html (CEF/Chromium + Node.js、単一ファイル: UI+全ロジック)
   ├─ AquesTalk:  child_process.execFile(AquesTalkPlayer.exe /T /P /W)
   ├─ VOICEVOX系: Node http → GET /speakers, POST /audio_query, POST /synthesis  (vvRequest())
   ├─ A.I.VOICE2: child_process → powershell.exe(フルパス、PS_EXE) → bridge/aivoice2_bridge.ps1(UIAutomation)
   └─ Premiere:   window.__adobe_cep__.evalScript → jsx/host.jsx ($._AQV_.*)
```

- Node統合はマニフェストのCEFフラグ `--enable-nodejs --mixed-context` で有効化されている。
- `jsx/host.jsx` は `$._AQV_` 名前空間の下に `placeVoice()` / `getSelectedAudioClips()` / `insertCaption()`
  を公開し、`OK:...` / `ERR:<コード>` という文字列を返す。`index.html` 側の `JSX_ERR` がそれを日本語化する。
- A.I.VOICE2には公開APIが無いため、`bridge/aivoice2_bridge.ps1` がUIAutomationでFlutter製UIを操作する
  (`-Action play|set|save|saveall|dump`)。テキストはクリップボード経由で貼り付ける
  (FlutterのコントロールにはSetFocus/SetValueが効かないため)。完了検知はパネル側が
  書き出しフォルダに新規wavが出現するのをポーリングして行う(`pollNewWav`)。
- 行の保存処理は`saveOneRow()`に一元化されており、全行保存(`btnSaveAll`)と行ごとの
  個別保存(💾ボタン、`saveRow`)の両方から呼ばれる。保存済み行には`rowsData[].saved`が立ち、
  `voicedesk_settings_v2`に永続化される。

## 重要な制約(編集前に必ず読むこと)

1. **`jsx/host.jsx` はASCII文字のみで書くこと。** 非ASCII文字(日本語コメント等)を含めると、
   日本語WindowsのExtendScriptがShift-JISとして誤読し、エクステンション全体が動かなくなる。
   また ES3相当のため `const`/`let`/アロー関数/テンプレートリテラルは使用不可。`var` のみ使うこと。
2. **`bridge/*.ps1` はUTF-8 BOM付き・改行CRLFを維持すること。** BOMが無いとPowerShell 5.1が
   日本語文字列を壊す。
3. **`powershell.exe` は必ずフルパスで呼ぶこと**(定数 `PS_EXE`、
   `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`)。PATHに無い環境があるため。
4. **ExtendScriptのグローバルは `$._AQV_` 名前空間のみを使用すること。** ExtendScriptエンジンは
   Premiere内で他のエクステンションと共有されている可能性があるため、他の名前空間(例: `$._PPP_`)
   に触れたり上書きしたりしないこと。
5. **SRTファイルはUTF-8 BOM付きで書くこと**(Premiereへのインポート時の文字化け防止)。
6. **Shift-JISでのテキスト書き込みはNodeからは行えない**ため、PowerShell経由で行う。
   テキストは文字化け防止のため環境変数渡しにしている。
7. **キャプション挿入はまとめて行う設計。** `createCaptionTrack` は呼び出すたびに新しいトラックを
   1本作るため、全キャプションを1つのSRTにまとめてから1回で挿入する
   (クリップ毎に都度挿入する方式は以前試みたがトラックが乱立するため廃止済み)。
8. **外部ライブラリの追加は不可** — `index.html` ではNode標準モジュールとCEP APIのみを使用すること。
9. 設定に新しいパス項目を追加する場合は、初期値を空にして参照(ブラウズ)ボタンを付けること
   (配布物であり、作者側で環境ごとに設定するものではないため)。

## 変更後の手動確認チェックリスト

- [ ] パネルの `<script>` 部分を抽出した内容に対して `node --check` が通ること(JS構文エラーが無いこと)
- [ ] `jsx/host.jsx` に非ASCII文字が含まれていないこと
- [ ] `install.bat` → Premiere Pro再起動 → パネルがエラー無く開くこと
- [ ] 既存の主要機能(行の保存によるWAV+txt生成、タイムライン配置、字幕生成)が壊れていないこと
- [ ] `index.html` 内の対象ロジック(ファイル名/パス計算、SRT/字幕生成、エラーメッセージ変換等)を
      変更した場合は `node --test` が全て緑(pass)であること