import sys
from playwright.sync_api import sync_playwright


def get_futgg_cookie():
  with sync_playwright() as p:
    # 봇 감지 방지 플래그 추가
    browser = p.chromium.launch(
        headless=True,
        args=[
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-blink-features=AutomationControlled",
        ],
    )
    context = browser.new_context(
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            " (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        ),
        viewport={"width": 1280, "height": 720},
    )
    page = context.new_page()

    target_url = "https://www.fut.gg/players/231677-marcus-rashford/27-231677/"

    # networkidle 대신 domcontentloaded 사용 (광고/트래커 무한 대기 방지)
    page.goto(target_url, wait_until="domcontentloaded", timeout=60000)

    # 시세 쿠키 또는 Cloudflare 쿠키가 브라우저에 등록될 때까지 최대 10초 대기
    for _ in range(10):
      cookies = context.cookies()
      names = [c["name"] for c in cookies]
      if any("price_sid" in n for n in names) or any(
          "cf_clearance" in n for n in names
      ):
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