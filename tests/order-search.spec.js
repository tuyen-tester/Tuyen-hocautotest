const { expect, test } = require('@playwright/test');

const ORDER_ID = 'KTY-20260619-SIZYTA-693-SEOD5';
const USERNAME = process.env.MARKETING_USERNAME || 'katuyen_marketing';
const PASSWORD = process.env.MARKETING_PASSWORD || 'huynhtuyen';

async function firstVisible(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) return locator;
  }
  throw new Error(`Không tìm thấy phần tử hiển thị: ${selectors.join(', ')}`);
}

test('TC_ACT_02 - Mở modal [Tìm kiếm đơn hàng] và tìm đúng đơn hàng', async ({ page }) => {
  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(error.message));

  await test.step('Đăng nhập', async () => {
    await page.goto('https://marketing.staging.ftcjsc.com/login', {
      waitUntil: 'domcontentloaded',
    });

    const usernameInput = await firstVisible(page, [
      'input[name="username"]',
      'input[autocomplete="username"]',
      'input[placeholder*="Tên đăng nhập" i]',
      'input[type="text"]',
    ]);
    const passwordInput = await firstVisible(page, [
      'input[name="password"]',
      'input[autocomplete="current-password"]',
      'input[placeholder*="Mật khẩu" i]',
      'input[type="password"]',
    ]);

    await usernameInput.fill(USERNAME);
    await passwordInput.fill(PASSWORD);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(page).not.toHaveURL(/\/login(?:$|\?)/i);
  });

  await test.step('Mở trang Danh sách đơn hàng múi', async () => {
    const orderListEntry = page
      .getByRole('link', { name: /Danh sách đơn hàng múi/i })
      .or(page.getByRole('button', { name: /Danh sách đơn hàng múi/i }))
      .or(page.getByText('Danh sách đơn hàng múi', { exact: true }))
      .first();

    await expect(orderListEntry).toBeVisible();
    await orderListEntry.click();
    await expect(page.getByRole('button', { name: /^Tìm kiếm$/i }).first()).toBeVisible();
  });

  await test.step('Tìm kiếm đơn hàng trong modal', async () => {
    await page.getByRole('button', { name: /^Tìm kiếm$/i }).first().click();

    const searchModal = page.getByRole('dialog');
    await expect(searchModal).toBeVisible();
    await expect(searchModal).toContainText(/Tìm kiếm đơn hàng/i);

    const orderInput = searchModal
      .getByLabel(/Tên\s*\/\s*mã đơn hàng/i)
      .or(searchModal.getByPlaceholder(/Tên\s*\/\s*mã đơn hàng/i))
      .or(searchModal.locator('input').first());
    await expect(orderInput).toBeVisible();
    await orderInput.fill(ORDER_ID);

    const apiResponsePromise = page.waitForResponse(response => {
      const request = response.request();
      return /order|don[-_ ]?hang|search|shipment/i.test(response.url()) &&
        ['GET', 'POST', 'PUT'].includes(request.method()) &&
        response.status() >= 200 && response.status() < 300;
    });

    await searchModal.getByRole('button', { name: /^Tìm kiếm$/i }).click();
    const apiResponse = await apiResponsePromise;
    expect(await apiResponse.text()).toContain(ORDER_ID);
    await expect(searchModal).toBeHidden();
  });

  await test.step('Xác nhận chỉ hiển thị đơn hàng cần tìm', async () => {
    const matchingRows = page.getByRole('row').filter({ hasText: ORDER_ID });
    if (await matchingRows.count()) {
      await expect(matchingRows).toHaveCount(1);
    } else {
      await expect(page.getByText(ORDER_ID, { exact: true })).toHaveCount(1);
    }

    await expect(page.locator('body')).not.toContainText(
      /(Đã xảy ra lỗi|Lỗi hệ thống|Internal Server Error)/i,
    );
  });

  expect(consoleErrors, `Console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  expect(pageErrors, `Page errors: ${pageErrors.join('\n')}`).toEqual([]);
});