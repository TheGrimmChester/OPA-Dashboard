import React, { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || ''

// Live tenant selection, read by the axios interceptor below. Kept outside React
// state so the interceptor always sees the current values: an interceptor
// registered from an effect would still carry the previous tenant when a child's
// effect fires its refetch (child effects run before the provider's).
const tenantHeaders = {
  organizationId: localStorage.getItem('organization_id') || 'default-org',
  projectId: localStorage.getItem('project_id') || 'default-project',
}

// Registered once, at import time, so requests fired by the very first render
// already carry the tenant headers.
axios.interceptors.request.use((config) => {
  // "all" is sent explicitly — the backend reads it as "do not filter".
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
    return localStorage.getItem('organization_id') || 'default-org'
  })
  const [projectId, setProjectId] = useState(() => {
    return localStorage.getItem('project_id') || 'default-project'
  })
  const [organizations, setOrganizations] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(false)

  // Load organizations and projects on mount
  useEffect(() => {
    loadOrganizations()
    loadProjects()
  }, [])

  // Update projects when organization changes
  useEffect(() => {
    if (organizationId) {
      loadProjects(organizationId)
    }
  }, [organizationId])

  const loadOrganizations = async () => {
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
    }
  }

  const loadProjects = async (orgId = null) => {
    try {
      const token = localStorage.getItem('auth_token')
      const org = orgId || organizationId
      const response = await axios.get(`${API_URL}/api/projects?organization_id=${org}`, {
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

  const selectOrganization = async (orgId) => {
    setOrganizationId(orgId)
    localStorage.setItem('organization_id', orgId)
    // If "all" is selected, also set project to "all"
    if (orgId === 'all') {
      setProjectId('all')
      localStorage.setItem('project_id', 'all')
    } else {
      // Reset project to first project in new org
      const newProjects = await loadProjects(orgId)
      if (newProjects.length > 0) {
        setProjectId(newProjects[0].project_id)
        localStorage.setItem('project_id', newProjects[0].project_id)
      } else {
        // If no projects, set to "all"
        setProjectId('all')
        localStorage.setItem('project_id', 'all')
      }
    }
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

