@echo off
chcp 65001 > nul
cd /d "%~dp0"

REM python -u 옵션으로 버퍼링 없이 scraper.txt에 실시간 즉시 기록
python -u scrape_prices.py --delay 3.5 >> scraper.txt 2>&1

exit 0