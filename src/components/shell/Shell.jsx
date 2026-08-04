import React, { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'
import {
  FiRefreshCw, FiSun, FiMoon, FiX, FiUser, FiLogOut, FiSettings,
} from 'react-icons/fi'
import {
  AppShell as FamilyShell, PageContent, Sidebar, TopBar, TopBarDivider,
  OrgSwitcher, SearchTrigger, UserMenu,
  Menu, MenuAnchor, MenuItem, MenuLabel, MenuSeparator, MenuHeader, useMenu,
  Button, Segmented, ToastProvider, useTheme, useSidebarCollapsed,
} from '@open-family/ui'

import { NAV_SECTIONS, OVERVIEW_ITEM } from '../../nav'
import { useI18n, LocaleSwitcher } from '../../contexts/I18nContext'
import { useTimeRange } from '../../contexts/TimeRangeContext'
import { useTenant } from '../../contexts/TenantContext'
import CommandPalette from './CommandPalette'
import OnboardingBanner from './OnboardingBanner'
import SavedViews from './SavedViews'
import FullscreenToggle from './FullscreenToggle'

const API = import.meta.env.VITE_API_URL || ''

function formatCustomLabel(fromMs, toMs) {
  const fmt = (ms) => {
    const d = new Date(ms)
    return `${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')}`
  }
  return `${fmt(fromMs)}–${fmt(toMs)} UTC`
}

/** Trim a trailing "Organization"/"Project" so the label does not say it twice. */
function cleanScopeName(name, suffix) {
  if (!name || typeof name !== 'string') return name
  const lower = name.toLowerCase()
  const tail = ` ${suffix}`
  if (lower.endsWith(tail)) return name.slice(0, -tail.length).trim() || name
  return name
}

/**
 * Organisation and project scope, as one switcher in the top bar.
 *
 * Previously two labelled dropdowns sat inline in the bar, which is what pushed
 * the control count past what a fixed-height bar could hold.
 */
function ScopeSwitcher() {
  const {
    organizationId, projectId, organizations, projects,
    selectOrganization, selectProject,
  } = useTenant()

  const orgs = useMemo(
    () => organizations.filter((o, i, all) => i === all.findIndex((x) => x.org_id === o.org_id)),
    [organizations]
  )
  const projs = useMemo(
    () => projects.filter((p, i, all) => i === all.findIndex((x) => x.project_id === p.project_id)),
    [projects]
  )

  const orgLabel = organizationId === 'all'
    ? 'All organisations'
    : cleanScopeName(orgs.find((o) => o.org_id === organizationId)?.name || organizationId, 'organization')
  const projLabel = projectId === 'all'
    ? 'All projects'
    : cleanScopeName(projs.find((p) => p.project_id === projectId)?.name || projectId, 'project')

  return (
    <OrgSwitcher contextLabel={orgLabel} value={projLabel} initials={orgLabel}>
      <MenuLabel>Organisation</MenuLabel>
      <MenuItem checked={organizationId === 'all'} onSelect={() => selectOrganization('all')}>
        All organisations
      </MenuItem>
      {orgs.map((org) => (
        <MenuItem
          key={org.org_id}
          checked={org.org_id === organizationId}
          onSelect={() => selectOrganization(org.org_id)}
        >
          {cleanScopeName(org.name, 'organization')}
        </MenuItem>
      ))}
      <MenuSeparator />
      <MenuLabel>Project</MenuLabel>
      <MenuItem checked={projectId === 'all'} onSelect={() => selectProject('all')}>
        All projects
      </MenuItem>
      {projs.map((proj) => (
        <MenuItem
          key={proj.project_id}
          checked={proj.project_id === projectId}
          onSelect={() => selectProject(proj.project_id)}
        >
          {cleanScopeName(proj.name, 'project')}
        </MenuItem>
      ))}
    </OrgSwitcher>
  )
}

/** Language picker, folded into a menu so it stops costing a top-bar slot. */
function LocaleMenu() {
  const menu = useMenu()
  const { t } = useI18n()
  return (
    <MenuAnchor>
      <button type="button" className="oui-usermenu" aria-label={t('nav.locale')} {...menu.triggerProps}>
        <LocaleSwitcher />
      </button>
      <Menu {...menu.menuProps} />
    </MenuAnchor>
  )
}

/**
 * The application chrome: grouped collapsible rail, a top bar that grows rather
 * than clips, and a centred content column.
 */
export default function Shell({ children }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { t } = useI18n()
  const { range, setRange, ranges, refresh, isCustom, fromMs, toMs, clearCustom } = useTimeRange()
  const { theme, setTheme, toggle, resolved } = useTheme('opa_theme')
  const [collapsed, toggleCollapsed] = useSidebarCollapsed('opa_rail_collapsed')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  const username = localStorage.getItem('username')
  const role = localStorage.getItem('role') || ''
  // An empty role means auth is off (local smoke runs); show everything then.
  const isAdmin = role === 'admin' || role === ''

  const sections = useMemo(
    () => NAV_SECTIONS.map((section) => ({
      id: section.id,
      label: t(section.labelKey),
      items: section.items.map((item) => ({
        to: item.to,
        label: t(item.labelKey),
        icon: React.createElement(item.icon),
        adminOnly: item.adminOnly,
      })),
    })),
    [t]
  )

  const overview = useMemo(
    () => ({
      to: OVERVIEW_ITEM.to,
      label: t(OVERVIEW_ITEM.labelKey),
      icon: React.createElement(OVERVIEW_ITEM.icon),
      exact: OVERVIEW_ITEM.exact,
    }),
    [t]
  )

  const logout = async () => {
    try { await axios.post(`${API}/api/auth/logout`) } catch { /* clear locally regardless */ }
    localStorage.removeItem('auth_token')
    localStorage.removeItem('username')
    localStorage.removeItem('role')
    window.location.assign('/login')
  }

  return (
    <ToastProvider>
      <FamilyShell
        sidebarOpen={drawerOpen}
        onCloseSidebar={() => setDrawerOpen(false)}
        sidebar={
          <Sidebar
            productCode="OPA"
            productName="Open Profiling Agent"
            overview={overview}
            sections={sections}
            pathname={pathname}
            onNavigate={(to) => { navigate(to); setDrawerOpen(false) }}
            collapsed={collapsed}
            onToggleCollapsed={toggleCollapsed}
            mobileOpen={drawerOpen}
            isAdmin={isAdmin}
          />
        }
        topBar={
          <TopBar
            onOpenSidebar={() => setDrawerOpen(true)}
            left={<ScopeSwitcher />}
            center={<SearchTrigger onOpen={() => setPaletteOpen(true)} />}
            right={
              <>
                {isCustom ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    iconAfter={<FiX />}
                    onClick={clearCustom}
                    title="Clear brush zoom"
                  >
                    {`Zoomed ${formatCustomLabel(fromMs, toMs)}`}
                  </Button>
                ) : (
                  <Segmented
                    aria-label="Time range"
                    value={range}
                    onChange={setRange}
                    items={ranges.map((r) => ({ value: r.value, label: r.label }))}
                  />
                )}
                <Button
                  variant="ghost"
                  aria-label="Refresh"
                  icon={<FiRefreshCw />}
                  onClick={refresh}
                />
                <SavedViews />
                <FullscreenToggle />
                <Button
                  variant="ghost"
                  aria-label="Toggle theme"
                  icon={resolved === 'dark' ? <FiSun /> : <FiMoon />}
                  onClick={toggle}
                />
                <LocaleMenu />
                <TopBarDivider />
                <UserMenu initials={(username || 'OPA').slice(0, 2)}>
                  {username ? <MenuHeader>{role ? `${username} · ${role}` : username}</MenuHeader> : null}
                  <MenuItem icon={<FiSettings />} onSelect={() => navigate('/settings/account')}>
                    Account and credentials
                  </MenuItem>
                  <MenuSeparator />
                  <MenuLabel>Appearance</MenuLabel>
                  <MenuItem checked={theme === 'light'} onSelect={() => setTheme('light')}>Light</MenuItem>
                  <MenuItem checked={theme === 'dark'} onSelect={() => setTheme('dark')}>Dark</MenuItem>
                  <MenuItem checked={theme === 'system'} onSelect={() => setTheme('system')}>
                    Match system
                  </MenuItem>
                  {username ? (
                    <>
                      <MenuSeparator />
                      <MenuItem icon={<FiLogOut />} danger onSelect={logout}>Log out</MenuItem>
                    </>
                  ) : null}
                </UserMenu>
              </>
            }
          />
        }
      >
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        <PageContent>
          <OnboardingBanner />
          {children}
        </PageContent>
      </FamilyShell>
    </ToastProvider>
  )
}
