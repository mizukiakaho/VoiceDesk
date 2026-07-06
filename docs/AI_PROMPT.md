# AIに改修を依頼するときのプロンプト

ChatGPT / Claude / Gemini などに改修を依頼する際は、以下をコピーして使ってください。
`docs/SPEC.md` と、改修対象のファイル(通常は `index.html`、Premiere操作なら
`jsx/host.jsx`、A.I.VOICE2関連なら `bridge/aivoice2_bridge.ps1`)を一緒に渡すと確実です。

---

```
あなたはAdobe CEPエクステンションの開発者です。
Premiere Pro用パネル「VoiceDesk」を改修してください。

## VoiceDeskの概要
- Premiere Proのパネルから AquesTalk / VOICEVOX互換エンジン / A.I.VOICE2 を操作し、
  掛け合い形式(行=声+セリフ)で音声WAV+字幕txtを生成、タイムラインへ配置するツール
- 構成: index.html(UI+全ロジック/CEF+Node.js)、jsx/host.jsx(ExtendScript)、
  bridge/aivoice2_bridge.ps1(A.I.VOICE2用UIAutomation)
- 詳細仕様は添付の docs/SPEC.md を参照

## 改修時の絶対ルール
1. jsx/host.jsx にはASCII文字以外(日本語コメント等)を絶対に入れない
   (日本語WindowsのExtendScriptが誤読して全機能が壊れる)
2. .ps1ファイルは UTF-8 BOM付き・改行CRLF を維持する
3. powershell.exe は必ずフルパス(PS_EXE定数)で呼ぶ
4. ExtendScriptのグローバルは $._AQV_ 名前空間のみ使用する
5. ExtendScriptはES3相当。const/let/アロー関数/テンプレートリテラル禁止(varのみ)
6. パネル側(index.html)はChromium相当なのでモダンJS可。ただしlocalStorageの
   設定スキーマ(SPEC.md参照)との互換性を維持する
7. 外部ライブラリの追加は不可(Node標準モジュールとCEP APIのみ)
8. 設定に新しいパスを追加する場合、初期値は空にして参照ボタンを付ける(配布用のため)

## 改修内容
(ここに依頼内容を書く)

## 出力形式
- 変更したファイルの全文、または適用箇所が一意に特定できる差分
- 変更点の要約と、動作確認手順
```

---

## 改修後の確認チェックリスト

- [ ] `node --check` でJS構文エラーがないこと(index.htmlのscript部を抽出して確認)
- [ ] jsx/host.jsx に非ASCII文字が無いこと
- [ ] install.bat で上書きインストール → Premiere再起動 → パネルが表示されること
- [ ] 既存機能(行の保存・配置・字幕生成)が壊れていないこと
