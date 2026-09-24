import sys
from playwright.sync_api import sync_playwright


def get_futgg_cookie():
  with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            " (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36"
        )
    )
    page = context.new_page()

    # FUT.GG 접속 및 Cloudflare 챌린지 대기
    page.goto("https://www.fut.gg/", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(5000)

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