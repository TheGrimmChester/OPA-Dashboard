/**
 * The design system is a contract, not a style guide.
 *
 * Every assertion here failed before this migration: custom properties that were
 * referenced and never defined, two competing spacing scales live at once, a
 * hard-coded accent that contradicted the product's own, and nine icon glyphs
 * doing double duty across a rail that collapses to icons only.
 *
 * The approach is borrowed from the design system's own token test: parse the
 * stylesheets rather than trusting that a value is still what a comment says.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

import { navItems, navGlyphCollisions, NAV_SECTIONS } from '../nav.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const src = join(root, 'src')
const kit = join(root, 'node_modules', '@open-family', 'ui', 'styles')

/**
 * Custom properties that legitimately have no static declaration because a
 * component sets them inline from JavaScript. Each entry names where.
 */
const SET_AT_RUNTIME = new Set([
  '--stack-indent', // ExecutionStackTree.jsx sets this per depth level
])

/** Comments explain the rules; they are not the rules. */
function stripComments(text, isScript) {
  let out = text.replace(/\/\*[\s\S]*?\*\//g, '')
  if (isScript) {
    // Whole-line `//` and JSDoc continuation lines. A `var(--x)` written inside
    // prose is not a reference the browser will ever try to resolve.
    out = out
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*)/.test(line))
      .join('\n')
  }
  return out
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.git', 'dist'].includes(name)) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

// Test files state the rules and therefore quote the things the rules forbid —
// a legacy token name as a negative control, a banned hex in a matcher. Scanning
// them would make this suite fail on its own documentation.
const sourceFiles = walk(src)
  .filter((f) => ['.css', '.js', '.jsx'].includes(extname(f)))
  .filter((f) => !/\.test\.(js|jsx)$/.test(f))
const cleaned = new Map(
  sourceFiles.map((f) => {
    const isScript = extname(f) !== '.css'
    return [f, stripComments(readFileSync(f, 'utf8'), isScript)]
  })
)

function declaredIn(text) {
  const found = new Set()
  for (const m of text.matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;{}]+)[;}]/g)) found.add(m[1])
  return found
}

const declared = new Set(SET_AT_RUNTIME)
for (const layer of ['tokens.css', 'components.css', 'open-ui.css']) {
  try {
    for (const name of declaredIn(readFileSync(join(kit, layer), 'utf8'))) declared.add(name)
  } catch {
    /* the kit ships three layers; tolerate a rename rather than failing here */
  }
}
for (const text of cleaned.values()) {
  for (const name of declaredIn(text)) declared.add(name)
}

describe('custom property contract', () => {
  it('the design system stylesheet is resolvable, so this suite is meaningful', () => {
    // Guards against the whole file passing vacuously because the kit moved.
    expect(declared.has('--space-4')).toBe(true)
    expect(declared.has('--text-base')).toBe(true)
    expect(declared.has('--accent')).toBe(true)
    expect(declared.size).toBeGreaterThan(200)
  })

  it('every custom property the product references is defined somewhere', () => {
    const missing = new Map()
    for (const [file, text] of cleaned) {
      for (const m of text.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) {
        if (declared.has(m[1])) continue
        const at = relative(root, file)
        if (!missing.has(m[1])) missing.set(m[1], new Set())
        missing.get(m[1]).add(at)
      }
    }
    // An undefined property does not throw — the declaration silently drops and
    // the element inherits whatever its parent had, which is why this is a test.
    expect(
      [...missing.entries()].map(([name, files]) => `${name} (${[...files].join(', ')})`)
    ).toEqual([])
  })
})

describe('one scale, not two', () => {
  const legacy = [
    ['--sp-', 'the px spacing scale whose names lied about their values'],
    ['--spacing-', 'the rem spacing scale that competed with it'],
    ['--fs-', 'the old font-size scale'],
    ['--font-size-', 'the other old font-size scale'],
    ['--fw-', 'the old font-weight scale'],
    ['--series-', 'the per-repo chart palette'],
    ['--tier-', 'the per-repo operation-tier palette'],
  ]

  it.each(legacy)('no reference to %s remains (%s)', (prefix) => {
    const hits = []
    for (const [file, text] of cleaned) {
      for (const m of text.matchAll(new RegExp(`var\\(\\s*(${prefix}[a-zA-Z0-9-]*)`, 'g'))) {
        hits.push(`${relative(root, file)}: ${m[1]}`)
      }
    }
    expect(hits).toEqual([])
  })

  it('finds a legacy name when one is actually present', () => {
    // Negative control for the matcher above: if this ever fails, the tests
    // before it are passing because the regex is broken, not because the code is
    // clean.
    const sample = 'padding: var(--sp-5) var(--spacing-md);'
    const found = [...sample.matchAll(/var\(\s*(--sp-[a-zA-Z0-9-]*)/g)]
    expect(found).toHaveLength(1)
  })
})

describe('the accent belongs to the product, not the page', () => {
  it('no stylesheet or component hard-codes a family accent hex', () => {
    // #7C6CFF was shared by four of the five dashboards, which is why three of
    // them were visually indistinguishable.
    const banned = /#7c6cff|#1aa6a0|#3d9cf0/i
    const hits = []
    for (const [file, text] of cleaned) {
      if (banned.test(text)) hits.push(relative(root, file))
    }
    expect(hits).toEqual([])
  })
})

describe('the collapsed rail is legible', () => {
  it('no two destinations share an icon glyph', () => {
    expect(navGlyphCollisions()).toEqual([])
  })

  it('every nav item has an icon and a route', () => {
    for (const item of navItems()) {
      expect(item.icon, `${item.to} has no icon`).toBeTruthy()
      expect(item.to.startsWith('/'), `${item.to} is not a route`).toBe(true)
    }
  })

  it('Administration is the last section, and there is no second Overview', () => {
    expect(NAV_SECTIONS.at(-1).id).toBe('administration')
    const overviews = navItems().filter((i) => i.to === '/overview')
    expect(overviews).toHaveLength(1)
  })
})

describe('page structure', () => {
  const pages = sourceFiles.filter((f) => f.includes(`${'pages'}/`) && extname(f) === '.jsx')

  it('found the page directory, so the next assertion is meaningful', () => {
    expect(pages.length).toBeGreaterThan(30)
  })

  it('no page hand-rolls a page header any more', () => {
    const offenders = []
    for (const file of pages) {
      const text = cleaned.get(file)
      if (/opa-page-head|opa-page-title|opa-page-sub|opa-page-header/.test(text)) {
        offenders.push(relative(root, file))
      }
    }
    expect(offenders).toEqual([])
  })

  it('no page renders more than one h1', () => {
    const offenders = []
    for (const file of pages) {
      const count = (cleaned.get(file).match(/<h1[\s>]/g) || []).length
      if (count > 1) offenders.push(`${relative(root, file)} has ${count}`)
    }
    expect(offenders).toEqual([])
  })
})

describe('a table never reports empty while it is still loading', () => {
  const pages = sourceFiles.filter((f) => extname(f) === '.jsx')

  /**
   * Every `<Table …>` opening tag in a file, whole. A fixed-width window is not
   * good enough: these tags carry inline `emptyState` and `errorState` elements
   * and run past any window you pick, so a truncated match reports a prop
   * missing that is simply further down. Track brace depth and stop at the `>`
   * that actually closes the tag.
   */
  function tableTags(text) {
    const found = []
    for (const m of text.matchAll(/<Table\b/g)) {
      let depth = 0
      for (let i = m.index; i < text.length; i += 1) {
        const ch = text[i]
        if (ch === '{') depth += 1
        else if (ch === '}') depth -= 1
        else if (ch === '>' && depth === 0 && text[i - 1] !== '=') {
          found.push(text.slice(m.index, i + 1))
          break
        }
      }
    }
    return found
  }

  it('the extractor reads a whole tag, so the next assertions mean something', () => {
    // Negative control: a fixed window would truncate this and wrongly report
    // errorState missing.
    const sample = `<Table state={s} emptyState={<EmptyState title="${'x'.repeat(3000)}" />} errorState={<E />} />`
    const [tag] = tableTags(sample)
    expect(tag).toContain('errorState=')
  })

  it('every Table call site passes an explicit state', () => {
    const offenders = []
    for (const file of pages) {
      for (const tag of tableTags(cleaned.get(file))) {
        if (!/\bstate=/.test(tag)) {
          offenders.push(`${relative(root, file)}: a <Table> with no state prop`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('every Table with a state also distinguishes error from empty', () => {
    const offenders = []
    for (const file of pages) {
      for (const tag of tableTags(cleaned.get(file))) {
        if (!/\bstate=/.test(tag)) continue
        if (!/\bemptyState=/.test(tag)) {
          offenders.push(`${relative(root, file)}: a <Table> with no emptyState`)
        }
        if (!/\berrorState=/.test(tag)) {
          offenders.push(`${relative(root, file)}: a <Table> with no errorState`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('the product table derives its state from one tested function', () => {
    // `DataTable` is this product's composition over the family `Table`: it adds
    // the client-side sorting the kit leaves to the caller, and it maps a fetch
    // result onto a state. It must not reimplement that precedence inline — the
    // whole defect was an inline `rows.length === 0` check winning over loading.
    const source = readFileSync(join(src, 'components', 'ui', 'DataTable.jsx'), 'utf8')
    expect(source).toMatch(/tableStateFrom\(\s*\{\s*loading\s*,\s*error\s*,\s*rowCount/)
    expect(source).not.toMatch(/rows\.length\s*\?\s*'ready'/)
  })

  it('no page hand-writes a bare table element', () => {
    // Two independent table implementations with different row heights and font
    // sizes is how the family ended up with four different table metrics.
    const offenders = []
    for (const [file, text] of cleaned) {
      if (/<table[\s>]/.test(text)) offenders.push(relative(root, file))
    }
    expect(offenders).toEqual([])
  })
})
