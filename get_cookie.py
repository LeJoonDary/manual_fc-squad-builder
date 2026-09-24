import sys
import time
from playwright.sync_api import sync_playwright


def get_futgg_cookie():
  with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            " (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36"
        ),
        viewport={"width": 1280, "height": 720},
    )
    page = context.new_page()

    # 1. 시세 세션 쿠키(__Host-futgg_price_sid)를 발급받기 위해 실제 선수 페이지로 접속
    target_url = "https://www.fut.gg/players/231677-marcus-rashford/27-231677/"
    page.goto(target_url, wait_until="networkidle", timeout=30000)

    # 2. price_sid 쿠키가 브라우저에 안착할 때까지 최대 10초 대기
    for _ in range(10):
      cookies = context.cookies()
      names = [c["name"] for c in cookies]
      if any("price_sid" in n for n in names):
        break
      page.wait_for_timeout(1000)

    cookies = context.cookies()
    cookie_str = "; ".join([f"{c['name']}={c['value']}" for c in cookies])
    browser.close()
    return cookie_str


if __name__ == "__main__":
  cookie = get_futgg_cookie()
  if cookie:
    print(cookie)
  else:
    sys.exit(1)