@echo off
rem VoiceDesk installer
set DEST=%APPDATA%\Adobe\CEP\extensions\voicedesk

echo Installing to %DEST% ...
xcopy /E /I /Y "%~dp0*" "%DEST%\" >nul

echo Enabling unsigned extensions (PlayerDebugMode)...
for %%v in (9 10 11 12) do (
  reg add "HKCU\Software\Adobe\CSXS.%%v" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul
)

echo.
echo Done!
echo 1. Remove old aquestalk-voice extension folder if present
echo 2. Restart Premiere Pro
echo 3. Open: Window ^> Extensions ^> VoiceDesk
echo.
pause
