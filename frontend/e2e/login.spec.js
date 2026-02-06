import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

test.describe('System Bezpieczeństwa - Testy Logowania', () => {

    // Krok wstępny: Mockowanie CAPTCHA
    test.beforeEach(async({ page }) => {
        await page.route('**/captcha', async route => {
            const json = {
                image: '<svg height="50" width="150"><rect width="100%" height="100%" fill="#eee"/><text x="10" y="35" font-family="Arial" font-size="20" fill="black">ABCD</text></svg>',
                id: 'fake-captcha-id-123'
            };
            await route.fulfill({ json });
        });

        await page.goto(BASE_URL);
    });

    test('TC01: Powinien poprawnie wyświetlić formularz logowania i Captcha', async({ page }) => {
        // Sprawdzamy nagłówek
        await expect(page.getByText('System Bezpieczeństwa')).toBeVisible();

        // Szukamy inputów po typie (bo brak ID w kodzie React)
        await expect(page.locator('input[type="text"]').first()).toBeVisible();
        await expect(page.locator('input[type="password"]')).toBeVisible();

        // Sprawdzamy obrazek Captcha
        const captchaContainer = page.locator('.border.bg-white svg');
        await expect(captchaContainer).toBeVisible();
    });

    test('TC02: Logowanie poprawne (Rola: User)', async({ page }) => {
        await page.route('**/login', async route => {
            await route.fulfill({
                json: { token: 'fake-jwt-token-user', role: 'user', mustChange: false }
            });
        });

        // Wypełnianie pól
        await page.locator('input[type="text"]').first().fill('jan_kowalski');
        await page.locator('input[type="password"]').fill('TajneHaslo123');
        await page.getByPlaceholder('Przepisz kod z obrazka').fill('ABCD');

        await page.getByRole('button', { name: 'Zaloguj' }).click();

        await expect(page).toHaveURL(/\/user/);
        await expect(page.getByText('Panel Użytkownika')).toBeVisible();
    });

    test('TC03: Logowanie poprawne (Rola: Admin)', async({ page }) => {
        await page.route('**/login', async route => {
            page.route('**/users', r => r.fulfill({ json: [] }));
            page.route('**/settings', r => r.fulfill({ json: {} }));

            await route.fulfill({
                json: { token: 'fake-jwt-token-admin', role: 'admin', mustChange: false }
            });
        });

        await page.locator('input[type="text"]').first().fill('admin');
        await page.locator('input[type="password"]').fill('admin123');
        await page.getByPlaceholder('Przepisz kod z obrazka').fill('ABCD');

        await page.getByRole('button', { name: 'Zaloguj' }).click();

        await expect(page).toHaveURL(/\/admin/);
        await expect(page.getByText('Admin', { exact: true })).toBeVisible();
    });

    test('TC04: Błąd logowania', async({ page }) => {
        await page.route('**/login', async route => {
            await route.fulfill({
                status: 401,
                json: { message: 'Nieprawidłowe dane logowania' }
            });
        });

        await page.locator('input[type="text"]').first().fill('ktos');
        await page.locator('input[type="password"]').fill('złe_hasło');
        await page.getByPlaceholder('Przepisz kod z obrazka').fill('ABCD');

        await page.getByRole('button', { name: 'Zaloguj' }).click();

        const errorMsg = page.getByText('Nieprawidłowe dane logowania');
        await expect(errorMsg).toBeVisible();

        await expect(page.locator('input[type="password"]')).toBeEmpty();
    });

    test('TC05: Logowanie -> Wylogowanie', async({ page }) => {
        await page.route('**/login', async route => {
            await route.fulfill({ json: { token: 'token', role: 'user', mustChange: false } });
        });

        // Logowanie
        await page.locator('input[type="text"]').first().fill('user');
        await page.locator('input[type="password"]').fill('pass');
        await page.getByPlaceholder('Przepisz kod z obrazka').fill('ABCD');
        await page.getByRole('button', { name: 'Zaloguj' }).click();

        // Sprawdzamy czy weszliśmy
        await expect(page).toHaveURL(/\/user/);

        // Klikamy wyloguj
        await page.getByRole('button', { name: 'Wyloguj' }).click();

        // Asercja powrotu do strony głównej
        await expect(page.getByText('System Bezpieczeństwa')).toBeVisible();

        // --- POPRAWKA TUTAJ ---
        // Zamiast '/', używamy pełnego adresu URL lub Regexa, 
        // ponieważ przeglądarka zwraca 'http://localhost:5173/'
        await expect(page).toHaveURL(BASE_URL + '/');
    });

});