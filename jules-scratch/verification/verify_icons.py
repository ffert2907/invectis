from playwright.sync_api import sync_playwright, Page, expect

def verify_icons(page: Page):
    """
    This test verifies that the wallet icons are displayed correctly.
    """
    # 1. Arrange: Go to the application homepage.
    page.goto("http://localhost:5173")

    # 2. Assert: Confirm the dashboard is visible and take a screenshot.
    expect(page.get_by_role("heading", name="Invectis")).to_be_visible(timeout=10000) # Increased timeout for initial load
    page.screenshot(path="jules-scratch/verification/dashboard_view.png")

    # 3. Act: Click on the "Wallets" tab.
    wallet_button = page.get_by_role("button", name="Wallets")
    wallet_button.click()

    # 4. Assert: Confirm the wallets list is visible and take a screenshot.
    expect(page.get_by_role("heading", name="Mes Wallets")).to_be_visible()
    page.screenshot(path="jules-scratch/verification/wallets_view.png")


if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        verify_icons(page)
        browser.close()
