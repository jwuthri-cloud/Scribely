import { describe, expect, it, vi } from 'vitest'
import { createLiveTaskRunner } from './live-task'

const entry = (id: string, text: string) => ({ id, speaker: 'Them', text, startTime: 65_000, endTime: 66_000, source: 'system' })

describe('createLiveTaskRunner', () => {
  it('runs the task on buffered lines and emits a card; NOTHING emits nothing; no task drops the buffer', async () => {
    vi.useFakeTimers()
    let task = 'Flag objections'
    const run = vi.fn(async (_t: string, delta: string) => (delta.includes('expensive') ? { text: 'Objection: price', after: null } : null))
    const emit = vi.fn()
    const write = vi.fn()
    const runner = createLiveTaskRunner({ getTask: () => task, getIntervalMs: () => 30_000, run, emit, write })

    runner.push(entry('a', 'ignored before start'))
    runner.start()
    runner.push(entry('b', 'this is expensive'))
    await vi.advanceTimersByTimeAsync(30_000)
    expect(run).toHaveBeenCalledWith('Flag objections', '[1:05] Them: this is expensive')
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit.mock.calls[0][0]).toMatchObject({ type: 'task', description: 'Objection: price', sourceEntryId: 'b' })
    expect(write).toHaveBeenCalledWith('Objection: price', null)

    runner.push(entry('c', 'fine'))
    await vi.advanceTimersByTimeAsync(30_000)
    expect(emit).toHaveBeenCalledTimes(1) // null result → no card

    task = ''
    runner.push(entry('d', 'expensive again'))
    await vi.advanceTimersByTimeAsync(30_000)
    task = 'Flag objections'
    await vi.advanceTimersByTimeAsync(30_000)
    expect(run).toHaveBeenCalledTimes(2) // 'd' was dropped while no task was set

    runner.stop()
    vi.useRealTimers()
  })
})
