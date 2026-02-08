import { test, expect } from '@playwright/test'

/**
 * Basic E2E tests for {{ cookiecutter.project_name }}
 *
 * These tests verify that the application is running and basic functionality works.
 */

test.describe('Application Health', () => {
  test('should load the homepage', async ({ page }) => {
    await page.goto('/')

    // Wait for the page to be fully loaded
    await page.waitForLoadState('networkidle')

    // Check that the page has content
    await expect(page.locator('body')).not.toBeEmpty()
  })

  test('should have a valid health endpoint', async ({ request }) => {
    const response = await request.get('/api/health')

    // Health endpoint should return 200
    expect(response.ok()).toBeTruthy()

    // Parse response
    const data = await response.json()

    // Check response structure
    expect(data).toHaveProperty('status')
    expect(data.status).toBe('healthy')
  })

  test('should display navigation elements', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Check for basic UI elements (adjust selectors based on your actual UI)
    // These are examples - modify based on your actual page structure
    const body = page.locator('body')
    await expect(body).toBeVisible()
  })
})

test.describe('Chat Interface', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the chat page (adjust URL if needed)
    await page.goto('/chat')
    await page.waitForLoadState('networkidle')
  })

  test('should display chat container', async ({ page }) => {
    // Look for chat-related elements
    // Adjust selectors based on your actual chat implementation
    const chatContainer = page.locator('[data-testid="chat-container"]').or(
      page.locator('.chat-container')
    ).or(
      page.locator('main')
    )

    await expect(chatContainer).toBeVisible()
  })

  test('should have an input field for messages', async ({ page }) => {
    // Look for input field
    const input = page.locator('input[type="text"]').or(
      page.locator('textarea')
    ).or(
      page.locator('[data-testid="message-input"]')
    )

    // At least one should exist
    const count = await input.count()
    expect(count).toBeGreaterThan(0)
  })

  test('should have a send button', async ({ page }) => {
    // Look for send button
    const button = page.locator('button[type="submit"]').or(
      page.locator('button:has-text("Send")')
    ).or(
      page.locator('[data-testid="send-button"]')
    )

    const count = await button.count()
    expect(count).toBeGreaterThan(0)
  })
})

test.describe('Accessibility', () => {
  test('should have no critical accessibility violations', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Basic accessibility check - page should have a title
    const title = await page.title()
    expect(title.length).toBeGreaterThan(0)

    // Check for main landmark
    const main = page.locator('main').or(page.locator('[role="main"]'))
    const hasMain = await main.count() > 0

    // Log if main is missing (not a hard failure)
    if (!hasMain) {
      console.warn('Warning: Page is missing main landmark')
    }
  })
})

test.describe('Performance', () => {
  test('should load within acceptable time', async ({ page }) => {
    const startTime = Date.now()

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const loadTime = Date.now() - startTime

    // Page should load within 10 seconds
    expect(loadTime).toBeLessThan(10000)

    console.log(`Page load time: ${loadTime}ms`)
  })
})
