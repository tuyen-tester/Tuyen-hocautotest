const { expect, test } = require('@playwright/test');

const LOGIN_URL = 'https://specialize.staging.ftcjsc.com/login';
const ORDERS_URL = 'https://specialize.staging.ftcjsc.com/dinh-muc/don-hang-da-co';
const ORDER_SEARCH_NAME = 'KTY-20250813-POM-Beanie-Beige/Oatmeal-Fur';

async function firstVisible(page, selectors) {
	for (const selector of selectors) {
		const locator = page.locator(selector).first();
		if (await locator.isVisible().catch(() => false)) return locator;
	}
	throw new Error(`Không tìm thấy phần tử hiển thị: ${selectors.join(', ')}`);
}

async function openOrderSearch(page) {
	const username = process.env.SPECIALIZE_USERNAME;
	const password = process.env.SPECIALIZE_PASSWORD;
	if (!username || !password) {
		throw new Error('Cần đặt SPECIALIZE_USERNAME và SPECIALIZE_PASSWORD trước khi chạy test.');
	}

	await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
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

	await usernameInput.fill(username);
	await passwordInput.evaluate((input, value) => {
		const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
		valueSetter.call(input, value);
		input.dispatchEvent(new Event('input', { bubbles: true }));
		input.dispatchEvent(new Event('change', { bubbles: true }));
	}, password);
	await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
	await expect(page).not.toHaveURL(/\/login(?:$|\?)/i);

	await page.goto(ORDERS_URL, { waitUntil: 'domcontentloaded' });
	await page
		.getByRole('heading', { name: /Danh sách đơn hàng đã lập định mức/i })
		.getByText(/Tìm kiếm/i)
		.filter({ visible: true })
		.click();

	const dialog = page
		.getByRole('dialog')
		.or(page.locator('.modal.show, .modal.in, .modal[aria-modal="true"]'))
		.first();
	await expect(dialog).toBeVisible();
	await expect(dialog).toContainText('Tìm kiếm đơn hàng');
	return dialog;
}

async function submitOrderSearch(dialog) {
	await dialog.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
}

function getStatusSelect(dialog) {
	return dialog.locator('select[name="status_order"]');
}

function getStatusDropdown(dialog) {
	return dialog.locator('.select2-selection--single');
}

async function getVisibleOrderCards(page) {
	return page.locator('.stories-card').evaluateAll(cards =>
		cards.map(card => card.innerText.trim()).filter(Boolean),
	);
}

async function chooseStatus(page, dialog, status) {
	await getStatusDropdown(dialog).click();
	const option = page.getByRole('treeitem', { name: status, exact: true });
	await expect(option).toBeVisible();
	await option.click();
	await expect(getStatusDropdown(dialog)).toContainText(status);
}

function getOrderLinks(page) {
	return page.locator('.stories-card a[href*="/don-hang/dinh-muc/"]');
}

async function verifyPagination(page, expectedStatus) {
	const orderLinks = getOrderLinks(page);
	await expect(orderLinks.first()).toBeVisible();
	const firstPageFirstOrder = await orderLinks.first().getAttribute('href');
	const paginationLinks = page.locator('.page-link[href]');
	const statusValues = { 'Đã duyệt': 'approval', 'Hoàn tất': 'completed' };
	const paginationHrefs = await paginationLinks.evaluateAll(links =>
		links.map(link => link.getAttribute('href')),
	);
	expect(paginationHrefs.length).toBeGreaterThan(0);
	for (const href of paginationHrefs) {
		expect(new URL(href).searchParams.get('status_order')).toBe(statusValues[expectedStatus]);
	}

	const nextPage = page.locator('a[aria-label="pagination.next"]');
	if (await nextPage.count()) {
		await nextPage.click({ noWaitAfter: true });
		await expect.poll(() => orderLinks.first().getAttribute('href')).not.toBe(firstPageFirstOrder);
		await expect(orderLinks.first()).toBeVisible();
		const nextPageHrefs = await paginationLinks.evaluateAll(links =>
			links.map(link => link.getAttribute('href')),
		);
		for (const href of nextPageHrefs) {
			expect(new URL(href).searchParams.get('status_order')).toBe(statusValues[expectedStatus]);
		}
	}
}

test('TC1 - Tìm kiếm chỉ với tên hoặc mã đơn hàng', async ({ page }) => {
	const dialog = await openOrderSearch(page);
	await dialog.getByPlaceholder('Nhập tên / mã đơn hàng', { exact: true }).fill(
		ORDER_SEARCH_NAME,
	);

	await submitOrderSearch(dialog);
	await expect(dialog).toBeHidden();
	await expect(page.getByText(ORDER_SEARCH_NAME, { exact: true })).toBeVisible();
});

test('TC2 - Tìm kiếm kết hợp khách hàng, tình trạng và ngày đặt', async ({ page }) => {
	const dialog = await openOrderSearch(page);
	await dialog.getByPlaceholder('Nhập tên / mã khách hàng', { exact: true }).fill(
		'KTY',
	);

	const statusSelect = dialog.locator('select').first();
	await expect(statusSelect).toBeVisible();
	await statusSelect.selectOption({ label: 'Hoàn tất' });

	const dateInputs = dialog.getByPlaceholder('dd-mm-yyyy', { exact: true });
	await expect(dateInputs).toHaveCount(4);
	await dateInputs.nth(0).fill('15-08-2025');
	await dateInputs.nth(1).fill('15-08-2025');

	await submitOrderSearch(dialog);
	await expect(dialog).toBeHidden();
	await expect(page.getByText('Không có kết quả hiển thị.', { exact: true })).toHaveCount(0);
	await expect(page.getByText('15-08-2025', { exact: true }).first()).toBeVisible();
	await expect(page.getByRole('button', { name: 'Hoàn tất', exact: true }).first()).toBeVisible();
});

test('TC3 - Xử lý khoảng ngày đặt đảo ngược', async ({ page }) => {
	const dialog = await openOrderSearch(page);
	const dateInputs = dialog.getByPlaceholder('dd-mm-yyyy', { exact: true });
	await expect(dateInputs).toHaveCount(4);
	await dateInputs.nth(0).fill('31-12-2026');
	await dateInputs.nth(1).fill('01-01-2026');

	await submitOrderSearch(dialog);

	await expect(dialog).toBeHidden();
	await expect(page.getByText('Không có kết quả hiển thị.', { exact: true })).toBeVisible();
});

test('TC4 - Dropdown tình trạng mở, chọn và đóng ổn định', async ({ page }) => {
	const dialog = await openOrderSearch(page);
	const statusDropdown = getStatusDropdown(dialog);
	await expect(statusDropdown).toBeVisible();
	await statusDropdown.click();
	const approvedOption = page.getByRole('treeitem', { name: 'Đã duyệt', exact: true });
	await expect(approvedOption).toBeVisible();
	await approvedOption.click();
	await expect(statusDropdown).toContainText('Đã duyệt');
	await expect(dialog.getByRole('button', { name: 'Tìm kiếm', exact: true })).toBeVisible();

	await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
	await expect(dialog).toBeHidden();
	await page
		.getByRole('heading', { name: /Danh sách đơn hàng đã lập định mức/i })
		.getByText(/Tìm kiếm/i)
		.filter({ visible: true })
		.click();
	await expect(dialog).toBeVisible();
	await expect(statusDropdown).toBeVisible();
});

test('TC5 - Dropdown hiển thị đầy đủ từng trạng thái', async ({ page }) => {
	const dialog = await openOrderSearch(page);
	const statusSelect = getStatusSelect(dialog);
	const statusDropdown = getStatusDropdown(dialog);
	const missingStatuses = [];

	for (const status of ['Đã duyệt', 'Hoàn tất']) {
		await statusDropdown.click();
		const option = page.getByRole('treeitem', { name: status, exact: true });
		if (!(await option.isVisible())) {
			missingStatuses.push(status);
			await page.getByRole('treeitem', { name: 'Đã duyệt', exact: true }).click();
			continue;
		}
		await option.click();
		await expect(statusDropdown).toContainText(status);
		await expect(statusSelect.locator('option:checked')).toHaveText(status);
	}

	expect(missingStatuses, 'Status options missing from the dropdown').toEqual([]);
});

test('TC6 - Tìm kiếm để trống không tự áp dụng tình trạng', async ({ page }) => {
	const dialog = await openOrderSearch(page);
	const statusSelect = getStatusSelect(dialog);
	await expect(statusSelect).toHaveValue('');
	const originalOrders = await getVisibleOrderCards(page);
	await expect(originalOrders.length).toBeGreaterThan(0);

	await submitOrderSearch(dialog);
	await expect(dialog).toBeHidden();
	await expect(page.getByText('Không có kết quả hiển thị.', { exact: true })).toHaveCount(0);
	await expect(await getVisibleOrderCards(page)).toEqual(originalOrders);
});

test('TC7 - Kết hợp Đã duyệt với các trường tìm kiếm', async ({ page }) => {
	test.setTimeout(120_000);
	const combinations = [
		{
			name: 'Tên/mã đơn hàng + khách hàng',
			fill: async dialog => {
				await dialog.getByPlaceholder('Nhập tên / mã đơn hàng', { exact: true }).fill('KTY');
				await dialog.getByPlaceholder('Nhập tên / mã khách hàng', { exact: true }).fill('KTY');
			},
		},
		{
			name: 'Khách hàng + NPL',
			fill: async dialog => {
				await dialog.getByPlaceholder('Nhập tên / mã khách hàng', { exact: true }).fill('KTY');
				await dialog.getByPlaceholder('Nhập tên/ mã NPL', { exact: true }).fill('POM');
			},
		},
		{
			name: 'Ngày đặt + ngày giao',
			fill: async dialog => {
				const dateInputs = dialog.getByPlaceholder('dd-mm-yyyy', { exact: true });
				await dateInputs.nth(0).fill('01-01-2024');
				await dateInputs.nth(1).fill('31-12-2026');
				await dateInputs.nth(2).fill('01-01-2024');
				await dateInputs.nth(3).fill('31-12-2026');
			},
		},
	];

	for (const combination of combinations) {
		await test.step(combination.name, async () => {
			const dialog = await openOrderSearch(page);
			await chooseStatus(page, dialog, 'Đã duyệt');
			await combination.fill(dialog);
			await submitOrderSearch(dialog);
			await expect(dialog).toBeHidden();
			await expect(page.getByText('Không có kết quả hiển thị.', { exact: true })).toHaveCount(0);
			await expect(getOrderLinks(page).first()).toBeVisible();
		});
	}
});

test('TC8 - Đổi trạng thái giữa các lần tìm kiếm và kiểm tra phân trang', async ({ page }) => {
	test.setTimeout(120_000);
	const resultsByStatus = new Map();
	for (const status of ['Đã duyệt', 'Hoàn tất']) {
		const dialog = await openOrderSearch(page);
		await chooseStatus(page, dialog, status);
		await submitOrderSearch(dialog);
		await expect(dialog).toBeHidden();
		await expect(page.getByText('Không có kết quả hiển thị.', { exact: true })).toHaveCount(0);
		const firstPageLinks = await getOrderLinks(page).evaluateAll(links =>
			links.map(link => link.getAttribute('href')),
		);
		await expect(firstPageLinks.length).toBeGreaterThan(0);
		resultsByStatus.set(status, firstPageLinks);
		await verifyPagination(page, status);
	}

	expect(resultsByStatus.get('Đã duyệt')).not.toEqual(resultsByStatus.get('Hoàn tất'));
});

test('TC4a - Đóng popup tìm kiếm đơn hàng', async ({ page }) => {
	const dialog = await openOrderSearch(page);
	await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
	await expect(dialog).toBeHidden();
});
