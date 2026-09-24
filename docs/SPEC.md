# VoiceDesk 仕様書(開発者向け)

本書は「システムの中身」(アーキテクチャ・設定スキーマ・voiceId形式・外部連携・保存/配置/字幕の挙動)の
一次情報源。リポジトリ構成・コマンド・編集時の制約・運用ルール・確認チェックリストは `CLAUDE.md` を参照し、
本書には書き写さない。バージョン番号は `CSXS/manifest.xml`、変更履歴は `CHANGELOG.md` を参照。

## 1. 概要

Adobe Premiere Pro 用 CEP エクステンション。パネル(HTML/JS)から複数の音声合成ソフトを
操作し、WAV+txt生成、タイムライン配置、字幕(SRT→キャプショントラック)生成を行う。

## 2. ファイル構成

`CLAUDE.md` の「リポジトリ構成」を参照。

## 3. アーキテクチャ

```
[index.html (CEF/Chromium + Node.js)]
   ├─ AquesTalk:  child_process.execFile(AquesTalkPlayer.exe /T /P /W)
   ├─ VOICEVOX系: Node http → GET /speakers, POST /audio_query, POST /synthesis
   ├─ A.I.VOICE2: .aieprojx を生成 → powershell.exe(PS_EXE) → bridge.ps1(UIAutomation)で一括書き出し
   │              (characters.vpcx / app_settings.json は Node の fs で直接読み書き)
   └─ Premiere:   window.__adobe_cep__.evalScript → jsx/host.jsx ($._AQV_.*)
```

- Node統合はmanifestの `--enable-nodejs --mixed-context` で有効化

## 4. データ構造

設定は「共通ファイル(`%APPDATA%\VoiceDesk\settings.json`)」と「パネルのlocalStorage
(`voicedesk_rows_v1`)」の2箇所に分かれている(旧バージョンではlocalStorageのキー
`voicedesk_settings_v2`に全て格納していた。v1.2.x の次のバージョンで分割)。

### 4-1. 共通設定ファイル(`%APPDATA%\VoiceDesk\settings.json`)

WAV出力先・各エンジンのパス・トラック割当・お気に入り等、Premiereプロジェクトに依存しない
「マシン単位の設定」を格納する。JSON、UTF-8(BOM無し)、インデント2。

```json
{
  "exePath":   "AquesTalkPlayer.exeパス",
  "avExePath": "aivoice.exeパス",
  "outDir":    "WAV出力フォルダ",
  "avOutDir":  "A.I.VOICE2一括書き出しの作業フォルダ(空なら outDir/_aivoice2_export)",
  "avCharsPath":    "characters.vpcx のパス(空なら %USERPROFILE%\\Documents\\AI\\A.I.VOICE Editor\\2.0\\characters.vpcx)",
  "avSettingsPath": "app_settings.json のパス(空なら %LOCALAPPDATA%\\AI\\A.I.VOICE Editor\\2.0\\app_settings.json)",
  "engines":   [{"name":"VOICEVOX","url":"http://127.0.0.1:50021","exe":"run.exeパス"}],
  "vvAutoLaunch": true,
  "txtEnc": "sjis|utf8",
  "makeTxt": true, "namePrefix": false, "insAudio": false, "insGap": 0,
  "trackMap": {"voiceId": "トラック番号"},
  "vvSpeakerCache": {"エンジン名": [{"id":3,"label":"ずんだもん(ノーマル)"}]},
  "vvTuning": {"vv:VOICEVOX:3": {"speedScale":1.2, "intonationScale":1.1}},
  "favVoices": ["vv:VOICEVOX:3", "aq:れいむ"]
}
```
- 保存先パスは固定(`globalSettingsPath()`、`path.join(process.env.APPDATA || os.homedir(),
  'VoiceDesk', 'settings.json')`)で、UIから変更はできない。設定欄末尾に読み取り専用表示のみ行う
  (`#settingsPathLabel`)。パス項目自体ではないため参照ボタンは付けない
- 書き込みは`writeGlobalSettings()`が担当し、`fs.writeFileSync(tmp)`→`fs.renameSync(tmp, path)`の
  アトミック書き込みを行う(`settings.json.tmp`経由)。直前に書き込んだ内容とJSON文字列が同一なら
  何もしない(`change`イベント毎の無駄な書き込み抑止)
- 書き込みに失敗した場合(フォルダ作成不可等)は、パネル内動作を止めないよう旧キー
  `voicedesk_settings_v2`(localStorage)へフォールバック保存し、その起動中は1回だけ
  ステータス欄にエラーを表示する
- `insGap`(任意、既定0)は全行保存で音声をシーケンスへ配置する際のクリップ間ギャップ(秒)。
  `saveOneRow`内で`advance = 音声長 + insGap`としてオフセットに使われる。空欄・不正値・負値は
  0(隙間なし)にフォールバックする。個別保存(`offset:0`単発配置)には実質影響しない。
  未指定の旧設定も0として扱われる
- `vvTuning`(任意)はVOICEVOX系の話者(voiceId)ごとの調声設定。標準6項目
  (`speedScale`/`pitchScale`/`intonationScale`/`volumeScale`/`prePhonemeLength`/`postPhonemeLength`)
  のうち既定値と異なるキーのみを部分オブジェクトとして格納する。`saved`と同様、
  調声パネルで保存・リセットすると、当該voiceIdを使用している行の`saved`は解除される
  (`clearSavedForVoice`)
- `favVoices`(任意)はお気に入り登録した声のvoiceId配列。登録順がそのままプルダウンの
  「★ お気に入り」グループ内の表示順になる。各行の☆/★ボタン(`toggleFavVoice`)で追加・解除する。
  未指定/旧設定の場合は空配列扱いとなり、お気に入りグループ自体が表示されず従来どおりの
  フラットな声リストになる。エンジン削除等で該当voiceIdが現行の声リストに存在しなくなった
  場合も、`favVoices`からは削除されず(表示上スキップされるのみ)、エンジンが復帰すれば
  再びお気に入りとして表示される(`partitionVoices`)

### 4-2. パネルのlocalStorage(key `voicedesk_rows_v1`)

台本(行データ)のみを格納する。CEPパネルのストレージ区画単位(現状は真のプロジェクト単位
ではない)。

```json
{
  "rowsData": [{"voice":"voiceId","text":"セリフ","saved":true}]
}
```
- `saved`(任意)は個別保存/全行保存で書き出し済みになった行に付く。声・セリフを編集すると
  解除される。localStorageに永続化されるためパネル再起動後も保持される

### 4-3. 旧形式からの移行

旧バージョン(〜v1.2.x)はlocalStorageの`voicedesk_settings_v2`に全設定(`rowsData`含む)を
1つのJSONとして保存していた。`loadSettings()`は起動時に以下の順で解決する。
1. 共通ファイル(`%APPDATA%\VoiceDesk\settings.json`)が読めればそれを使う
2. 読めない(未作成/壊れている)場合、旧キー`voicedesk_settings_v2`があれば
   `pickGlobalSettings()`で共通設定15キーのみを抽出して初期値にし、その場で
   `saveSettings()`を呼んで共通ファイルへ書き出す(移行完了、ステータス欄に通知)。
   `engines`配列を持たないさらに古い形式のために、`vvUrl`/`vvExePath`もこの移行時のみ
   一時的に引き継ぎ、直後の`engines`既定値生成(`engines[0].url`/`engines[0].exe`)に
   反映してから保存する(この2キー自体は`GLOBAL_KEYS`に含まれないため共通ファイルには
   書き出されない)
3. どちらも無ければ空の設定として起動する(初回起動)

台本(`rowsData`)は共通ファイルの読み込み有無に関わらず、`voicedesk_rows_v1`
(無ければ旧`voicedesk_settings_v2`内の`rowsData`)から独立して読み込む。
旧キー`voicedesk_settings_v2`自体は削除しない(過去バージョンに戻した場合の読み込み元、
および共通ファイル書き込み失敗時のフォールバック先として残す)。

### voiceId 形式
- `aq:<プリセット名>` … AquesTalk (例 `aq:れいむ`)
- `vv:<エンジン名>:<styleId>` … VOICEVOX系 (例 `vv:VOICEVOX:3`)
- `av:<キャラ名>` … A.I.VOICE2 (例 `av:結月ゆかり(通常`。キャラ名は `characters.vpcx` の `characters[].name` そのもの)
- `av` … A.I.VOICE2(キャラ未指定、旧形式の互換用。書き出し時は一覧先頭のキャラ、再生時はA.I.VOICE2側で選択中のキャラ)

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
- `/audio_query`取得後・`/synthesis`送信前に、`vvTuning[voiceId]`があれば
  `applyVvTuning(query, vvTuning[voiceId])`でクエリJSONへ反映する(`vvSynthToFile`内)。
  対象は標準6項目のみで、それ以外のフィールド(`accent_phrases`等)や未登録voiceIdの
  クエリは無改変で通過する

### A.I.VOICE2 (bridge/aivoice2_bridge.ps1)
公式APIが無いためUIAutomationで操作。調査の詳細と実測値は `docs/AIVOICE2_RESEARCH.md` を参照。
- 引数: `-Action play|set|save|saveall|exportproj|status|dump [-Text "..."] [-Character "キャラ名"]
  [-Project x.aieprojx] [-OutDir dir] [-ExePath aivoice.exe]`
- **保存は `exportproj`(プロジェクト一括方式)**: パネルが `.aieprojx`(JSON:
  `{"version":"3.1","textblocks":[{"character","text"}]}`、読み情報は省略可)を `%TEMP%\voicedesk_<ms>.aieprojx` に
  生成 → ブリッジが未起動なら `aivoice.exe <proj>` で起動(起動中なら「ファイル」→「プロジェクトを開く」→
  開くダイアログにパス入力) → 「一括書き出し」→ 確認ダイアログの保存先フォルダ欄を `-OutDir` に書き換え →
  「書き出しを実行」→ 呼び出し前の前面ウィンドウ(Premiere)へ戻す。行数に関係なく前面化は1回。
  A.I.VOICE2 が `<OutDir>/{Number=3}_{Character}_{Text=10}.wav`(+txt)を書き出すので、パネル側は
  `avWaitExports()` で連番wavが行数分そろいサイズが安定するのを待ち、連番(1始まり)で行に対応付ける
- A.I.VOICE2 側の前提設定(`app_settings.json` の `saveWave`): `filePathSelectionMode: "namingRule"`、
  `namingRule.file` に `{Number}`(または `{Number=N}`)を含むこと、`namingRule.numberStart: 1`、
  `exportAllAction: "textblock"`。`avEnsureSettings()` が保存前に検査し、不足があれば
  **A.I.VOICE2 停止中に限り**(起動中は終了を促すエラー)元を `app_settings.json.voicedesk.bak` に退避して
  必要項目だけ書き換える(`avPatchSettings`、他の設定は保持)。起動中に書き換えても終了時に上書きされるため。
  `namingRule.directory` は触らない(Windowsパスを書くと設定ファイル全体が壊れた扱いになるため。書くなら
  `file:///C:/...` 形式)
- 未保存の変更がある場合: 開いているのが VoiceDesk 生成プロジェクト(`voicedesk_<数字>.aieprojx`)なら
  ブリッジが「破棄」を押す。ユーザーのプロジェクトなら「キャンセル」して `ERR: DIRTY: ...` で中断する
- `play`/`set`/`save` の `-Character`: キャラクター一覧の項目(Image要素、Nameがキャラ名で始まる)を
  クリック→Ctrl+Q で現在のブロックに割り当てる。テキスト欄は名前が空のEdit要素をクリック→
  クリップボード経由で貼り付け(FlutterアプリのためUIAのSetFocus/SetValueは効かない)
- ボタン: Name="再生"/"書き出し"/"一括書き出し"/"書き出しを実行" を検索してInvoke(前面化不要)
- Win32ダイアログ(開く/フォルダー選択、クラス `#32770`)は前面ウィンドウのクラス名+プロセスIDで検出し、
  表示直後にフォーカスのあるファイル名欄へ SendKeys でパス+Enter を送る
- **ハマりどころ**: Flutter のUIAツリーは最初の問い合わせ直後は空で、`Get-AivoiceWindow` の
  「関数内で FindFirst → Start-Sleep 300ms → return」という構造でのみ安定して取得できる
  (インライン展開すると同じ手順でも空になる)。この関数の構造を変えないこと
- 出力: 標準出力に `OK: ...` / `ERR: メッセージ`

### Premiere ExtendScript ($._AQV_ 名前空間 / jsx/host.jsx)
- `placeVoice(wavPath, audioTrack, offsetSec, binName)` … VoiceDeskビン(binName指定時は
  その配下のサブビン、`getVoiceSubBin`で取得/作成)にインポートし
  再生ヘッド+offset位置の指定トラックへ overwriteClip。binNameが空/未指定なら
  従来通りVoiceDeskビン直下(後方互換)
- `getVoiceSubBin(subName)` … VoiceDeskビン直下のsubName名サブビンを取得、無ければ作成。
  subNameが空ならVoiceDeskビン自体を返す
- `getSelectedAudioClips()` … 選択中(無ければターゲットトラック全)音声クリップの
  `mediaPath\tstart\tend\ttrackIndex` 一覧を返す(trackIndexは1-based、`placeVoice`の
  `audioTrack`引数と同じ慣習)。実装は`seq.getSelection()`を使わず`seq.audioTracks`を
  インデックス順にループし、各クリップの`clip.isSelected()`で選択判定する方式
  (選択クリップから所属トラック番号を逆引きする公式APIが無いため)
- `insertCaption(srtPath)` … SRTをインポートし createCaptionTrack(item, 0)(VoiceDeskビン直下、
  サブビン分けの対象外)。字幕生成は常にトラック毎に分割される設計で、index.html側が
  ターゲットトラック(またはトラック番号)ごとにSRTを分けてこの関数を複数回呼ぶ。
  1回の呼び出し=1キャプショントラックという不変条件は変わらない。
  createCaptionTrackはトラック名を指定できない
- `setPlayheadSec(sec)` … シーケンスの再生ヘッド(CTI)を絶対位置`sec`秒へ移動する。
  `Sequence.setPlayerPosition(ticksString)`は引数が秒ではなくticks文字列(1秒=
  `$._AQV_.TICKS_PER_SEC`=254016000000ticks)のため、秒→ticksへ変換し`String(ticks)`で
  渡す(数値のまま渡すとAPIが受け付けない)。安全整数上限を超えるticksになる場合は
  `ERR:BAD_POSITION`を返す
- 戻り値規約: `OK:...` / `ERR:<コード>`。コードは index.html の JSX_ERR で日本語化

### 保存時のフォルダ構成・連番仕様(index.html)
- 全行保存時、WAV/txtは `outDir` 直下ではなく `outDir/<フォルダ名>/` に保存される
  (`voiceFolderName(voiceId)` で決定、`voiceOutDir()` が存在しなければ作成)。
  - `aq:<プリセット名>` → `AQ_<プリセット名>`
  - `vv:<エンジン名>:<styleId>` → `<エンジン名>_<キャラ名>`(styleIdからvvSpeakerCacheを
    引いてスタイル部分を除いたキャラ名を解決。スタイル違いは同一フォルダに統合される)
  - `av:<キャラ名>`(A.I.VOICE2) → `AIVOICE2_<キャラ名>`(例 `AIVOICE2_結月ゆかり(通常`)、旧 `av` → `AIVOICE2`
  - フォルダ名は `safeFileName` で禁則文字除去・空白を`_`に置換
- ファイル名は `<連番3桁>_[キャラ名_]セリフ.wav`(`nextSeqWavPath()`がフォルダ内の
  既存ファイルから`^(\d+)_`最大値を走査し+1、3桁ゼロ埋めして採番。フォルダ内のみで
  独立カウントし、既存ファイルは上書きしない)。`namePrefix`設定ONの場合はセリフ部分の前に
  キャラ名(`wavBaseName`)が付く。衝突時は`uniqueWavPath`で`_1`等のサフィックスを追加
  - ファイル名中の**セリフ本体**は`safeFileName(text, SPEECH_NAME_MAX)`により
    `SPEECH_NAME_MAX`(20)文字に切り詰められる。**キャラ名prefix**
    (`namePrefix`ON時、`voiceShortName`の結果に対する`safeFileName`)は引数省略のため
    従来どおり50文字上限のまま。**フォルダ名**(`voiceFolderName`)も引数省略で50文字上限の
    まま変更なし。用途によって`safeFileName`の第2引数`maxLen`(省略時50)で上限が異なる点に注意
- パス長ガード: 保存フルパス(`wavPath`)が`MAX_PATH_LEN`(240、
  Windowsの`MAX_PATH`260への安全マージン)を超える場合、`pathTooLong()`が`saveOneRow`内で
  合成・書き出し呼び出しの直前に検知し、`pathLenMsg()`のメッセージで保存処理そのものを
  中断する(合成は実行されない)。加えて、事前チェックをすり抜けたOS側の`ENAMETOOLONG`
  エラーは`saveRow`/`btnSaveAll`の`catch`で日本語メッセージに変換して表示する
- txtは最終的なWAVパスと同じフォルダ・同じベース名で生成される(字幕生成が前提とする
  「WAVと同名txt」を維持)
- 字幕一括生成(`btnMakeCaptions`)は`getSelectedAudioClips()`が返すtrackIndexで
  クリップをグルーピングし、トラック番号ごとに個別のSRTファイル
  `captions_<timestamp>_track<N>.srt`(`<timestamp>`は全トラック共通の生成時刻)を
  `outDir`(未設定時は先頭クリップのフォルダ)に書き出して`insertCaption`をトラック数分
  呼び出す。UI上のオプション(チェックボックス等)は無く、常にトラック毎に分割する
- A.I.VOICE2の行は`avBatchExport(rows, exportDir)`でまとめて書き出す(全行保存では`btnSaveAll`が
  A.I.VOICE2の行だけ先に1回のバッチで書き出し、結果の`Map(row -> 作業フォルダ内wav)`を`ctx.avResults`として
  `saveOneRow`へ渡す。個別保存は1行だけのバッチ)。作業フォルダは`avExportDir(outDir)`
  (`avOutDir`設定、空なら`outDir/_aivoice2_export`)で、VoiceDesk専用のため**毎回中身を全消去**してから
  書き出す(A.I.VOICE2の上書き確認ダイアログの抑止・連番の混同防止)。`saveOneRow`は作業フォルダの
  wavを`outDir/AIVOICE2_<キャラ名>/<連番>_<セリフ>.wav`へ`moveFile`(rename、失敗時はcopy+unlink)で移し、
  A.I.VOICE2が同時保存したtxtは捨てて`makeTxt`/`txtEnc`設定に従いVoiceDeskがtxtを作る
- `insAudio`ON時は`placeAudio`→`placeVoice`の第4引数(binName)に`voiceFolderName(voiceId)`を
  渡し、PremiereのVoiceDeskビン配下に同名のサブビンが作られてそこにインポートされる
- 1行分の保存処理は`saveOneRow(row, ctx)`(`ctx = {dir, avDir, insAudio, offset, avResults?}`、戻り値
  `{ok, wavPath, msg, advance, startSec, endSec}`)に集約されており、全行保存(`btnSaveAll`)と
  行ごとの個別保存(`saveRow`、💾ボタン)の両方から呼ばれる。連番・フォルダ構成・txt生成・
  A.I.VOICE2の作業フォルダからの移動処理はこの関数に一元化されている。`saveOneRow`自体は
  プレイヘッドを動かさない(全行保存の`offset`計算が二重加算になるため)
- `insAudio`ON時、保存後にPremiereの再生ヘッドを配置したクリップの終端(+`insGap`)へ
  自動で進める(`movePlayhead()`、`$._AQV_.setPlayheadSec`を呼ぶ)。個別保存(`saveRow`)は
  その行の`res.endSec`を使って毎回移動する。全行保存(`btnSaveAll`)はループ中は移動せず
  `lastEnd`に最後の`endSec`を記録しておき、全行成功後に1回だけ最終位置へ移動する
  (`offset`計算式自体は変更しない)。移動先が取れない場合(`res.endSec`が無い等)や
  途中でエラー終了した場合は移動しない。移動自体が失敗した場合も保存処理は成功扱いのまま、
  ステータスメッセージにエラー内容を注記するだけに留める
- 保存に成功した行は`row.saved=true`になり、グレー表示される。「使用済みのセリフを削除」
  (`btnDelSaved`)は`saved`が立った行のセリフ(text)を空にし`saved`を解除する(行自体・声・
  トラック設定は残る。行が削除されるわけではない)。この配列操作は純粋関数
  `clearSavedRowsText(rows)`に切り出されており、`node --test`でテスト対象になっている

## 6. 重要な実装上の注意(ハマりどころ)

編集時に守る制約(ASCII限定のExtendScript、BOM付きPowerShell、`PS_EXE`、`$._AQV_` 名前空間、
SRTのBOM、Shift-JIS書き込み、キャプション挿入の単位など)は `CLAUDE.md` の「重要な制約」を参照。
各連携固有のハマりどころは5章の該当節に書く。

## 7. ビルド・テスト

ビルド工程は無く、リポジトリ一式をzipにして配布する。
インストール・デバッグ・構文チェック・自動テストの手順は `CLAUDE.md` の「コマンド」を参照。
