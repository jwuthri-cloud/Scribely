/** Run with: npx vitest run src/main/llm/anthropic-chat.test.ts */
import { test, expect } from 'vitest'
import { convertMessages } from './anthropic-chat'

test('system prompt is hoisted out of the message list', () => {
  const { system, messages } = convertMessages([
    { role: 'system', content: 'You are Scribely.' },
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'hello' },
  ])
  expect(system).toBe('You are Scribely.')
  expect(messages).toEqual([
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'hello' },
  ])
})

test('image_url data URLs become base64 image blocks', () => {
  const { messages } = convertMessages([
    {
      role: 'user',
      content: [
        { type: 'text', text: 'what is this' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
      ],
    },
  ])
  expect(messages[0].content).toEqual([
    { type: 'text', text: 'what is this' },
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
  ])
})

test('non-data image URLs pass through as url sources', () => {
  const { messages } = convertMessages([
    { role: 'user', content: [{ type: 'image_url', image_url: { url: 'https://x/y.png' } }] },
  ])
  expect(messages[0].content).toEqual([
    { type: 'image', source: { type: 'url', url: 'https://x/y.png' } },
  ])
})

test('no system message means no system field', () => {
  expect(convertMessages([{ role: 'user', content: 'hi' }]).system).toBeUndefined()
})
