# A.I.VOICE2 Bridge - UIAutomationでA.I.VOICE2を外部制御する
# 使い方:
#   powershell -ExecutionPolicy Bypass -File aivoice2_bridge.ps1 -Text "こんにちは" -Action play [-Character "結月ゆかり(通常"]
#   -Action play       : (キャラ割り当て→)テキストを設定して再生
#   -Action set        : テキスト設定のみ
#   -Action save       : テキストを設定して「書き出し」ボタンを押す(旧方式・互換用)
#   -Action saveall    : 「一括書き出し」ボタンを押す(テキスト設定なし・互換用)
#   -Action exportproj : -Project のプロジェクト(.aieprojx)を開き、「一括書き出し」を -OutDir へ実行する(推奨)
#   -Action status     : 起動状態・現在のプロジェクト・未保存の有無を返す
#   -Action dump       : UI要素一覧をダンプ(デバッグ用)
# 出力: 標準出力に "OK: ..." / "ERR: メッセージ"(exportprojの未保存検出は "ERR: DIRTY: ...")
#
# 実装上の注意(docs/AIVOICE2_RESEARCH.md 2-4 参照):
#  - FlutterアプリのUIAツリーは「最初の問い合わせ→300ms待つ」まで空。Get-AivoiceWindow の
#    「関数内で FindFirst → Start-Sleep → return」という構造を崩すとツリーが取れなくなる。
#  - テキスト欄は UIA の SetValue が効かないためクリック+クリップボード貼り付けで入力する。
#  - Win32のファイル/フォルダダイアログ(#32770)は前面ウィンドウのクラス名で検出し、
#    SendKeys でパスを入力する(所有ウィンドウのため ProcessId 条件の列挙には出てこない)。
param(
    [string]$Text = "",
    [string]$Action = "play",
    [string]$ExePath = "",
    [string]$Character = "",
    [string]$Project = "",
    [string]$OutDir = "",
    [int]$TimeoutSec = 60
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class W32 {
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder sb, int n);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    public const uint LEFTDOWN = 0x02;
    public const uint LEFTUP   = 0x04;
    public static void Click(int x, int y){
        SetCursorPos(x, y);
        System.Threading.Thread.Sleep(60);
        mouse_event(LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
        mouse_event(LEFTUP, 0, 0, 0, UIntPtr.Zero);
    }
    public static string ForegroundClass(){
        var sb = new StringBuilder(256);
        GetClassName(GetForegroundWindow(), sb, 256);
        return sb.ToString();
    }
    public static uint ForegroundPid(){
        uint pid; GetWindowThreadProcessId(GetForegroundWindow(), out pid); return pid;
    }
}
"@

$script:AivoiceProc = $null
$script:Launched = $false
$script:PrevForeground = [W32]::GetForegroundWindow()

function Get-AivoiceProcess {
    $ps = Get-Process -Name "aivoice" -ErrorAction SilentlyContinue
    if (-not $ps) { return $null }
    return ($ps | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1)
}

function Start-Aivoice($arg) {
    if ((-not $ExePath) -or (-not (Test-Path $ExePath))) {
        throw "A.I.VOICE2のexeパスが未設定/不正です。設定でaivoice.exeのパスを指定してください"
    }
    if ($arg) { Start-Process -FilePath $ExePath -ArgumentList ('"' + $arg + '"') | Out-Null }
    else      { Start-Process -FilePath $ExePath | Out-Null }
    $deadline = (Get-Date).AddSeconds(90)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 500
        $p = Get-AivoiceProcess
        if ($p) { Start-Sleep -Seconds 3; return }
    }
    throw "aivoice.exe を起動できませんでした"
}

# 注意: この関数の構造(FindFirst → Start-Sleep → return)を変えないこと(ファイル先頭のコメント参照)
function Get-AivoiceWindow([string]$LaunchArg = "") {
    $p = Get-AivoiceProcess
    if (-not $p) {
        Start-Aivoice $LaunchArg
        $p = Get-AivoiceProcess
        $script:Launched = $true
    }
    if (-not $p) { throw "A.I.VOICE2 のウィンドウが見つかりません" }
    $script:AivoiceProc = $p
    $root = [System.Windows.Automation.AutomationElement]::RootElement
    $cond = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ProcessIdProperty, $p.Id)
    $win = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $cond)
    if (-not $win) { throw "UIAutomationでウィンドウを取得できません" }
    Start-Sleep -Milliseconds 300
    return $win
}

function Activate-Aivoice {
    if ($script:AivoiceProc) {
        [W32]::SetForegroundWindow($script:AivoiceProc.MainWindowHandle) | Out-Null
        Start-Sleep -Milliseconds 300
    }
}

function Restore-Foreground {
    # A.I.VOICE2を前面化していた場合、呼び出し前の前面ウィンドウ(通常はPremiere)へ戻す
    $prev = $script:PrevForeground
    if ($prev -ne [IntPtr]::Zero -and $script:AivoiceProc -and $prev -ne $script:AivoiceProc.MainWindowHandle) {
        [W32]::SetForegroundWindow($prev) | Out-Null
    }
}

function Find-ByName($win, $name) {
    $cond = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::NameProperty, $name)
    return $win.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
}

function Find-ByPrefix($win, $prefix, $controlType) {
    $all = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    for ($i = 0; $i -lt $all.Count; $i++) {
        $e = $all.Item($i)
        $nm = $e.Current.Name
        if ($nm -and $nm.StartsWith($prefix)) {
            if (-not $controlType -or $e.Current.ControlType.ProgrammaticName -eq ('ControlType.' + $controlType)) { return $e }
        }
    }
    return $null
}

function Find-TextEdit($win) {
    # 本文のEdit = 名前が空のEdit(「キャラクターを検索」等の名前付きEditを除外)
    $cond = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
        [System.Windows.Automation.ControlType]::Edit)
    $edits = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
    for ($i = 0; $i -lt $edits.Count; $i++) {
        $e = $edits.Item($i)
        if (-not $e.Current.Name) { return $e }
    }
    if ($edits.Count -gt 0) { return $edits.Item($edits.Count - 1) }
    return $null
}

function Invoke-UIButton($elem) {
    try {
        $pattern = $elem.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
        $pattern.Invoke()
    } catch {
        # InvokePatternが使えない場合はクリックにフォールバック
        Click-Element $elem
    }
}

function Click-Element($elem) {
    $r = $elem.Current.BoundingRectangle
    [W32]::Click([int]($r.X + $r.Width/2), [int]($r.Y + $r.Height/2))
    Start-Sleep -Milliseconds 200
}

function Escape-SendKeys($s) {
    return ($s -replace '([+^%~(){}\[\]])', '{$1}')
}

function Set-EditorText($win, $text) {
    $edit = Find-TextEdit $win
    if (-not $edit) { throw "テキスト欄が見つかりません" }
    Activate-Aivoice
    Click-Element $edit    # クリックでフォーカス(FlutterはUIAのSetFocus不可)
    Set-Clipboard -Value $text
    [System.Windows.Forms.SendKeys]::SendWait("^a")
    Start-Sleep -Milliseconds 100
    [System.Windows.Forms.SendKeys]::SendWait("{DEL}")
    Start-Sleep -Milliseconds 100
    [System.Windows.Forms.SendKeys]::SendWait("^v")
    Start-Sleep -Milliseconds 250
}

function Set-Character($win, $name) {
    # キャラクター一覧の項目(Image、Name='<キャラ名>' または '<キャラ名>\n標準')をクリックして選択し、
    # Ctrl+Q(選択中のキャラクターをテキストブロックに割り当て)を送る
    if (-not $name) { return }
    $edit = Find-TextEdit $win
    Activate-Aivoice
    if ($edit) { Click-Element $edit }   # 対象ブロックを選択状態にする
    $item = Find-ByPrefix $win $name 'Image'
    if (-not $item) { throw ("キャラクター「" + $name + "」がA.I.VOICE2のキャラクター一覧に見つかりません") }
    Click-Element $item
    [System.Windows.Forms.SendKeys]::SendWait("^q")
    Start-Sleep -Milliseconds 250
}

function Wait-ForegroundDialog([int]$timeoutMs) {
    # このプロセスが所有する Win32 ダイアログ(#32770)が前面に来るのを待つ
    $deadline = (Get-Date).AddMilliseconds($timeoutMs)
    while ((Get-Date) -lt $deadline) {
        if ([W32]::ForegroundClass() -eq '#32770' -and [W32]::ForegroundPid() -eq [uint32]$script:AivoiceProc.Id) { return $true }
        Start-Sleep -Milliseconds 200
    }
    return $false
}

function Type-IntoDialog($path) {
    # ダイアログ表示直後はファイル名/フォルダ名欄にフォーカスがあるので、そこへパスを打ち込む
    Start-Sleep -Milliseconds 300
    [System.Windows.Forms.SendKeys]::SendWait("^a")
    [System.Windows.Forms.SendKeys]::SendWait((Escape-SendKeys $path))
    Start-Sleep -Milliseconds 200
    [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
    Start-Sleep -Milliseconds 700
}

function Get-Title {
    $p = Get-Process -Id $script:AivoiceProc.Id -ErrorAction SilentlyContinue
    if ($p) { return $p.MainWindowTitle }
    return ""
}

function Is-VoiceDeskProject($title) {
    return ($title -match 'voicedesk_[0-9]+\.aieprojx')
}

function Handle-UnsavedDialog($win) {
    # 「プロジェクトが編集されています。編集内容を保存しますか?」(保存/破棄/キャンセル)への対応。
    # VoiceDeskが生成した使い捨てプロジェクトなら破棄、ユーザーのプロジェクトなら中断する。
    $discard = Find-ByName $win "破棄"
    if (-not $discard) { return $false }
    if (Is-VoiceDeskProject (Get-Title)) {
        Invoke-UIButton $discard
        Start-Sleep -Milliseconds 500
        return $true
    }
    $cancel = Find-ByName $win "キャンセル"
    if ($cancel) { Invoke-UIButton $cancel }
    throw "DIRTY: A.I.VOICE2に未保存の変更があります。A.I.VOICE2側で保存または破棄してから再実行してください"
}

function Open-Project($win, $path) {
    $title = Get-Title
    if ($title.EndsWith('*') -and -not (Is-VoiceDeskProject $title)) {
        throw "DIRTY: A.I.VOICE2に未保存の変更があります。A.I.VOICE2側で保存または破棄してから再実行してください"
    }
    Activate-Aivoice
    $menu = Find-ByName $win "ファイル"
    if (-not $menu) { throw "「ファイル」メニューが見つかりません" }
    Invoke-UIButton $menu
    Start-Sleep -Milliseconds 600
    $win2 = Get-AivoiceWindow
    $item = Find-ByPrefix $win2 "プロジェクトを開く" 'Button'
    if (-not $item) { [System.Windows.Forms.SendKeys]::SendWait("{ESC}"); throw "「プロジェクトを開く」が見つかりません" }
    Invoke-UIButton $item
    Start-Sleep -Milliseconds 600
    if (-not (Wait-ForegroundDialog 1500)) {
        $win3 = Get-AivoiceWindow
        [void](Handle-UnsavedDialog $win3)
        if (-not (Wait-ForegroundDialog 5000)) { throw "「開く」ダイアログが表示されませんでした" }
    }
    Type-IntoDialog $path
    $leaf = [System.IO.Path]::GetFileName($path)
    $deadline = (Get-Date).AddSeconds(30)
    while ((Get-Date) -lt $deadline) {
        if ((Get-Title).Contains($leaf)) { Start-Sleep -Milliseconds 800; return }
        Start-Sleep -Milliseconds 300
    }
    throw "プロジェクトを開けませんでした: $path"
}

function Wait-ProjectLoaded($leaf, [int]$timeoutSec) {
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    while ((Get-Date) -lt $deadline) {
        $t = Get-Title
        if ($t.Contains($leaf)) {
            $w = Get-AivoiceWindow
            if (Find-TextEdit $w) { return $w }
        }
        Start-Sleep -Milliseconds 500
    }
    throw "プロジェクトの読み込みを確認できませんでした: $leaf"
}

function Find-FolderEdit($win) {
    # 一括書き出し(命名規則)ダイアログの「保存先フォルダ」欄: 値に '{' を含まない(=命名規則欄ではない)Edit
    $cond = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
        [System.Windows.Automation.ControlType]::Edit)
    $edits = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
    for ($i = 0; $i -lt $edits.Count; $i++) {
        $e = $edits.Item($i)
        if ($e.Current.Name) { continue }
        $v = ''
        try { $v = $e.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value } catch { $v = '' }
        if ($v -notmatch '\{') { return $e }
    }
    return $null
}

function Export-All($win, $outDir) {
    $btn = Find-ByName $win "一括書き出し"
    if (-not $btn) { throw "「一括書き出し」ボタンが見つかりません" }
    Invoke-UIButton $btn
    $deadline = (Get-Date).AddSeconds(15)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 400
        if ([W32]::ForegroundClass() -eq '#32770' -and [W32]::ForegroundPid() -eq [uint32]$script:AivoiceProc.Id) {
            # 「ダイアログで指定」モード: フォルダー選択ダイアログ
            if (-not $outDir) { [System.Windows.Forms.SendKeys]::SendWait("{ESC}"); throw "A.I.VOICE2の「ファイル名の指定方法」が「ダイアログで指定」のままです(-OutDir 未指定)" }
            Type-IntoDialog $outDir
            if ([W32]::ForegroundClass() -eq '#32770') {
                # パス入力でフォルダへ移動しただけの場合は「フォルダーの選択」ボタン(AutomationId=1)を押す
                $dlg = [System.Windows.Automation.AutomationElement]::FromHandle([W32]::GetForegroundWindow())
                $sel = $dlg.FindFirst([System.Windows.Automation.TreeScope]::Descendants, (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty, "1")))
                if ($sel) { Invoke-UIButton $sel }
            }
            return "dialog"
        }
        $w2 = Get-AivoiceWindow
        $run = Find-ByName $w2 "書き出しを実行"
        if ($run) {
            # 「命名規則で指定」モード: 保存先フォルダを書き換えてから実行
            if ($outDir) {
                $fe = Find-FolderEdit $w2
                if ($fe) {
                    Activate-Aivoice
                    Click-Element $fe
                    [System.Windows.Forms.SendKeys]::SendWait("^a")
                    Start-Sleep -Milliseconds 80
                    [System.Windows.Forms.SendKeys]::SendWait((Escape-SendKeys $outDir))
                    Start-Sleep -Milliseconds 250
                }
            }
            Invoke-UIButton $run
            return "namingRule"
        }
    }
    throw "一括書き出しのダイアログが表示されませんでした"
}

try {
    switch ($Action) {
        "status" {
            $p = Get-AivoiceProcess
            if (-not $p) { Write-Output "OK: stopped"; exit 0 }
            $t = $p.MainWindowTitle
            $dirty = $t.EndsWith('*')
            Write-Output ("OK: running dirty=" + $dirty.ToString().ToLower() + " title=" + $t)
            exit 0
        }
        "dump" {
            $win = Get-AivoiceWindow
            $condAll = [System.Windows.Automation.Condition]::TrueCondition
            $all = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condAll)
            for ($i = 0; $i -lt $all.Count; $i++) {
                $e = $all.Item($i)
                $ct = $e.Current.ControlType.ProgrammaticName -replace 'ControlType\.', ''
                $nm = $e.Current.Name
                if ($nm -or $ct -eq 'Button' -or $ct -eq 'Edit') {
                    Write-Output ("[{0}] {1} | Name='{2}' | Enabled={3}" -f $i, $ct, $nm, $e.Current.IsEnabled)
                }
            }
        }
        "set" {
            if (-not $Text) { throw "-Text を指定してください" }
            $win = Get-AivoiceWindow
            if ($Character) { Set-Character $win $Character }
            Set-EditorText $win $Text
            Restore-Foreground
            Write-Output "OK: text set"
        }
        "play" {
            $win = Get-AivoiceWindow
            if ($Character) { Set-Character $win $Character }
            if ($Text) { Set-EditorText $win $Text }
            $btn = Find-ByName $win "再生"
            if (-not $btn) { throw "「再生」ボタンが見つかりません" }
            Invoke-UIButton $btn
            Restore-Foreground
            Write-Output "OK: playing"
        }
        "save" {
            $win = Get-AivoiceWindow
            if ($Character) { Set-Character $win $Character }
            if ($Text) { Set-EditorText $win $Text }
            $btn = Find-ByName $win "書き出し"
            if (-not $btn) { throw "「書き出し」ボタンが見つかりません" }
            Invoke-UIButton $btn
            Write-Output "OK: export invoked"
        }
        "saveall" {
            $win = Get-AivoiceWindow
            $btn = Find-ByName $win "一括書き出し"
            if (-not $btn) { throw "「一括書き出し」ボタンが見つかりません" }
            Invoke-UIButton $btn
            Write-Output "OK: batch export invoked"
        }
        "exportproj" {
            if (-not $Project -or -not (Test-Path $Project)) { throw "-Project にプロジェクトファイル(.aieprojx)を指定してください" }
            $leaf = [System.IO.Path]::GetFileName($Project)
            $win = Get-AivoiceWindow $Project
            if ($script:Launched) {
                $win = Wait-ProjectLoaded $leaf 60
            } else {
                Open-Project $win $Project
                $win = Wait-ProjectLoaded $leaf 30
            }
            $mode = Export-All $win $OutDir
            Restore-Foreground
            Write-Output ("OK: export started mode=" + $mode)
        }
        default { throw "不明なAction: $Action (play/set/save/saveall/exportproj/status/dump)" }
    }
    exit 0
} catch {
    try { Restore-Foreground } catch {}
    Write-Output ("ERR: " + $_.Exception.Message)
    exit 1
}
