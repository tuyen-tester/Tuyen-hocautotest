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

function getDefinitionStatusSelect(dialog) {
	return dialog.locator('select[name="status"]');
}

function getDefinitionStatusDropdown(dialog) {
	return dialog.locator('[aria-labelledby="select2-status-container"]');
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

async function chooseDefinitionStatus(page, dialog, status) {
	await getDefinitionStatusDropdown(dialog).click();
	const option = page.getByRole('treeitem', { name: status, exact: true });
	await expect(option).toBeVisible();
	await option.click();
	await expect(getDefinitionStatusDropdown(dialog)).toContainText(status);
}

function getOrderLinks(page) {
	return page.locator('.stories-card a[href*="/don-hang/dinh-muc/"]');
}

async function expectResultCardsHaveStatus(page, expectedStatus) {
	const approvedStatusButtons = page.getByRole('button', { name: new RegExp(`${expectedStatus}$`) });
	await expect(page.getByRole('button', { name: /(?<!Đã )Duyệt$/ })).toHaveCount(0);
	await expect(page.getByRole('button', { name: /Hoàn tất$/ })).toHaveCount(0);
	await expect(approvedStatusButtons.first()).toBeVisible();
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
	if (!paginationHrefs.length) return;
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

async function attachScreenshot(testInfo, name, page) {
	await testInfo.attach(name, {
		body: await page.screenshot(),
		contentType: 'image/png',
	});
}

async function expectOrderStatus(page, status) {
	const pendingStatus = status === 'Chưa duyệt định mức';
	const statusButton = pendingStatus
		? page.getByRole('button', { name: /(?<!Đã )Duyệt$/ })
		: page.getByRole('button', { name: /Đã duyệt$/ });
	await expect(statusButton.first()).toBeVisible();
	if (pendingStatus) {
		await expect(page.getByRole('button', { name: /Đã duyệt$/ })).toHaveCount(0);
	} else {
		await expect(page.getByRole('button', { name: /(?<!Đã )Duyệt$/ })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Hoàn tất', exact: true })).toHaveCount(0);
	}
}

async function readPaginationControlState(page, direction) {
	const selector = direction === 'next'
		? 'a[aria-label="pagination.next"]'
		: 'a[aria-label*="pagination.previous"], a[aria-label*="pagination.prev"]';
	const control = page.locator(selector).first();
	if (!(await control.count())) return { control, enabled: false };
	const state = await control.evaluate(element => ({
		href: element.getAttribute('href'),
		ariaDisabled: element.getAttribute('aria-disabled'),
		parentDisabled: element.closest('li')?.classList.contains('disabled') ?? false,
	}));
	return {
		control,
		enabled: Boolean(state.href && state.href !== '#' && state.ariaDisabled !== 'true' && !state.parentDisabled),
	};
}

async function verifyPaginationBoundaries(page) {
	const orderLinks = getOrderLinks(page);
	await expect(orderLinks.first()).toBeVisible();
	const firstOrderHref = await orderLinks.first().getAttribute('href');
	const pageLinks = page.locator('.page-link[href]');
	const pageNumbers = await pageLinks.evaluateAll(links =>
		links
			.map(link => ({ label: link.innerText.trim(), href: link.href }))
			.filter(link => /^\d+$/.test(link.label)),
	);
	const maxPage = Math.max(1, ...pageNumbers.map(link => Number(link.label)));
	const lastPageLink = page.getByRole('link', { name: String(maxPage), exact: true }).last();
	const hasMultiplePages = maxPage > 1 || await page.locator('a[aria-label="pagination.next"]').count() > 0;
	if (!hasMultiplePages) return { pagesVisible: 1, hasMultiplePages: false };

	const next = await readPaginationControlState(page, 'next');
	if (next.enabled) {
		await next.control.click({ noWaitAfter: true });
		await expect(page.locator('#loading-icon')).toBeHidden({ timeout: 20_000 });
		await expect.poll(() => orderLinks.first().getAttribute('href'), { timeout: 20_000 }).not.toBe(firstOrderHref);
	}

	if (await lastPageLink.count()) {
		const lastHref = await lastPageLink.getAttribute('href');
		if (lastHref && lastHref !== '#') {
			await lastPageLink.click({ noWaitAfter: true });
			await expect(page.locator('#loading-icon')).toBeHidden({ timeout: 20_000 });
			await expect.poll(() => orderLinks.first().getAttribute('href'), { timeout: 20_000 }).not.toBe(firstOrderHref);
		}
	}

	const firstPageLink = page.getByRole('link', { name: '1', exact: true }).last();
	if (await firstPageLink.count()) {
		await firstPageLink.click({ noWaitAfter: true });
		await expect(page.locator('#loading-icon')).toBeHidden({ timeout: 20_000 });
		await expect(orderLinks.first()).toHaveAttribute('href', firstOrderHref);
	}
	return { pagesVisible: pageNumbers.length, hasMultiplePages: true };
}

async function verifyEveryTc12Page(page) {
	test.setTimeout(600_000);
	const orderLinks = getOrderLinks(page);
	const visitedPageUrls = new Set();
	const statusButtons = page.getByRole('button', { name: /Đã duyệt$/ });
	for (let pageIndex = 0; pageIndex < 1000; pageIndex += 1) {
		await expect(orderLinks.first()).toBeVisible();
		await expect(statusButtons.first()).toBeVisible();
		await expect(page.getByRole('button', { name: /(?<!Đã )Duyệt$/ })).toHaveCount(0);
		const currentUrl = page.url();
		expect(visitedPageUrls.has(currentUrl), `Pagination repeated URL ${currentUrl}`).toBe(false);
		visitedPageUrls.add(currentUrl);

		const datesOnPage = await page.locator('.stories-card').evaluateAll(cards =>
			cards.flatMap(card => card.innerText.match(/\b\d{2}-\d{2}-\d{4}\b/g) || []),
		);
		for (const dateText of datesOnPage) {
			const [day, month, year] = dateText.split('-').map(Number);
			const date = new Date(Date.UTC(year, month - 1, day));
			const isoDate = date.toISOString().slice(0, 10);
			expect(isoDate.localeCompare('2026-09-01'), `Date ${dateText} must be on/after 01-09-2026`).toBeGreaterThanOrEqual(0);
			expect(isoDate.localeCompare('2026-10-20'), `Date ${dateText} must be on/before 20-10-2026`).toBeLessThanOrEqual(0);
		}

		const next = await readPaginationControlState(page, 'next');
		if (!next.enabled) return { pagesVisited: visitedPageUrls.size, lastUrl: currentUrl };
		const nextHref = await next.control.getAttribute('href');
		const expectedUrl = nextHref ? new URL(nextHref, currentUrl).href : null;
		await next.control.click({ noWaitAfter: true });
		if (expectedUrl) {
			await expect.poll(() => page.url(), { timeout: 30_000 }).toBe(expectedUrl);
		} else {
			await expect.poll(() => page.url(), { timeout: 30_000 }).not.toBe(currentUrl);
		}
		await expect(page.locator('#loading-icon')).toBeHidden({ timeout: 30_000 });
	}
	throw new Error('TC12 pagination exceeded 1000 pages without reaching the last page.');
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

test('TC8.1 - Tìm kiếm khách hàng CIE với tình trạng Đã duyệt', async ({ page }) => {
	const dialog = await openOrderSearch(page);
	await dialog.getByPlaceholder('Nhập tên / mã khách hàng', { exact: true }).fill('CIE');
	await chooseStatus(page, dialog, 'Đã duyệt');
	await submitOrderSearch(dialog);
	await expect(dialog).toBeHidden();
	await expect(page.getByText('Không có kết quả hiển thị.', { exact: true })).toHaveCount(0);
	await expect(getOrderLinks(page).first()).toBeVisible();
	await expectResultCardsHaveStatus(page, 'Đã duyệt');
	await verifyPagination(page, 'Đã duyệt');
});

test('TC8.2 - Tìm kiếm Đã duyệt + ngày đặt + khách hàng KTY', async ({ page }) => {
	const dialog = await openOrderSearch(page);
	await chooseStatus(page, dialog, 'Đã duyệt');
	const dates = dialog.getByPlaceholder('dd-mm-yyyy', { exact: true });
	await dates.nth(0).fill('01-09-2026');
	await dates.nth(1).fill('01-10-2026');
	await dialog.getByPlaceholder('Nhập tên / mã khách hàng', { exact: true }).fill('KTY');
	await submitOrderSearch(dialog);
	await expect(dialog).toBeHidden();
	await expect(page.getByText('Không có kết quả hiển thị.', { exact: true })).toHaveCount(0);
	await expect(getOrderLinks(page).first()).toBeVisible();
	await expectResultCardsHaveStatus(page, 'Đã duyệt');
	await verifyPagination(page, 'Đã duyệt');
});

test('TC8.3 - Tìm kiếm Đã duyệt + ĐHSA_TAI CHE_03 + người tạo katuyen_sp', async ({ page }) => {
	const dialog = await openOrderSearch(page);
	await chooseStatus(page, dialog, 'Đã duyệt');
	await dialog.getByPlaceholder('Nhập tên / mã đơn hàng', { exact: true }).fill('ĐHSA_TAI CHE_03');
	await dialog.getByPlaceholder('Nhập người tạo định mức', { exact: true }).fill('katuyen_sp');
	await submitOrderSearch(dialog);
	await expect(dialog).toBeHidden();
	await expect(page.getByText('Không có kết quả hiển thị.', { exact: true })).toHaveCount(0);
	await expect(getOrderLinks(page).first()).toBeVisible();
	await expectResultCardsHaveStatus(page, 'Đã duyệt');
	await verifyPagination(page, 'Đã duyệt');
});

test('TC9 - Đổi trạng thái giữa các lần tìm kiếm và kiểm tra phân trang', async ({ page }) => {
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

test('TC09 - Tìm kiếm trống không tự áp dụng tình trạng định mức', async ({ page }, testInfo) => {
	const dialog = await openOrderSearch(page);
	await expect(dialog).toContainText('Tìm kiếm đơn hàng');
	await expect(getDefinitionStatusSelect(dialog)).toHaveValue('');
	const emptyInputs = await dialog.locator('input:visible').evaluateAll(inputs =>
		inputs.map(input => input.value),
	);
	expect(emptyInputs.every(value => value === '')).toBe(true);
	const originalOrderLinks = await getOrderLinks(page).evaluateAll(links =>
		links.map(link => link.getAttribute('href')),
	);
	const originalCards = await getVisibleOrderCards(page);
	expect(originalOrderLinks.length).toBeGreaterThan(0);

	await submitOrderSearch(dialog);
	await expect(dialog).toBeHidden();
	await expect(page.getByText('Không có kết quả hiển thị.', { exact: true })).toHaveCount(0);
	await expect(await getOrderLinks(page).evaluateAll(links =>
		links.map(link => link.getAttribute('href')),
	)).toEqual(originalOrderLinks);
	await expect(await getVisibleOrderCards(page)).toEqual(originalCards);
	await attachScreenshot(testInfo, 'TC09-empty-search-results.png', page);
});

test('TC10 - Chưa duyệt định mức + mã đơn hàng + khách hàng', async ({ page }, testInfo) => {
	const dialog = await openOrderSearch(page);
	await expect(dialog).toContainText('Tìm kiếm đơn hàng');
	await chooseDefinitionStatus(page, dialog, 'Chưa duyệt định mức');
	const orderInput = dialog.getByPlaceholder('Nhập tên / mã đơn hàng', { exact: true });
	const customerInput = dialog.getByPlaceholder('Nhập tên / mã khách hàng', { exact: true });
	await orderInput.fill('KTY-20261015-SIZYTA-QAT');
	await customerInput.fill('KTY');
	await expect(orderInput).toHaveValue('KTY-20261015-SIZYTA-QAT');
	await expect(customerInput).toHaveValue('KTY');
	await expect(getDefinitionStatusDropdown(dialog)).toContainText('Chưa duyệt định mức');

	await submitOrderSearch(dialog);
	await expect(dialog).toBeHidden();
	await expect(page.getByText('Không có kết quả hiển thị.', { exact: true })).toHaveCount(0);
	const matchingOrder = page.getByRole('link', { name: 'KTY-20261015-SIZYTA-QAT', exact: true });
	await expect(matchingOrder).toBeVisible();
	await expect(matchingOrder).toContainText('KTY');
	await expectOrderStatus(page, 'Chưa duyệt định mức');
	await attachScreenshot(testInfo, 'TC10-pending-order-search.png', page);
});

test('TC11 - Đã duyệt định mức + khách CIE + NPL NYSAND', async ({ page }, testInfo) => {
	test.setTimeout(180_000);
	const dialog = await openOrderSearch(page);
	await expect(dialog).toContainText('Tìm kiếm đơn hàng');
	await chooseDefinitionStatus(page, dialog, 'Đã duyệt định mức');
	await dialog.getByPlaceholder('Nhập tên / mã khách hàng', { exact: true }).fill('CIE');
	await dialog.getByPlaceholder('Nhập tên/ mã NPL', { exact: true }).fill('NYSAND');
	await expect(getDefinitionStatusDropdown(dialog)).toContainText('Đã duyệt định mức');
	await submitOrderSearch(dialog);
	await expect(dialog).toBeHidden();
	await expect(page.getByText('Không có kết quả hiển thị.', { exact: true })).toHaveCount(0);
	await expect(page.getByText('CIE', { exact: true }).first()).toBeVisible();
	await expectOrderStatus(page, 'Đã duyệt định mức');

	const orderLinks = getOrderLinks(page);
	const orderHrefs = [...new Set(await orderLinks.evaluateAll(links =>
		links.map(link => link.getAttribute('href')),
	))];
	let matchingNplOrder = false;
	for (let index = 0; index < orderHrefs.length; index += 1) {
		const orderPath = new URL(orderHrefs[index], ORDERS_URL).pathname;
		await page.locator(`.stories-card a[href^="${orderPath}"]:visible`).first().click();
		await expect(page).toHaveURL(/\/don-hang\/dinh-muc\//);
		const detailText = await page.locator('body').innerText();
		const selectedOptions = await page.locator('select option:checked').evaluateAll(options =>
			options.map(option => `${option.value} ${option.textContent}`),
		);
		if (/NYSAND/i.test(`${detailText} ${selectedOptions.join(' ')}`)) {
			matchingNplOrder = true;
			await attachScreenshot(testInfo, `TC11-NYSAND-order-${index + 1}.png`, page);
			break;
		}
		await page.goBack({ waitUntil: 'domcontentloaded' });
		await expect(getOrderLinks(page).first()).toBeVisible();
	}
	expect(matchingNplOrder, 'No matching order detail contains an NYSAND material').toBe(true);
	await attachScreenshot(testInfo, 'TC11-filtered-results.png', page);
});

test('TC12 - Đã duyệt định mức + ngày đặt từ + ngày giao đến', async ({ page }, testInfo) => {
	test.setTimeout(600_000);
	const dialog = await openOrderSearch(page);
	await expect(dialog).toContainText('Tìm kiếm đơn hàng');
	await chooseDefinitionStatus(page, dialog, 'Đã duyệt định mức');
	const dates = dialog.getByPlaceholder('dd-mm-yyyy', { exact: true });
	await dates.nth(0).fill('01-09-2026');
	await dates.nth(3).fill('20-10-2026');
	await dates.nth(3).press('Escape');
	await expect(dates.nth(0)).toHaveValue('01-09-2026');
	await expect(dates.nth(3)).toHaveValue('20-10-2026');
	await submitOrderSearch(dialog);
	await expect(dialog).toBeHidden();
	await expect(page.getByText('Không có kết quả hiển thị.', { exact: true })).toHaveCount(0);
	await expect(getOrderLinks(page).first()).toBeVisible();
	await expectOrderStatus(page, 'Đã duyệt định mức');
	const paginationSummary = await verifyEveryTc12Page(page);
	await testInfo.attach('TC12-pagination-summary.json', {
		body: JSON.stringify(paginationSummary, null, 2),
		contentType: 'application/json',
	});
	await attachScreenshot(testInfo, 'TC12-date-range-search.png', page);
});

test('TC13 - Đổi tình trạng định mức và kiểm tra trang đầu, kế tiếp, cuối, quay lại đầu', async ({ page }, testInfo) => {
	test.setTimeout(240_000);
	const firstPageResults = new Map();
	const pageCounts = new Map();
	for (const status of ['Chưa duyệt định mức', 'Đã duyệt định mức']) {
		const dialog = await openOrderSearch(page);
		await chooseDefinitionStatus(page, dialog, status);
		await expect(getDefinitionStatusSelect(dialog).locator('option:checked')).toHaveText(status);
		await submitOrderSearch(dialog);
		await expect(dialog).toBeHidden();
		await expect(page.getByText('Không có kết quả hiển thị.', { exact: true })).toHaveCount(0);
		await expect(getOrderLinks(page).first()).toBeVisible();
		await attachScreenshot(testInfo, `TC13-${status.replace(/\s+/g, '-')}-results.png`, page);
		const firstPageHrefs = await getOrderLinks(page).evaluateAll(links =>
			links.map(link => link.getAttribute('href')),
		);
		firstPageResults.set(status, firstPageHrefs);
		pageCounts.set(status, await verifyPaginationBoundaries(page));
		await attachScreenshot(testInfo, `TC13-${status.replace(/\s+/g, '-')}-first-page.png`, page);
	}
	expect(firstPageResults.get('Chưa duyệt định mức')).not.toEqual(
		firstPageResults.get('Đã duyệt định mức'),
	);
	expect(pageCounts.get('Chưa duyệt định mức').pagesVisible).toBeGreaterThan(0);
	expect(pageCounts.get('Đã duyệt định mức').pagesVisible).toBeGreaterThan(0);
	await testInfo.attach('TC13-pagination-summary.json', {
		body: JSON.stringify(Object.fromEntries(pageCounts), null, 2),
		contentType: 'application/json',
	});
});
