import React, { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || ''

// "all" is the unscoped selection and the default one: nothing is filtered until
// the user picks a concrete org/project. It is NOT a stand-in for the
// "default-org"/"default-project" tenant, which is a real org/project you can
// select like any other.
const ALL = 'all'

// One-time migration: "default-org"/"default-project" used to BE the
// "nothing selected" sentinel. It is now an ordinary org/project, so a pair
// persisted before this change would silently scope the dashboard to it. Reset
// that exact pair to "All" — once, keyed on a flag, so deliberately selecting
// Default Organization afterwards still sticks.
const MIGRATED_KEY = 'tenant_picker_default_to_all_v1'
if (!localStorage.getItem(MIGRATED_KEY)) {
  const storedOrg = localStorage.getItem('organization_id')
  const storedProj = localStorage.getItem('project_id')
  if ((!storedOrg || storedOrg === 'default-org') && (!storedProj || storedProj === 'default-project')) {
    localStorage.setItem('organization_id', ALL)
    localStorage.setItem('project_id', ALL)
  }
  localStorage.setItem(MIGRATED_KEY, '1')
}

// Live tenant selection, read by the axios interceptor below. Kept outside React
// state so the interceptor always sees the current values: an interceptor
// registered from an effect would still carry the previous tenant when a child's
// effect fires its refetch (child effects run before the provider's).
const tenantHeaders = {
  organizationId: localStorage.getItem('organization_id') || ALL,
  projectId: localStorage.getItem('project_id') || ALL,
}

// Registered once, at import time, so requests fired by the very first render
// already carry the tenant headers.
axios.interceptors.request.use((config) => {
  // "all" is sent explicitly — the backend reads it as "do not filter this
  // dimension", per dimension, so org=X + project=all filters on the org alone.
  if (tenantHeaders.organizationId) config.headers['X-Organization-ID'] = tenantHeaders.organizationId
  if (tenantHeaders.projectId) config.headers['X-Project-ID'] = tenantHeaders.projectId
  return config
})

const TenantContext = createContext()

export const useTenant = () => {
  const context = useContext(TenantContext)
  if (!context) {
    throw new Error('useTenant must be used within TenantProvider')
  }
  return context
}

export const TenantProvider = ({ children }) => {
  const [organizationId, setOrganizationId] = useState(() => {
    return localStorage.getItem('organization_id') || ALL
  })
  const [projectId, setProjectId] = useState(() => {
    return localStorage.getItem('project_id') || ALL
  })
  const [organizations, setOrganizations] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(false)

  // Load organizations on mount. Projects come from the effect below, which
  // already runs on mount — calling it here too would double-fetch.
  useEffect(() => {
    loadOrganizations()
  }, [])

  // Update the project menu when the organization changes. With the org on "All"
  // this lists projects across every org, so a project is still selectable.
  useEffect(() => {
    loadProjects(organizationId)
  }, [organizationId])

  // `loading` is part of the context value, so it has to actually track the
  // in-flight fetches — it was exposed but never set, leaving every consumer to
  // read a permanent false.
  const loadOrganizations = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('auth_token')
      const response = await axios.get(`${API_URL}/api/organizations`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      setOrganizations(response.data.organizations || [])
    } catch (error) {
      console.error('Failed to load organizations:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadProjects = async (orgId = null) => {
    try {
      const token = localStorage.getItem('auth_token')
      // Org ids are base64 (URL alphabet + "=" padding), so encode them.
      const org = orgId || organizationId
      const response = await axios.get(`${API_URL}/api/projects?organization_id=${encodeURIComponent(org)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      const fetchedProjects = response.data.projects || []
      setProjects(fetchedProjects)
      return fetchedProjects
    } catch (error) {
      console.error('Failed to load projects:', error)
      return []
    }
  }

  const selectOrganization = (orgId) => {
    setOrganizationId(orgId)
    localStorage.setItem('organization_id', orgId)
    // Switching org always resets the project to "All": the previous project
    // belongs to the old org, and "all of the new org" is the only selection
    // that is meaningful without knowing its project list yet. The effect above
    // reloads the project menu for the new org.
    setProjectId(ALL)
    localStorage.setItem('project_id', ALL)
  }

  const selectProject = (projId) => {
    setProjectId(projId)
    localStorage.setItem('project_id', projId)
  }

  // Publish the selection to the interceptor synchronously, during render, so a
  // child that refetches on this same commit sends the new tenant.
  tenantHeaders.organizationId = organizationId
  tenantHeaders.projectId = projectId

  const value = {
    organizationId,
    projectId,
    organizations,
    projects,
    loading,
    selectOrganization,
    selectProject,
    loadOrganizations,
    loadProjects,
  }

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
}

