Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' 현재 vbs 파일이 위치한 프로젝트 폴더 경로를 OS에서 자동 추출 (인코딩 오류 원천 차단)
strDir = fso.GetParentFolderName(WScript.ScriptFullName)

' 해당 폴더로 자동 이동 후 완전 무음(0)으로 파이썬 구동 및 scrape.log 기록
strCmd = "cmd /c cd /d """ & strDir & """ && python -u scrape_prices.py --delay 3.5 > scrape.log 2>&1"
WshShell.Run strCmd, 0, False