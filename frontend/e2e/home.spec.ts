import { expect, test } from '@playwright/test'

test.describe('marketing home', () => {
  test('loads and shows Scribely branding', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Scribely/i)
    await expect(page.getByRole('navigation')).toBeVisible()
  })
})
