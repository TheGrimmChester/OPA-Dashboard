import React, { useState } from 'react'
import SideRail from './SideRail'
import TopBar from './TopBar'

// App layout: collapsible left rail + sticky top bar + content outlet.
export default function AppShell({ children }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('opa_rail_collapsed') === '1')
  const toggle = () => setCollapsed((c) => { localStorage.setItem('opa_rail_collapsed', c ? '0' : '1'); return !c })
  return (
    <div className="opa-shell">
      <SideRail collapsed={collapsed} onToggle={toggle} />
      <div className="opa-main">
        <TopBar />
        <div className="opa-content">{children}</div>
      </div>
    </div>
  )
}
