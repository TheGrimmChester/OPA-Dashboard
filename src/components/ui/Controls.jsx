import React from 'react'
import { Segmented, Tabs as FamilyTabs } from '@open-family/ui'

/**
 * A segmented control switches a view or a density. It does not navigate — that
 * is `Tabs`. 32px, not the 24px this used to render.
 */
export function SegmentedControl({ options = [], value, onChange, label }) {
  const items = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o))
  return (
    <Segmented
      aria-label={label || 'Select a view'}
      value={value}
      onChange={onChange}
      items={items}
    />
  )
}

/**
 * A tab strip for a page's own views. 40px hit target.
 *
 * The family's `Tabs` carries no icon slot: a tab is a short noun and an icon
 * beside it adds a second thing to scan for no gain in a strip of four.
 */
export function Tabs({ tabs = [], value, onChange, label }) {
  const items = tabs.map(({ value: v, label: l, count }) => ({ value: v, label: l, count }))
  return (
    <FamilyTabs
      aria-label={label || 'Views'}
      value={value}
      onChange={onChange}
      items={items}
    />
  )
}
