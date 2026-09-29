# A.I.VOICE2 自動化 調査メモと実装方針

調査日: 2026-09-16 / 対象: A.I.VOICE2 Editor 2.14.1(Windows 11、結月ゆかり(NV) 48kHz)

> **本書は調査時点の記録であり、現行仕様ではない。** 実装の現行仕様は `docs/SPEC.md` 5章「A.I.VOICE2」が正。
> 本書は「なぜその設計にしたか」「A.I.VOICE2 の挙動をどう実測したか」を残すためのもので、
> 実装を変えても本書は更新しない(A.I.VOICE2 のバージョンアップで挙動が変わった場合に再調査の出発点として使う)。

## 0. 結論(先に要点)

- **公式API・CLI・HTTP/名前付きパイプは v2.14.1 時点でも存在しない**(リリースノート 2.2.2〜2.14.1 を全件確認。
  実行ファイルも Flutter + 同梱 .NET ランタイム構成で、待ち受けポート・子プロセス・パイプは無し)。
  したがって UI 操作(UIAutomation)を介する現行方式自体は変えられない。
- ただし **「プロジェクトファイル(.aieprojx、JSON)を VoiceDesk 側で生成して開かせ、一括書き出しを1回押す」**
  方式に切り替えれば、行ごとに「テキスト貼り付け→書き出し→ダイアログ→フォルダ監視」を繰り返す現行方式の
  問題(遅い・フォーカスを奪う・クリップボードを壊す・キャラを選べない・保存ダイアログが毎回出る)を
  まとめて解消できる。**実機で「キャラ名+本文だけの最小プロジェクトを開いて書き出す」までの動作を確認済み。**
- 現在この PC の A.I.VOICE2 は `ファイル名の指定方法 = ダイアログで指定`、`一括書き出し = 1つのファイルに書き出す`
  になっている。**この2設定が現行 VoiceDesk 連携の使用感の悪さの主因**(書き出しのたびに保存ダイアログが
  出て手動操作が必要 → VoiceDesk は最大120秒フォルダ監視で待つだけ)。新方式でもこの2設定の変更は必須。

## 1. 現行方式(v1.2.1)の何が悪いか

`index.html` の `saveOneRow()` → `runBridge(['-Action','save','-Text',text])` → `pollNewWav()` の流れで、行ごとに:

| 手順 | 現状 | 問題 |
|---|---|---|
| PowerShell 起動 + UIA 初期化 | 1〜2秒/行 | 行数分かかる |
| `SetForegroundWindow` | 毎行 A.I.VOICE2 を前面化 | Premiere からフォーカスを奪う。作業中断 |
| テキスト入力 | クリップボード経由(Ctrl+A/Del/Ctrl+V) | ユーザーのクリップボードを上書き |
| キャラ選択 | 不可(`voiceId` が `av` 固定) | A.I.VOICE2 側で選択中のキャラで固定される |
| 「書き出し」押下 | 設定が「ダイアログで指定」だと保存ダイアログが出る | **ユーザーが手でファイル名を入れて保存しないと進まない** |
| 完了検知 | 1.5秒間隔で新規 wav を mtime 監視、検知後さらに0.8秒待ち | 遅い。他の書き出しと混同しうる |
| 命名 | 検知した wav を `rename` | 書き出し先直下しか監視しない |

## 2. 調査で判明した事実

### 2-1. 公式API/自動化手段の有無
- リリースノート(https://aivoice.jp/manual/editor2/release_notes.html)に API/外部連携/コマンドラインの記載は無し。
  A.I.VOICE(無印)にあった `AI.Talk.Editor.Api.dll` 相当は A.I.VOICE2 に無い。
- コミュニティ(YMM4/AoiSupport/かんしくん)も全て「命名規則+テキスト同時保存+フォルダ監視」の間接連携。
- インストール構成: `C:\Program Files\AI\AIVoice2\AIVoice2Editor\aivoice.exe`(Flutter)、`data\app.so`(Dart AOT)、
  `coreclr.dll` 等(.NET 6 ランタイム同梱)、`Lib\AITalk\aitalk_engine.dll`(合成エンジン、ライセンス付き)。
  エンジン DLL の直接利用はライセンス上・技術上とも対象外とする。
- 起動中の `aivoice.exe` に TCP 待ち受け・子プロセス・名前付きパイプ無し(`Get-NetTCPConnection` 等で確認)。

### 2-2. A.I.VOICE2 のローカルファイル(VoiceDesk から読める)

| ファイル | 内容 |
|---|---|
| `%LOCALAPPDATA%\AI\A.I.VOICE Editor\2.0\app_settings.json` | アプリ設定(下記) |
| `%USERPROFILE%\Documents\AI\A.I.VOICE Editor\2.0\characters.vpcx` | キャラクター(ボイスプリセット)一覧。JSON |
| `%APPDATA%\AI\AIVoice2\app.log` | ログ(`Save audio.` / `Save Audio Success.` が書き出しの開始/完了に対応) |
| レジストリ `HKCR\AIVoice2.Editor\shell\open\command` | `"...\aivoice.exe" "%1"`。拡張子 `.aieprojx` が関連付け済み |

`app_settings.json` の `saveWave` セクション(この PC の現在値):
```json
"saveWave": {
  "format": "wav-16-48000",            // wav-16-{8000..48000}
  "exportAllAction": "combine",        // 一括書き出し: "combine"=1ファイルに結合 / "textblock"=ブロック毎(4章で確認)
  "saveText": true,                    // テキストファイルを音声と一緒に保存
  "textEncoding": "UTF-8",             // UTF-8 | CP932
  "saveLab": false,
  "filePathSelectionMode": "dialog",   // "dialog" | "namingRule"(Dart側の文字列から確認)
  "namingRule": { "directory": "", "file": "", "textLength": 10, "numberDigit": 3, "numberStart": 1 },
  "customPause": { "enable": true, "head": 0, "tail": 200 }
}
```
- 命名規則で使えるプレースホルダ(app.so 内の文字列より): `{Number}` `{Number=3}` `{Character}` `{Text}` `{Text=10}`
  `{Project}` `{yyyyMMdd}` `{HHmmss}`。`{Number}` はブロック番号(`numberStart` 起点)。
- `characters.vpcx`: `{"version":"2.1","characters":[{"name":"結月ゆかり(通常","voice":"YuzukiYukari_ns_48","userCustom":true,"tuning":{...}}, ...]}`
  → `name` がそのまま UI のキャラ名・`{Character}`・プロジェクトの `character` になる。

### 2-3. プロジェクトファイル `.aieprojx`
- JSON。`{"version":"3.1","textblocks":[{"character":"<キャラ名>","text":"<本文>","imkana":"<暗号化された読み情報>","tuning":{...}}]}`
- **`character` と `text` だけの最小ブロックでも正常に開け、キャラも正しく割り当たり、そのまま「書き出し」で
  wav+txt が生成できることを実機確認**(`imkana`/`tuning` は省略可。読みは開いた時に再生成される)。
  - 検証: 3ブロック(通常/呆れ/喜び)の最小 JSON → ファイル→プロジェクトを開く → 3ブロック表示 → 書き出し →
    `block1.wav`(48kHz/16bit/mono、1.52秒)+ `block1.txt`(UTF-8、BOM無し、本文1行)
- 関連付けにより `aivoice.exe <path>.aieprojx` で起動時に開ける(起動中のインスタンスには渡らない。4章参照)。

### 2-4. UIAutomation まわりの実測(ハマりどころ)
1. **Flutter のアクセシビリティツリーは「最初の問い合わせ→数百ms待つ」まで空**。しかも同一 PowerShell プロセス内で
   一度空のツリーを取ると以後ずっと空のまま(UIA クライアント側が「ネイティブプロバイダ無し」とキャッシュする挙動)。
   現行ブリッジの `Get-AivoiceWindow`(関数内で `FindFirst` → `Start-Sleep 300` → `return $win`)の形なら安定して
   取れる(19回中19回成功)。同じ処理を関数外にインライン展開すると失敗する(再現性あり、原因は PowerShell の
   パイプライン出力処理の副作用と推定)。**ブリッジ改修時はこの関数構造を崩さないこと。**
2. 前面化(`SetForegroundWindow`)はツリー取得には不要。ボタンの `InvokePattern.Invoke()` も前面化不要で効く
   (メニュー「ファイル」→「プロジェクトを開く」まで Invoke で到達できた)。
3. テキスト欄(名前空の `Edit`): `ValuePattern` で**読み取りは可**、`SetValue` は "Operation cannot be performed"(不可)。
   `TextPattern` 無し。`PostMessage(WM_CHAR)` を FLUTTERVIEW 子ウィンドウに送るとクリップボード無しで文字入力できる
   (ただし Flutter 側でその欄にフォーカスがある時のみ)。
4. Win32 のファイルダイアログ(開く/名前を付けて保存)は `#32770` で出る。UIA で `AutomationId=1001` の Edit は
   見つからないが、ダイアログ表示直後はファイル名欄にフォーカスがあるので `SendKeys`(Ctrl+A → パス → Enter)で確実に
   操作できる。所有ウィンドウなので `RootElement.FindAll(Children, ProcessId)` では列挙されない → `GetForegroundWindow`
   のクラス名で検出する。
5. キーボードショートカット(公式): 書き出し Ctrl+E、一括書き出し(すべて) Ctrl+Shift+E、(選択ブロック) Ctrl+Shift+W、
   キャラ割り当て Ctrl+1〜0(一覧の上から順)、選択中キャラを割り当て Ctrl+Q、プロジェクトを開く Ctrl+O。
   ただしテキスト欄にフォーカスがあると `SendKeys("^+s")` が効かなかった(メニューの Invoke の方が確実)。

## 3. 実装方針(案)

### 案A(推奨): プロジェクト生成 + 一括書き出し方式
```
VoiceDesk(index.html)
  1. A.I.VOICE2 の行を集める(声 = av:<キャラ名>)
  2. <tmp>\voicedesk_<ts>.aieprojx を生成(textblocks = [{character, text}, ...])
  3. bridge -Action exportproj -Project <path> -OutDir <dir>
        a. aivoice.exe 未起動 → aivoice.exe <path> で起動 / 起動中 → メニュー「プロジェクトを開く」→ダイアログにパス入力
           (未保存の変更がある場合は確認ダイアログが出るので、その場合は中断してユーザーに知らせる)
        b. 「一括書き出し(すべて)」を Invoke(命名規則モードなら無言で保存、ダイアログモードならフォルダ選択を代行)
        c. 前面ウィンドウを元(Premiere)に戻す
  4. 出力フォルダで {Number}_{Character}_{Text}.wav が行数分そろうのを待つ(fs.watch + タイムアウト)
  5. 番号→行 の対応で VoiceDesk 流の連番名に rename/移動し、以降は既存の saveOneRow と同じ(txt/配置)
```
- 利点: 前面化・PowerShell 起動が **N行で1回**。キャラ選択可。クリップボード不使用。ファイル対応が番号で確定。
  txt も A.I.VOICE2 が同時保存するので VoiceDesk 側の生成は不要(必要なら上書き)。
- 前提となる A.I.VOICE2 側の設定: `filePathSelectionMode=namingRule`、`namingRule.file` に `{Number=3}_{Character}_{Text=10}`
  相当、`namingRule.directory` = VoiceDesk の A.I.VOICE2 書き出し先、`exportAllAction` = ブロック毎、`saveText=true`。
  VoiceDesk は `app_settings.json` を読んで不足を具体的に案内する(もしくは A.I.VOICE2 停止中に限り書き換えを代行)。
- `voiceId`: `av` → `av:<キャラ名>`(`characters.vpcx` から一覧生成。旧 `av` は互換のため「A.I.VOICE2(現在の選択)」として残す)。
  保存先フォルダは `AIVOICE2_<キャラ名>` にでき、他エンジンと揃う。
- 「再生」(行の▶)は現行どおり単発(テキスト入力+再生ボタン)でよいが、キャラ割り当て(Ctrl+1〜0 or 一覧クリック+Ctrl+Q)を追加。

### 案B: 現行の行単位方式のまま改善(小改修)
- 前面化後に元のウィンドウへ戻す / `fs.watch` で即時検知 / WM_CHAR で貼り付け(クリップボード不使用)/ キャラ割り当て。
- 「ダイアログで指定」のままだと保存ダイアログ操作の代行が毎行必要。根本的な遅さ(行ごとの往復)は残る。

### 案C: 完全バックグラウンド化
- 不可。Flutter はキーボード入力に前面フォーカスが必要で、ファイルダイアログも前面操作が必要。
  案Aで「バッチ1回だけ前面化して即戻す」が現実的な最小。

### 推奨: 案A(+案Bのうち「前面復帰」「fs.watch」は共通で入れる)

## 4. 実測で確定した事項(当初の未確定事項の結果)

1. `exportAllAction` の値: `"textblock"`(テキストブロックごと) / `"combine"`(1ファイルに結合)。
   `filePathSelectionMode` の値: `"dialog"` / `"namingRule"`(A.I.VOICE2 の設定画面で切り替えて `app_settings.json` を読んで確認)。
2. 命名規則モードの「一括書き出し」は Win32 のフォルダ選択ダイアログではなく、**Flutter 内の確認ダイアログ
   「一括書き出し(命名規則)」**(保存先フォルダ欄・命名規則欄・「書き出しを実行」ボタン)が出る。保存先フォルダ欄は
   クリック→Ctrl+A→SendKeys で書き換え可能で、`namingRule.directory` に依存せず毎回フォルダを指定できる
   (ブリッジの `exportproj` はこの方式)。実行後の保存先はA.I.VOICE2側の設定にも保存される。
3. `aivoice.exe <proj>` は **未起動時のみ**有効(起動時にそのプロジェクトを開く。起動〜ブロック表示まで約5秒)。
   起動中に実行しても2重起動にはならず、既存インスタンスでプロジェクトが開かれることも無い(無視される)。
   → 起動中は「ファイル」→「プロジェクトを開く」→ 開くダイアログ(#32770)へパス入力、で開く。
4. 未保存の変更がある状態で「プロジェクトを開く」「終了」をすると Flutter 内ダイアログ
   「プロジェクトが編集されています。編集内容を保存しますか？」(ボタン: 保存 / 破棄 / キャンセル)が出る。
   ブリッジは、開いているのが VoiceDesk 生成プロジェクト(`voicedesk_<数字>.aieprojx`)なら「破棄」、
   ユーザーのプロジェクトなら「キャンセル」を押して `ERR: DIRTY: ...` で中断する(勝手に破棄しない)。
   書き出しを行うとプロジェクトは編集済み扱いになる(タイトルに `*` が付かない場合もある)。
5. `app_settings.json` の書き換えは **A.I.VOICE2 停止中に行う必要がある**(終了時にメモリ上の設定で上書きされる)。
   また `namingRule.directory` に Windows パス(`C:\...`)を書くと設定ファイル全体が「壊れている」扱いになり
   `app_settings_<日時>_broken.json` に退避されて既定値に戻される(ユーザー設定が失われる)。パスは
   `file:///C:/...` 形式の URI で書く必要がある(VoiceDesk は directory を書き換えない方針にした)。
   JSON の空白・キー順は問わない(Node の `JSON.stringify` 出力で受理される)。
6. 一括書き出しの所要時間(結月ゆかり 48kHz、3ブロック): 「書き出しを実行」から3ファイル生成まで約3〜5秒。
   A.I.VOICE2 未起動からなら起動込みで約13〜17秒。
7. `{Text=10}` で切り詰められたファイル名は末尾が `… `(三点リーダ+半角スペース)になる。行との対応付けには
   先頭の `{Number=3}` のみを使う(`avParseExportNumber`)。

## 4-2. 実装(feature/aivoice2-batch)

- `bridge/aivoice2_bridge.ps1`: `-Action exportproj -Project <path> -OutDir <dir>`(未起動なら引数付き起動、起動中なら
  メニューから開く → 一括書き出し → 保存先欄を書き換えて実行 → 呼び出し前の前面ウィンドウへ戻す)、
  `-Action play/set/save -Character <キャラ名>`(キャラ一覧の項目クリック + Ctrl+Q で割り当て)、`-Action status`。
- `index.html`: voiceId `av:<キャラ名>`(`characters.vpcx` から列挙、旧 `av` は互換で残す)、
  `avEnsureSettings()`(A.I.VOICE2 停止中に `app_settings.json` を自動調整、`.voicedesk.bak` に退避)、
  `avBatchExport()`(プロジェクト生成 → `exportproj` → `avWaitExports` で連番wavがそろいサイズが安定するまで待つ)、
  全行保存では A.I.VOICE2 の行を先にまとめて書き出してから各行の配置を行う。保存先は他エンジンと同じ
  `outDir/AIVOICE2_<キャラ名>/<連番>_<セリフ>.wav`。作業フォルダ(既定 `outDir/_aivoice2_export`)は毎回空にする。
- 統合テスト(Premiere無し、Node から `avBatchExport`+`saveOneRow` を実行): 3行(通常/喜び/キャラ未指定)で
  約17秒、wav+txt が各キャラフォルダに生成、作業フォルダに残骸無し。

## 5. 検証ログ(再現手順)
- UIA 列挙: `bridge/aivoice2_bridge.ps1 -Action dump`(前面化あり)/ 同スクリプトの `SetForegroundWindow` を外しても列挙可。
- 最小プロジェクトの生成→「ファイル|プロジェクトを開く」Invoke →「開く」ダイアログに `SendKeys` でパス+Enter → 3ブロック確認
  → 「書き出し」Invoke → 「名前を付けて保存」ダイアログに `SendKeys` でパス+Enter → wav/txt 生成(クリックから約12秒、
  うち待ち時間の大半はスクリプト側のスリープ)。
- テキスト欄の `ValuePattern.Current.Value` 読み取りで各ブロックの本文を取得できる(書き出し前の内容確認に使える)。
