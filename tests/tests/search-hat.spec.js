const { test, expect } = require('@playwright/test');

test('Tìm kiếm đơn hàng múi theo mẫu nón', async ({ page }) => {
  const patternName = 'SIZYTA';

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
  await orderMenuTab.hover({ force: true });
  await page.waitForTimeout(500);
  await orderMenuTab.evaluate((element) => element.click());

  const segmentedOrderLink = page.locator('a.sidebar-menu-button[href="/don-hang"]').first();
  await expect(segmentedOrderLink).toHaveCount(1, { timeout: 10000 });
  await segmentedOrderLink.evaluate((element) => element.click());

  await expect(page).toHaveURL(/\/don-hang(?:\?|$)/, { timeout: 30000 });

  await page.locator('a.search-btn[data-target="#search-order"]').evaluate((element) => element.click());

  const searchModal = page.locator('#search-order');
  await expect(searchModal).toBeVisible({ timeout: 10000 });

  const patternSelect = searchModal.locator('#pattern_info');
  const patternSelect2 = patternSelect.locator(
    'xpath=following-sibling::span[contains(@class, "select2-container")]'
  );
  await patternSelect2.hover({ force: true });
  await patternSelect2.click({ force: true });

  const patternSearchInput = page.locator('.select2-container--open .select2-search__field');
  await expect(patternSearchInput).toBeVisible({ timeout: 10000 });
  await patternSearchInput.fill(patternName);

  const patternOption = page
    .locator('.select2-container--open .select2-results__option')
    .filter({ hasText: new RegExp(`^${patternName}$`) });
  await expect(patternOption).toBeVisible({ timeout: 10000 });
  await patternOption.click();
  await expect(patternSelect.locator('option:checked')).toHaveText(patternName);

  await searchModal.locator('.modal-body').evaluate((modalBody) => {
    modalBody.scrollTop = modalBody.scrollHeight;
  });

  await searchModal.locator('button.btn-search').click();

  await expect(searchModal).toBeHidden({ timeout: 10000 });
  await expect(page).toHaveURL(/selected_patterns=.*SIZYTA/, { timeout: 20000 });
});