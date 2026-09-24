# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## これは何か

VoiceDesk は Adobe Premiere Pro 用の CEP エクステンション(パネル、ID: `com.nakashima.voicedesk`)です。
AquesTalk / VOICEVOX / VOICEVOX互換エンジン(AivisSpeech、SHAREVOX等) / A.I.VOICE2 という
複数の音声合成ソフトを、1つの掛け合い台本エディタからまとめて操作します。
行ごとにWAV+字幕用txtを生成し、Premiereのタイムラインへ配置、選択クリップからのキャプショントラック一括生成も行えます。

ビルドシステムはありません。プレーンなHTML/JS/ExtendScript/PowerShellのまま
CEPエクステンションフォルダへコピーして動かします。

## ドキュメントの役割分担(二重管理しないこと)

| 文書 | 書くこと | 書かないこと |
|---|---|---|
| `CLAUDE.md`(本書) | 作業の仕方: リポジトリ構成、コマンド、重要な制約、運用ルール、確認チェックリスト | 設定スキーマ・voiceId形式・関数の挙動など「システムの中身」 |
| `docs/SPEC.md` | システムの中身: アーキテクチャ、設定スキーマ、voiceId形式、外部連携仕様、保存・配置・字幕の挙動 | 作業ルール・制約・チェックリスト(本書を参照させる) |
| `docs/AI_PROMPT.md` | 外部AIに渡す依頼文の雛形のみ | 制約・チェックリストの本文(本書を添付させる) |
| `docs/AIVOICE2_RESEARCH.md` | A.I.VOICE2 の調査記録(調査時点のスナップショット) | 現行仕様(SPEC.md が正) |
| `README.md` / `CHANGELOG.md` | 利用者向けの説明 / 変更履歴 | 開発者向けの内部仕様 |

仕様を変えたら `docs/SPEC.md` を、作業ルールを変えたら本書を更新する。
同じ内容を別の文書に書き写さず、該当箇所への参照で済ませること。

## リポジトリ構成

```
CSXS/manifest.xml            CEPマニフェスト(バンドルID、バージョン、対応ホスト、パネルサイズ、CEFフラグ)
index.html                   パネル本体そのもの: UI+全ロジック(CEF/Chromium + Node.js)
jsx/host.jsx                 evalScript経由でPremiere内部で実行されるExtendScript($._AQV_ 名前空間)
bridge/aivoice2_bridge.ps1   A.I.VOICE2用のPowerShell UIAutomationブリッジ(公式APIが無いため)
install.bat                  %APPDATA%\Adobe\CEP\extensions へコピーしPlayerDebugModeを設定するインストーラ
test/                        node --test 用の自動テスト(test/helpers/loadIndex.js がハーネス)
docs/                        上記の役割分担表を参照
```

機能に関わる変更の前には、必ず `docs/SPEC.md` の該当章を読むこと。

## コマンド

- **動作確認用インストール**: `install.bat` を実行する(リポジトリを `%APPDATA%\Adobe\CEP\extensions\voicedesk`
  へコピーし、CSXS 9〜12に対して `PlayerDebugMode=1` を設定する)。その後Premiere Proを再起動し、
  ウィンドウ > エクステンション > VoiceDesk を開く。`install.bat` は最後に `pause` で入力待ちになる。
- **開発中の反映**: `%APPDATA%\Adobe\CEP\extensions\voicedesk` 内のファイルを直接編集するか、
  再度 `install.bat` を実行して同期する。パネルを閉じて開き直すと変更が反映される
  (ウィンドウメニューからの再選択では再読み込みされない。パネルタブの右クリック→「パネルを閉じる」→再度開く)。
- **パネルのデバッグ**: 拡張フォルダに `.debug` ファイル(ホスト `PPRO` とポートを指定)を置いてパネルを開き直すと、
  `http://localhost:<ポート>` からCEFのDevToolsに接続できる。作業後は `.debug` を削除すること。
- **パネルJSの構文チェック**: `index.html` から `<script>` の中身を抽出し
  `node --check` で構文エラーが無いことを確認する。
- **自動テスト**: リポジトリ直下で `node --test`(または `npm test`)を実行する。
  `test/helpers/loadIndex.js` が `index.html` を一切変更せずに node:vm で読み込み、
  `<script>` 内の副作用の少ない純粋ロジックだけを切り出してテストする(npm依存パッケージは追加せず、
  Node標準モジュールのみ使用)。vm の別realmのオブジェクトを返す関数は `assert.deepEqual` が誤判定するため、
  `JSON.stringify` か要素ごとの比較で検証する。Premiere操作・A.I.VOICE2連携・実際の音声合成エンジンとの
  通信は実環境前提のためテスト対象外。
- **ビルド・lintの仕組みは存在しない** — ビルドする提案・作業は行わないこと。動作確認は
  下記チェックリストによる手動確認 + `node --test` の自動テストを併用する。

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
7. **キャプション挿入はクリップ単位で行わないこと。** `createCaptionTrack` は呼び出すたびに新しいトラックを
   1本作るため、音声トラックごとに1つのSRTへまとめ、トラック数分だけ挿入する
   (クリップ毎の都度挿入はトラックが乱立するため廃止済み)。
8. **外部ライブラリの追加は不可** — `index.html` ではNode標準モジュールとCEP APIのみを使用すること。
9. 設定に新しいパス項目を追加する場合は、初期値を空にして参照(ブラウズ)ボタンを付けること
   (配布物であり、作者側で環境ごとに設定するものではないため)。
10. **A.I.VOICE2ブリッジの `Get-AivoiceWindow` の関数構造を変えないこと。** FlutterのUIAツリーは
    この構造でしか安定して取得できない(理由と実測は `docs/SPEC.md` 5章)。
11. **ユーザーのデータを消す・上書きする可能性がある操作は、実データで試さないこと。**
    特にA.I.VOICE2の作業フォルダ(`avOutDir`)は保存のたびにVoiceDeskの書き出しファイルが消される
    (消す範囲の判定は `docs/SPEC.md` 5章。判定を変える変更は特に慎重に)。実機確認では
    出力先をスクラッチフォルダに切り替え、Premiereの本番シーケンスではなく使い捨てのシーケンスで配置を試す。

## ブランチ・バージョン運用ルール

- **ブランチ**: `main` は常に動く状態を保つ。typo修正や小さい調整は `main` に直接コミットしてよい。
  機能追加や大きめの変更は `feature/xxx` を切って作業し、下記チェックリスト(+ `node --test`)を
  通してから `main` にマージする(マージ後ブランチは削除)。
- **バージョン**: SemVer簡易版(`MAJOR.MINOR.PATCH`)。当面 `MAJOR` は上げず `1.x.x` で運用する。
  - PATCH: バグ修正のみ
  - MINOR: 新機能追加・既存動作の変更
- **バージョンを上げるタイミング**: `feature/xxx` を `main` にマージするタイミングで、以下を同時に更新する。
  1. `CSXS/manifest.xml` の `ExtensionBundleVersion` と `Extension Version`(2箇所)
  2. `CHANGELOG.md` に新バージョンのセクションを追記
  3. マージコミットのメッセージ末尾に `v1.x.x` を付記
- **タグ**: マージコミットに `git tag v1.x.x` を打つ(過去バージョンへ戻すための目印)。
- バージョン番号の一次情報は `CSXS/manifest.xml`。他の文書にバージョン番号を書き写さないこと。

## 変更後の手動確認チェックリスト

- [ ] パネルの `<script>` 部分を抽出した内容に対して `node --check` が通ること(JS構文エラーが無いこと)
- [ ] `jsx/host.jsx` に非ASCII文字が含まれていないこと
- [ ] `bridge/*.ps1` を変更した場合、BOM付き・CRLFのままで、PowerShellのパースエラーが無いこと
- [ ] `install.bat` → Premiere Pro再起動 → パネルがエラー無く開くこと
- [ ] 既存の主要機能(行の保存によるWAV+txt生成、タイムライン配置、字幕生成)が壊れていないこと
- [ ] `index.html` 内のロジックを変更した場合は `node --test` が全て緑(pass)であること
- [ ] 仕様を変えた場合は `docs/SPEC.md` を、利用者から見える挙動を変えた場合は `README.md` を更新したこと
