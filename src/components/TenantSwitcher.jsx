import React, { useState, useEffect, useRef } from 'react'
import { useTenant } from '../contexts/TenantContext'
import { FiChevronDown } from 'react-icons/fi'
import './TenantSwitcher.css'

function TenantSwitcher() {
  const {
    organizationId,
    projectId,
    organizations,
    projects,
    selectOrganization,
    selectProject,
  } = useTenant()
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false)
  const [projDropdownOpen, setProjDropdownOpen] = useState(false)
  const orgDropdownRef = useRef(null)
  const projDropdownRef = useRef(null)
  const orgButtonRef = useRef(null)
  const projButtonRef = useRef(null)

  const currentOrg = organizations.find((org) => org.org_id === organizationId)
  const currentProj = projects.find((proj) => proj.project_id === projectId)

  // Clean names to avoid duplication (e.g., if name is "Default Organization", show just "Default" with label "Organization:")
  const cleanOrgName = (name) => {
    if (!name || typeof name !== 'string') return name
    // Remove "Organization" suffix if present to avoid duplication with label
    if (name.toLowerCase().endsWith(' organization')) {
      return name.slice(0, -13).trim() || name
    }
    return name
  }

  const cleanProjName = (name) => {
    if (!name || typeof name !== 'string') return name
    // Remove "Project" suffix if present to avoid duplication with label
    if (name.toLowerCase().endsWith(' project')) {
      return name.slice(0, -8).trim() || name
    }
    return name
  }

  const getOrgDisplayName = () => {
    if (organizationId === 'all') {
      return 'All'
    }
    return cleanOrgName(currentOrg?.name || organizationId)
  }

  const getProjDisplayName = () => {
    if (projectId === 'all') {
      return 'All'
    }
    return cleanProjName(currentProj?.name || projectId)
  }

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      const target = event.target

      // Check if click is outside organization dropdown
      if (orgDropdownOpen) {
        const clickedOrgButton = orgButtonRef.current && (orgButtonRef.current === target || orgButtonRef.current.contains(target))
        const clickedOrgDropdown = orgDropdownRef.current && (orgDropdownRef.current === target || orgDropdownRef.current.contains(target))
        
        if (!clickedOrgButton && !clickedOrgDropdown) {
          setOrgDropdownOpen(false)
        }
      }

      // Check if click is outside project dropdown
      if (projDropdownOpen) {
        const clickedProjButton = projButtonRef.current && (projButtonRef.current === target || projButtonRef.current.contains(target))
        const clickedProjDropdown = projDropdownRef.current && (projDropdownRef.current === target || projDropdownRef.current.contains(target))
        
        if (!clickedProjButton && !clickedProjDropdown) {
          setProjDropdownOpen(false)
        }
      }
    }

    if (orgDropdownOpen || projDropdownOpen) {
      document.addEventListener('click', handleClickOutside)
      return () => {
        document.removeEventListener('click', handleClickOutside)
      }
    }
  }, [orgDropdownOpen, projDropdownOpen])

  return (
    <div className="tenant-switcher">
      <div className="tenant-selector">
        <label htmlFor="org-selector">Organization:</label>
        <div className="dropdown">
          <button
            ref={orgButtonRef}
            id="org-selector"
            className="dropdown-toggle"
            onClick={() => {
              setOrgDropdownOpen(!orgDropdownOpen)
              setProjDropdownOpen(false)
            }}
            aria-label={`Current organization: ${getOrgDisplayName()}`}
            aria-expanded={orgDropdownOpen}
            aria-haspopup="listbox"
          >
            <span className="dropdown-text">{getOrgDisplayName()}</span>
            <FiChevronDown />
          </button>
          {orgDropdownOpen && (
            <div ref={orgDropdownRef} className="dropdown-menu" role="listbox">
              <button
                key="all"
                role="option"
                aria-selected={organizationId === 'all'}
                className={organizationId === 'all' ? 'active' : ''}
                onClick={() => {
                  selectOrganization('all')
                  setOrgDropdownOpen(false)
                }}
              >
                All
              </button>
              {organizations
                .filter((org, index, self) => 
                  index === self.findIndex((o) => o.org_id === org.org_id)
                )
                .map((org) => (
                  <button
                    key={org.org_id}
                    role="option"
                    aria-selected={org.org_id === organizationId}
                    className={org.org_id === organizationId ? 'active' : ''}
                    onClick={() => {
                      selectOrganization(org.org_id)
                      setOrgDropdownOpen(false)
                    }}
                  >
                    {cleanOrgName(org.name)}
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>

      <div className="tenant-selector">
        <label htmlFor="project-selector">Project:</label>
        <div className="dropdown">
          <button
            ref={projButtonRef}
            id="project-selector"
            className="dropdown-toggle"
            onClick={() => {
              setProjDropdownOpen(!projDropdownOpen)
              setOrgDropdownOpen(false)
            }}
            aria-label={`Current project: ${getProjDisplayName()}`}
            aria-expanded={projDropdownOpen}
            aria-haspopup="listbox"
          >
            <span className="dropdown-text">{getProjDisplayName()}</span>
            <FiChevronDown />
          </button>
          {projDropdownOpen && (
            <div ref={projDropdownRef} className="dropdown-menu" role="listbox">
              <button
                key="all"
                role="option"
                aria-selected={projectId === 'all'}
                className={projectId === 'all' ? 'active' : ''}
                onClick={() => {
                  selectProject('all')
                  setProjDropdownOpen(false)
                }}
              >
                All
              </button>
              {projects
                .filter((proj, index, self) => 
                  index === self.findIndex((p) => p.project_id === proj.project_id)
                )
                .map((proj) => (
                  <button
                    key={proj.project_id}
                    role="option"
                    aria-selected={proj.project_id === projectId}
                    className={proj.project_id === projectId ? 'active' : ''}
                    onClick={() => {
                      selectProject(proj.project_id)
                      setProjDropdownOpen(false)
                    }}
                  >
                    {cleanProjName(proj.name)}
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default TenantSwitcher

