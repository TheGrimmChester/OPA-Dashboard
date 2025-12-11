import React, { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || ''

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
      setProjects(response.data.projects || [])
    } catch (error) {
      console.error('Failed to load projects:', error)
    }
  }

  const selectOrganization = (orgId) => {
    setOrganizationId(orgId)
    localStorage.setItem('organization_id', orgId)
    // If "all" is selected, also set project to "all"
    if (orgId === 'all') {
      setProjectId('all')
      localStorage.setItem('project_id', 'all')
    } else {
      // Reset project to first project in new org
      loadProjects(orgId).then(() => {
        if (projects.length > 0) {
          setProjectId(projects[0].project_id)
          localStorage.setItem('project_id', projects[0].project_id)
        } else {
          // If no projects, set to "all"
          setProjectId('all')
          localStorage.setItem('project_id', 'all')
        }
      })
    }
  }

  const selectProject = (projId) => {
    setProjectId(projId)
    localStorage.setItem('project_id', projId)
  }

  // Update axios interceptor to include tenant headers
  useEffect(() => {
    const interceptor = axios.interceptors.request.use((config) => {
      // Send "all" explicitly so backend knows to return all data
      // Backend expects "all" in header to indicate no filtering
      if (organizationId) {
        config.headers['X-Organization-ID'] = organizationId
      }
      if (projectId) {
        config.headers['X-Project-ID'] = projectId
      }
      return config
    })

    return () => {
      axios.interceptors.request.eject(interceptor)
    }
  }, [organizationId, projectId])

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

