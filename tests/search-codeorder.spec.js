const { test, expect } = require('@playwright/test');

test('Tìm kiếm mã hoặc tên đơn hàng múi', async ({ page }) => {
  const orderQuery = 'DHM-TEST-AUTO';

  await page.goto('https://marketing.staging.ftcjsc.com/login', {
    waitUntil: 'domcontentloaded',
  });

  await page.getByPlaceholder('Nhập tên tài khoản').fill('katuyen_marketing');
  await page.getByPlaceholder('Nhập mật khẩu').fill('huynhtuyen');
  await page.getByRole('button', { name: /^Đăng nhập$/ }).click();
  await expect(page).toHaveURL(/\/trang-chu(?:\?|$)/, { timeout: 30000 });

  await page.getByRole('button', { name: 'apps' }).click();

  const orderMenuTab = page.locator(
    'a.sidebar-menu-button[href*="quan-ly-don-hang"], a[href*="quan-ly-don-hang"]'
  ).first();
  await expect(orderMenuTab).toBeVisible({ timeout: 10000 });
  await orderMenuTab.evaluate((element) => element.click());

  const segmentedOrderLink = page.locator('a.sidebar-menu-button[href="/don-hang"]').first();
  await expect(segmentedOrderLink).toHaveCount(1, { timeout: 10000 });
  await segmentedOrderLink.evaluate((element) => element.click());

  await expect(page).toHaveURL(/\/don-hang(?:\?|$)/, { timeout: 30000 });

  await page.locator('a.search-btn[data-target="#search-order"]').click();

  const searchModal = page.locator('#search-order');
  await expect(searchModal).toBeVisible();
  await searchModal.locator('#order_info').fill(orderQuery);

  await searchModal.locator('.modal-body').evaluate((modalBody) => {
    modalBody.scrollTop = modalBody.scrollHeight;
  });

  await searchModal.locator('button.btn-search').click();

  await expect(page.getByText(orderQuery, { exact: true }).first()).toBeVisible({ timeout: 20000 });
});