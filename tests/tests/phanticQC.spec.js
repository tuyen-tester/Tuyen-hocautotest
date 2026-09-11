const { expect, test } = require('@playwright/test');

const BASE_URL = process.env.QC_BASE_URL || 'http://qc-client.datacenter.tms-s.vn';
const LOGIN_URL = `${BASE_URL}/login`;
const QC_URL = `${BASE_URL}/qc-ngoai-chuyen`;
const ORDER_NAME = process.env.QC_ORDER_NAME || 'DHSA-TEST-QC-SANLUONG';
const PASSWORD = process.env.QC_PASSWORD || 'huynhtuyen';
const USERS = [
	process.env.QC_USER_1 || 'katuyen_marketing',
	process.env.QC_USER_2 || 'tuyen_ebd1',
];
const INCREASE_COUNT = Number(process.env.QC_INCREASE_COUNT || 20);
const DECREASE_COUNT = Number(process.env.QC_DECREASE_COUNT || 10);
const LOOP_ROUNDS = Number(process.env.QC_LOOP_ROUNDS || 1);
const KEY_PRESS_DELAY = Number(process.env.QC_KEY_PRESS_DELAY || 250);
const SYNC_WAIT = Number(process.env.QC_SYNC_WAIT || 21_000);

async function login(page, username) {
	await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
	await page.getByPlaceholder('Nhập tên tài khoản').fill(username);
	await page.getByPlaceholder('Nhập mật khẩu').fill(PASSWORD);
	await page.getByRole('button', { name: 'Đăng Nhập', exact: true }).click();
	await expect(page).not.toHaveURL(/\/login(?:$|\?)/i, { timeout: 30_000 });
	await page.goto(QC_URL, { waitUntil: 'domcontentloaded' });
	await expect(page.getByText('F1 Quét mã đơn hàng', { exact: true })).toBeVisible({ timeout: 30_000 });
}

async function scanOrder(page) {
	await page.keyboard.press('F1');
	const dialog = page.getByRole('dialog', { name: 'Quét mã QR đơn hàng' });
	await expect(dialog).toBeVisible();

	const combobox = dialog.getByRole('combobox');
	await combobox.click();
	await expect(page.getByRole('option').first()).toBeVisible({ timeout: 15_000 });
	await page.getByRole('option', { name: ORDER_NAME, exact: true }).click();
	await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).click();
	await expect(dialog).toBeHidden({ timeout: 15_000 });
	await page.waitForTimeout(1_500);
}

async function readProduction(page) {
	const mainText = await page.locator('main').innerText();
	const orderMatch = mainText.match(/Sản lượng đơn hàng\s+(\d+)\s*\/\s*(\d+)/);
	const lineMatch = mainText.match(/Mục tiêu:\s*(\d+)\s*\/\s*(\d+)/);
	return {
		order: orderMatch ? Number(orderMatch[1]) : null,
		orderTarget: orderMatch ? Number(orderMatch[2]) : null,
		line: lineMatch ? Number(lineMatch[1]) : null,
		lineTarget: lineMatch ? Number(lineMatch[2]) : null,
	};
}

async function changeProduction(page, key, count) {
	for (let index = 0; index < count; index += 1) {
		await page.keyboard.press(key);
		await page.waitForTimeout(KEY_PRESS_DELAY);
	}
}

async function waitForProductionChange(page, expectedOrder, expectedLine) {
	await expect.poll(async () => readProduction(page), { timeout: 15_000 }).toMatchObject({
		order: expectedOrder,
		line: expectedLine,
	});
}

test('QC Ngoài Chuyền - hai user cùng tăng 20, giảm 10 bằng vòng lặp for', async ({ browser }) => {
	test.setTimeout(180_000);
	const contexts = await Promise.all(USERS.map(() => browser.newContext()));
	const pages = await Promise.all(contexts.map(context => context.newPage()));

	try {
		await Promise.all(pages.map((page, index) => login(page, USERS[index])));
		await Promise.all(pages.map(page => scanOrder(page)));

		const baseline = await readProduction(pages[0]);
		expect(baseline.order, 'Không đọc được sản lượng đơn hàng baseline').not.toBeNull();
		expect(baseline.line, 'Không đọc được sản lượng chuyền baseline').not.toBeNull();

		for (let round = 1; round <= LOOP_ROUNDS; round += 1) {
			for (const page of pages) {
				await changeProduction(page, 'Enter', INCREASE_COUNT);
			}
			await Promise.all(pages.map(page => page.waitForTimeout(SYNC_WAIT)));
			await Promise.all(pages.map(page => scanOrder(page)));

			const expectedAfterIncrease = baseline.order + round * USERS.length * INCREASE_COUNT;
			const expectedLineAfterIncrease = baseline.line + round * USERS.length * INCREASE_COUNT;
			await Promise.all(pages.map(page => waitForProductionChange(
				page,
				expectedAfterIncrease,
				expectedLineAfterIncrease,
			)));

			for (const page of pages) {
				await changeProduction(page, 'ArrowDown', DECREASE_COUNT);
			}
			await Promise.all(pages.map(page => page.waitForTimeout(SYNC_WAIT)));
			await Promise.all(pages.map(page => scanOrder(page)));

			const expectedAfterDecrease = expectedAfterIncrease - USERS.length * DECREASE_COUNT;
			const expectedLineAfterDecrease = expectedLineAfterIncrease - USERS.length * DECREASE_COUNT;
			await Promise.all(pages.map(page => waitForProductionChange(
				page,
				expectedAfterDecrease,
				expectedLineAfterDecrease,
			)));
		}

		const finalStates = await Promise.all(pages.map(page => readProduction(page)));
		const expectedFinal = {
			order: baseline.order + LOOP_ROUNDS * USERS.length * (INCREASE_COUNT - DECREASE_COUNT),
			line: baseline.line + LOOP_ROUNDS * USERS.length * (INCREASE_COUNT - DECREASE_COUNT),
		};
		for (const state of finalStates) {
			expect(state).toMatchObject(expectedFinal);
		}
	} finally {
		await Promise.all(contexts.map(context => context.close()));
	}
});

test('QC Ngoài Chuyền - hai user tăng giảm không reload hoặc quét lại đơn hàng', async ({ browser }) => {
	test.setTimeout(180_000);
	const contexts = await Promise.all(USERS.map(() => browser.newContext()));
	const pages = await Promise.all(contexts.map(context => context.newPage()));

	try {
		await Promise.all(pages.map((page, index) => login(page, USERS[index])));
		await Promise.all(pages.map(page => scanOrder(page)));

		const baseline = await readProduction(pages[0]);
		expect(baseline.order, 'Không đọc được sản lượng đơn hàng baseline').not.toBeNull();
		expect(baseline.line, 'Không đọc được sản lượng chuyền baseline').not.toBeNull();

		for (let round = 1; round <= LOOP_ROUNDS; round += 1) {
			await Promise.all(pages.map(page => changeProduction(page, 'Enter', INCREASE_COUNT)));
			await Promise.all(pages.map(page => page.waitForTimeout(SYNC_WAIT)));

			const expectedAfterIncrease = baseline.order + round * USERS.length * INCREASE_COUNT;
			const expectedLineAfterIncrease = baseline.line + round * USERS.length * INCREASE_COUNT;
			await Promise.all(pages.map(page => waitForProductionChange(
				page,
				expectedAfterIncrease,
				expectedLineAfterIncrease,
			)));

			await Promise.all(pages.map(page => changeProduction(page, 'ArrowDown', DECREASE_COUNT)));
			await Promise.all(pages.map(page => page.waitForTimeout(SYNC_WAIT)));

			const expectedAfterDecrease = expectedAfterIncrease - round * USERS.length * DECREASE_COUNT;
			const expectedLineAfterDecrease = expectedLineAfterIncrease - round * USERS.length * DECREASE_COUNT;
			await Promise.all(pages.map(page => waitForProductionChange(
				page,
				expectedAfterDecrease,
				expectedLineAfterDecrease,
			)));
		}

		const finalStates = await Promise.all(pages.map(page => readProduction(page)));
		const expectedFinal = {
			order: baseline.order + LOOP_ROUNDS * USERS.length * (INCREASE_COUNT - DECREASE_COUNT),
			line: baseline.line + LOOP_ROUNDS * USERS.length * (INCREASE_COUNT - DECREASE_COUNT),
		};
		for (const state of finalStates) {
			expect(state).toMatchObject(expectedFinal);
		}
	} finally {
		await Promise.all(contexts.map(context => context.close()));
	}
});
