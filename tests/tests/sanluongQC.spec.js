const { expect, test } = require('@playwright/test');

const LOGIN_URL = 'http://qc-client.datacenter.tms-s.vn/login';
const QC_URL = 'http://qc-client.datacenter.tms-s.vn/qc-ngoai-chuyen';
const ORDER_CODE = 'KTY-20260822-SIZYTA-QAT';
const USERNAME = process.env.QC_USERNAME || 'katuyen_marketing';
const PASSWORD = process.env.QC_PASSWORD || 'huynhtuyen';

async function firstVisible(page, selectors) {
	for (const selector of selectors) {
		const locator = page.locator(selector).first();
		if (await locator.isVisible().catch(() => false)) return locator;
	}

	throw new Error(`Không tìm thấy phần tử hiển thị: ${selectors.join(', ')}`);
}

async function readActualProduction(page) {
	const bodyText = await page.locator('body').innerText();
	const match = bodyText.match(/Sản lượng thực tế\s+(?:Đồng bộ sau \d+s\s+)?(\d+)\s*\/\s*\d+\s*%/i);

	if (!match) {
		throw new Error('Không đọc được sản lượng thực tế hiện tại');
	}

	return Number(match[1]);
}

test('Tăng sản lượng QC ngoài chuyền lên 10 thành công', async ({ page }) => {
	test.setTimeout(120_000);

	await test.step('Đăng nhập QC ngoài chuyền', async () => {
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
		await expect(page).toHaveURL(QC_URL, { timeout: 30_000 });
	});

	await test.step('Mở popup Quét mã QR đơn hàng bằng phím F1', async () => {
		await page.keyboard.press('F1');

		await expect(
			page.getByText(/Quét mã QR đơn hàng/i).first(),
		).toBeVisible({ timeout: 10_000 });
	});

	await test.step('Nhập và xác nhận mã đơn hàng', async () => {
		const orderInput = await firstVisible(page, [
			'input[placeholder*="Nhập/ Quét QR Code BTP/ QR Code đơn hàng" i]',
			'input[placeholder*="QR Code đơn hàng" i]',
			'input[placeholder*="QR" i]',
		]);
		await orderInput.fill(ORDER_CODE);

		await page.getByRole('button', { name: /^Xác nhận$/i }).click();
	});

	await test.step('Tăng sản lượng lên 10 bằng phím Enter', async () => {
		await expect(page.getByRole('dialog', { name: /Quét mã QR đơn hàng/i })).toBeHidden({
			timeout: 30_000,
		});

		const productionBefore = await readActualProduction(page);
		const increaseHint = page.getByText('Nhấn Enter để tăng', { exact: true });
		await expect(increaseHint).toBeVisible();
		await increaseHint.click();

		for (let count = 0; count < 10; count += 1) {
			await increaseHint.press('Enter');
			await expect.poll(() => readActualProduction(page), { timeout: 5_000 }).toBe(
				productionBefore + count + 1,
			);
		}

		await expect(page.locator('body')).not.toContainText(
			/Đã xảy ra lỗi|Lỗi hệ thống|Internal Server Error/i,
		);
	});
});
