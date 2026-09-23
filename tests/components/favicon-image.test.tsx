// @vitest-environment jsdom
import React from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The favicon endpoint takes the hostname in its query string, so every
 * request tells Google one host the user keeps a login for. For a public site
 * that is the cost the opt-in names. For a private host it is worse than that:
 * `pulseward` and `jira.internal.acme-corp.com` do not resolve outside the
 * network they are on, so sending them describes a network nobody outside it
 * can see, and the user gets no favicon back either way.
 *
 * tests/privacy-claims.test.ts asserts that only this component may reach the
 * endpoint at all. This file asserts which hosts it may reach it *for*, which
 * is a runtime question and cannot be read off the source.
 */
vi.mock('@plasmohq/storage/hook', () => ({
  // The opt-in turned on, which is the only state where any of this matters.
  useStorage: () => ['google']
}))
vi.mock('~/core/storage/config', () => ({ extensionStorage: {} }))
vi.mock('../../core/storage/config', () => ({ extensionStorage: {} }))

import { FaviconImage } from '~/components/ui/FaviconImage'

afterEach(cleanup)

function remoteRequest(domain: string): string | null {
  const { container } = render(<FaviconImage domain={domain} />)
  return container.querySelector('img')?.getAttribute('src') ?? null
}

describe('FaviconImage with remote favicons turned on', () => {
  it('asks Google about a public site, which is what the opt-in is for', () => {
    expect(remoteRequest('github.com')).toContain('s2/favicons')
    expect(remoteRequest('dash.cloudflare.com')).toContain('dash.cloudflare.com')
  })

  it('never asks about a host on this machine or this network', () => {
    for (const domain of [
      'localhost:3000',
      '127.0.0.1',
      '192.168.1.50:8123',
      'pulseward',
      'pulseward:4180',
      'nas.local',
      'jira.corp.internal',
      '[fd00::1]'
    ]) {
      expect(remoteRequest(domain), domain).toBeNull()
    }
  })
})
