# A.I.VOICE2 Bridge - UIAutomationでA.I.VOICE2を外部制御する
# 使い方:
#   powershell -ExecutionPolicy Bypass -File aivoice2_bridge.ps1 -Text "こんにちは" -Action play
#   -Action play    : テキストを設定して再生
#   -Action set     : テキスト設定のみ
#   -Action save    : テキストを設定して「書き出し」ボタンを押す
#   -Action saveall : 「一括書き出し」ボタンを押す(テキスト設定なし)
#   -Action dump    : UI要素一覧をダンプ(デバッグ用)
param(
    [string]$Text = "",
    [string]$Action = "play",
    [string]$ExePath = "C:\Program Files\AI\AIVoice2\AIVoice2Editor\aivoice.exe"
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class W32 {
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    public const uint LEFTDOWN = 0x02;
    public const uint LEFTUP   = 0x04;
    public static void Click(int x, int y){
        SetCursorPos(x, y);
        System.Threading.Thread.Sleep(60);
        mouse_event(LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
        mouse_event(LEFTUP, 0, 0, 0, UIntPtr.Zero);
    }
}
"@

function Get-AivoiceWindow {
    $ps = Get-Process -Name "aivoice" -ErrorAction SilentlyContinue
    if (-not $ps) {
        Start-Process -FilePath $ExePath | Out-Null
        $deadline = (Get-Date).AddSeconds(90)
        while ((Get-Date) -lt $deadline) {
            Start-Sleep -Milliseconds 500
            $ps = Get-Process -Name "aivoice" -ErrorAction SilentlyContinue
            if ($ps -and $ps[0].MainWindowHandle -ne 0) { Start-Sleep -Seconds 3; break }
        }
        $ps = Get-Process -Name "aivoice" -ErrorAction SilentlyContinue
    }
    if (-not $ps) { throw "aivoice.exe を起動できませんでした" }
    $p = $ps | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
    if (-not $p) { throw "A.I.VOICE2 のウィンドウが見つかりません" }
    $root = [System.Windows.Automation.AutomationElement]::RootElement
    $cond = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ProcessIdProperty, $p.Id)
    $win = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $cond)
    if (-not $win) { throw "UIAutomationでウィンドウを取得できません" }
    [W32]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
    Start-Sleep -Milliseconds 300
    return $win
}

function Find-ByName($win, $name) {
    $cond = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::NameProperty, $name)
    return $win.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
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

function Set-EditorText($win, $text) {
    $edit = Find-TextEdit $win
    if (-not $edit) { throw "テキスト欄が見つかりません" }
    Click-Element $edit    # クリックでフォーカス(FlutterはUIAのSetFocus不可)
    Set-Clipboard -Value $text
    [System.Windows.Forms.SendKeys]::SendWait("^a")
    Start-Sleep -Milliseconds 100
    [System.Windows.Forms.SendKeys]::SendWait("{DEL}")
    Start-Sleep -Milliseconds 100
    [System.Windows.Forms.SendKeys]::SendWait("^v")
    Start-Sleep -Milliseconds 250
}

try {
    $win = Get-AivoiceWindow

    switch ($Action) {
        "dump" {
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
            Set-EditorText $win $Text
            Write-Output "OK: text set"
        }
        "play" {
            if ($Text) { Set-EditorText $win $Text }
            $btn = Find-ByName $win "再生"
            if (-not $btn) { throw "「再生」ボタンが見つかりません" }
            Invoke-UIButton $btn
            Write-Output "OK: playing"
        }
        "save" {
            if ($Text) { Set-EditorText $win $Text }
            $btn = Find-ByName $win "書き出し"
            if (-not $btn) { throw "「書き出し」ボタンが見つかりません" }
            Invoke-UIButton $btn
            Write-Output "OK: export invoked"
        }
        "saveall" {
            $btn = Find-ByName $win "一括書き出し"
            if (-not $btn) { throw "「一括書き出し」ボタンが見つかりません" }
            Invoke-UIButton $btn
            Write-Output "OK: batch export invoked"
        }
        default { throw "不明なAction: $Action (play/set/save/saveall/dump)" }
    }
    exit 0
} catch {
    Write-Output ("ERR: " + $_.Exception.Message)
    exit 1
}
