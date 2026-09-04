const { test, expect } = require('@playwright/test');

const LOGIN_URL = 'https://warehouse.staging.ftcjsc.com/login';
const CREATE_ORDER_URL = 'https://specialize.staging.ftcjsc.com/don-hang/moi';
const ORDER_NAME = 'DHM-AUTOOTEST-2';
const USERNAME = process.env.MARKETING_USERNAME || 'katuyen_marketing';
const PASSWORD = process.env.MARKETING_PASSWORD || 'huynhtuyen';

async function firstVisible(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) return locator;
  }
  throw new Error(`Không tìm thấy phần tử hiển thị: ${selectors.join(', ')}`);
}

async function fillByLabelOrSelector(page, label, selectors, value) {
  const labelledInput = page.getByLabel(label, { exact: false }).first();
  if (await labelledInput.isVisible().catch(() => false)) {
    await labelledInput.fill(value);
    return;
  }

  const input = await firstVisible(page, selectors);
  await input.fill(value);
}

test('Tạo thành công đơn hàng múi', async ({ page }) => {
  test.setTimeout(120_000);

  await test.step('Đăng nhập vào warehouse', async () => {
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });

    await (await firstVisible(page, [
      'input[name="username"]',
      'input[autocomplete="username"]',
      'input[placeholder*="tài khoản" i]',
      'input[type="text"]',
    ])).fill(USERNAME);

    await (await firstVisible(page, [
      'input[name="password"]',
      'input[autocomplete="current-password"]',
      'input[placeholder*="mật khẩu" i]',
      'input[type="password"]',
    ])).fill(PASSWORD);

    await page.getByRole('button', { name: /^Đăng nhập$/i }).click();
    await expect(page).not.toHaveURL(/\/login(?:$|\?)/i, { timeout: 30_000 });
  });

  await test.step('Mở trang Tạo đơn hàng múi mới', async () => {
    await page.goto(CREATE_ORDER_URL, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/don-hang\/moi(?:\?|$)/i);
    await expect(page.getByText(/Tạo đơn hàng múi mới/i).first()).toBeVisible({ timeout: 30_000 });
  });

  await test.step('Nhập thông tin đơn hàng', async () => {
    await fillByLabelOrSelector(page, /Tên đơn hàng/i, [
      'input[name*="ten" i][name*="don" i]',
      'input[placeholder*="Tên đơn hàng" i]',
    ], ORDER_NAME);

    await fillByLabelOrSelector(page, /Mã đơn hàng/i, [
      'input[name*="ma" i][name*="don" i]',
      'input[placeholder*="Mã đơn hàng" i]',
    ], ORDER_NAME);

    const customerControl = page.getByRole('combobox', { name: /Chọn tên khách hàng/i });
    await expect(customerControl).toBeVisible();
    await customerControl.click();

    const customerOptions = page
      .locator('[role="option"]:visible, .dropdown-menu li:visible, .select2-results__option:visible')
      .filter({ hasNotText: /không tìm thấy|chọn tên khách hàng/i });
    await expect(customerOptions.first()).toBeVisible({ timeout: 15_000 });
    const optionCount = await customerOptions.count();
    expect(optionCount, 'Danh sách khách hàng đang trống').toBeGreaterThan(0);
    await customerOptions.nth(Math.floor(Math.random() * optionCount)).click();

    await fillByLabelOrSelector(page, /Số lượng sx/i, [
      'input[name*="so_luong_sx" i]',
      'input[name*="soluong_sx" i]',
      'input[placeholder*="Số lượng sx" i]',
    ], '100');

    await fillByLabelOrSelector(page, /^Số lượng$/i, [
      'input[name*="so_luong" i]:not([name*="sx" i])',
      'input[name*="soluong" i]:not([name*="sx" i])',
      'input[placeholder="Số lượng" i]',
      'input[placeholder="Nhập số lượng" i]',
    ], '100');
  });

  await test.step('Lập đơn hàng và xác nhận thành công', async () => {
    const submitButton = page.getByRole('button', { name: /Lập đơn hàng/i }).first();
    await expect(submitButton).toBeVisible();
    await submitButton.click();

    const successNotification = page
      .locator('.tms-notifications-content:visible')
      .filter({ hasText: /tạo đơn hàng thành công|lập đơn hàng thành công|thành công/i });
    const createdOrder = page
      .locator('a:visible')
      .filter({ hasText: ORDER_NAME })
      .first();

    await expect(successNotification.or(createdOrder).first()).toBeVisible({ timeout: 30_000 });
  });
});