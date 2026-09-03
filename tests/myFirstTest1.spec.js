const { test, expect } = require('@playwright/test');

// Thông tin đăng nhập và đường dẫn môi trường staging.
const USERNAME = process.env.MARKETING_USERNAME || 'katuyen_marketing';
const PASSWORD = process.env.MARKETING_PASSWORD || 'huynhtuyen';
const LOGIN_URL = 'https://warehouse.staging.ftcjsc.com/login';

// Thời gian tạm dừng để dễ quan sát thao tác khi chạy browser có giao diện.
const BROWSER_STEP_DELAY = 1_200;

// Tạm dừng giữa các thao tác quan trọng trên browser.
async function pauseForBrowser(page, milliseconds = BROWSER_STEP_DELAY) {
  await page.waitForTimeout(milliseconds);
}

// Tìm selector đầu tiên đang hiển thị trong danh sách selector dự phòng.
async function firstVisible(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) return locator;
  }
  throw new Error(`Không tìm thấy phần tử hiển thị: ${selectors.join(', ')}`);
}

test('Duyệt đơn hàng múi của katuyen_marketing', async ({ page }) => {
  // Cho phép test có đủ thời gian duyệt qua nhiều trang.
  test.setTimeout(90_000);

  // STEP 1: Mở trang login và đăng nhập bằng tài khoản được yêu cầu.
  await test.step('Đăng nhập', async () => {
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });

    // Tìm ô nhập tên tài khoản theo nhiều selector có thể có trên giao diện.
    const usernameInput = await firstVisible(page, [
      'input[name="username"]',
      'input[autocomplete="username"]',
      'input[placeholder*="tài khoản" i]',
      'input[type="text"]',
    ]);
    // Tìm ô nhập mật khẩu theo nhiều selector có thể có trên giao diện.
    const passwordInput = await firstVisible(page, [
      'input[name="password"]',
      'input[autocomplete="current-password"]',
      'input[placeholder*="mật khẩu" i]',
      'input[type="password"]',
    ]);

    await usernameInput.fill(USERNAME);
    await passwordInput.fill(PASSWORD);
    await page.getByRole('button', { name: /^Đăng nhập$/i }).click();
    await expect(page).not.toHaveURL(/\/login(?:$|\?)/i, { timeout: 30_000 });
  });

  // STEP 2-3: Mở thanh điều hướng, chọn Quản lý đơn hàng và Danh sách đơn hàng múi.
  await test.step('Mở Danh sách đơn hàng múi', async () => {
    // STEP 1: Bấm nút mở thanh điều hướng bên trái.
    const navigationButton = page.getByRole('button', { name: /apps/i }).first();
    await expect(navigationButton).toBeVisible();
    await navigationButton.click();

    // STEP 2: Chọn menu Quản lý đơn hàng.
    const orderManagement = page.locator('a.sidebar-menu-button').filter({ hasText: 'Quản lý đơn hàng' }).first();
    await expect(orderManagement).toBeVisible({ timeout: 15_000 });
    await orderManagement.evaluate(element => element.click());

    // STEP 3: Chọn menu Danh sách đơn hàng múi.
    const orderList = page.locator('a').filter({ hasText: 'Danh sách đơn hàng múi' }).first();
    await expect(orderList).toBeAttached({ timeout: 15_000 });
    await orderList.evaluate(element => element.click());
    await expect(page.getByText('Danh sách đơn hàng múi', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Loading...', { exact: true })).toBeHidden({ timeout: 30_000 });
  });

  // STEP 4-6: Tìm đơn đúng người tạo qua các trang và thực hiện duyệt.
  await test.step('Tìm và duyệt đơn theo từng trang', async () => {
    let matchingRow;
    let approveButton;

    // STEP 4: Kiểm tra lần lượt từng trang phân trang.
    for (let pageIndex = 1; pageIndex <= 100; pageIndex += 1) {
      const creators = page.getByText(USERNAME, { exact: true });
      for (let creatorIndex = 0; creatorIndex < await creators.count(); creatorIndex += 1) {
        const creator = creators.nth(creatorIndex);
        if (!await creator.isVisible().catch(() => false)) continue;

        // Chỉ nhận dòng đơn có đúng người tạo và có nút Duyệt đang bật.
        const candidateRow = creator.locator(
          'xpath=ancestor::*[.//button[contains(normalize-space(.),"Duyệt")]][1]',
        );
        const isOrderRow = await candidateRow.evaluate(element => {
          const rectangle = element.getBoundingClientRect();
          return rectangle.width > 500 && rectangle.height > 0 && rectangle.height < 500;
        }).catch(() => false);
        if (!isOrderRow) continue;

        const candidateButton = candidateRow
          .locator('button:visible:not([disabled])')
          .filter({ hasText: 'Duyệt' })
          .first();
        if (await candidateButton.isVisible().catch(() => false)) {
          matchingRow = candidateRow;
          approveButton = candidateButton;
          break;
        }
      }
      if (approveButton) break;

      // Nếu trang hiện tại chưa có đơn phù hợp thì chuyển sang trang kế tiếp.
      const nextPage = page
        .locator('button:visible:not([disabled]), a:visible')
        .filter({ hasText: /^(Sau|Tiếp|Next|›|>)$/i })
        .first();
      if (!await nextPage.isVisible().catch(() => false)) {
        throw new Error(`Đã kiểm tra đến trang ${pageIndex} nhưng không tìm thấy đơn của ${USERNAME}`);
      }
      await nextPage.click();
      await expect(page.getByText('Loading...', { exact: true })).toBeHidden({ timeout: 30_000 }).catch(() => {});
    }

    expect(matchingRow, `Không tìm thấy đơn của ${USERNAME} có nút Duyệt đang bật`).toBeTruthy();
    await expect(approveButton).toBeVisible();
    await approveButton.scrollIntoViewIfNeeded();
    await pauseForBrowser(page);

    // STEP 5: Bấm nút Duyệt của đúng đơn hàng đã tìm thấy.
    await approveButton.click();

    // STEP 5: Kiểm tra popup xác nhận hiển thị.
    const confirmation = page.getByRole('dialog');
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText(/xác nhận|duyệt/i);
    await pauseForBrowser(page);

    // STEP 6: Chọn Đồng ý để xác nhận duyệt đơn hàng.
    await confirmation.getByRole('button', { name: /^Đồng ý$/i }).click();

    // STEP 6: Kiểm tra đơn hàng đã chuyển sang trạng thái Đã duyệt.
    await pauseForBrowser(page, 2_000);
    await expect(matchingRow).toContainText('Đã duyệt', { timeout: 30_000 });
    await pauseForBrowser(page, 2_000);
  });
});
