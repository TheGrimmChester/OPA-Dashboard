import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import axios from 'axios'
import { projectScopeHeaders } from '@open-family/ui'

import {
  ALL,
  isMutatingMethod,
  isProjectDirectoryRequest,
  persistProjectSelection,
  projectIdFromSelection,
  readProjectSelection,
  tenantScopeKey,
} from '../utils/projectScope'

const API_URL = import.meta.env.VITE_API_URL || ''
const SELECTION_KEY = 'project_selection'
const PROJECT_KEY = 'project_id'

export { ALL }

// One-time migration: "default-org"/"default-project" used to BE the
// "nothing selected" sentinel. Reset that exact pair to UI All — once.
const MIGRATED_KEY = 'tenant_picker_default_to_all_v1'
if (!localStorage.getItem(MIGRATED_KEY)) {
  const storedOrg = localStorage.getItem('organization_id')
  const storedProj = localStorage.getItem(PROJECT_KEY)
  if ((!storedOrg || storedOrg === 'default-org') && (!storedProj || storedProj === 'default-project')) {
    localStorage.setItem('organization_id', ALL)
    persistProjectSelection(SELECTION_KEY, PROJECT_KEY, ALL)
  } else if (storedProj && storedProj !== ALL && !localStorage.getItem(SELECTION_KEY)) {
    persistProjectSelection(SELECTION_KEY, PROJECT_KEY, [storedProj])
  }
  localStorage.setItem(MIGRATED_KEY, '1')
}

const tenantHeaders = {
  organizationId: localStorage.getItem('organization_id') || ALL,
  selection: readProjectSelection(SELECTION_KEY, PROJECT_KEY),
  enabledProjectIds: [],
}

function stampTenant(config) {
  config.headers = config.headers || {}
  delete config.headers['X-Project-ID']
  delete config.headers['X-Project-IDs']
  delete config.headers['X-Organization-ID']

  if (tenantHeaders.organizationId) {
    config.headers['X-Organization-ID'] = tenantHeaders.organizationId
  }

  const url = config.url || ''
  if (isProjectDirectoryRequest(url)) return

  if (isMutatingMethod(config.method)) {
    if (
      tenantHeaders.selection !== ALL
      && Array.isArray(tenantHeaders.selection)
      && tenantHeaders.selection.length === 1
    ) {
      config.headers['X-Project-ID'] = tenantHeaders.selection[0]
    }
    return
  }

  if (
    tenantHeaders.selection === ALL
    && (!tenantHeaders.enabledProjectIds || tenantHeaders.enabledProjectIds.length === 0)
  ) {
    return
  }

  Object.assign(
    config.headers,
    projectScopeHeaders(tenantHeaders.selection, tenantHeaders.enabledProjectIds),
  )
}

axios.interceptors.request.use((config) => {
  stampTenant(config)
  return config
})

function projectRowId(p) {
  return String(p.project_id || p.id || '')
}

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
  const [selection, setSelectionState] = useState(() => readProjectSelection(SELECTION_KEY, PROJECT_KEY))
  const [organizations, setOrganizations] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(false)

  const projectId = projectIdFromSelection(selection)
  const scopeKey = useMemo(
    () => tenantScopeKey(organizationId, selection),
    [organizationId, selection],
  )

  useEffect(() => {
    loadOrganizations()
  }, [])

  useEffect(() => {
    loadProjects(organizationId)
  }, [organizationId])

  const loadOrganizations = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('auth_token')
      const response = await axios.get(`${API_URL}/api/organizations`, {
        headers: { Authorization: `Bearer ${token}` },
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
      const org = orgId || organizationId
      const params = new URLSearchParams({ product: 'opa' })
      if (org && org !== ALL) params.set('organization_id', org)
      // OAM directory proxy (may be missing until proxies land — wire client path anyway).
      const response = await axios.get(`${API_URL}/api/oam/projects?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const fetchedProjects = response.data.projects || []
      setProjects(fetchedProjects)
      const ids = fetchedProjects.map(projectRowId).filter(Boolean)
      tenantHeaders.enabledProjectIds = ids
      return fetchedProjects
    } catch (error) {
      console.error('Failed to load projects:', error)
      setProjects([])
      tenantHeaders.enabledProjectIds = []
      return []
    }
  }

  const selectOrganization = (orgId) => {
    setOrganizationId(orgId)
    localStorage.setItem('organization_id', orgId)
    const saved = persistProjectSelection(SELECTION_KEY, PROJECT_KEY, ALL)
    tenantHeaders.selection = saved
    setSelectionState(saved)
  }

  const setProjectSelection = useCallback((next) => {
    const saved = persistProjectSelection(SELECTION_KEY, PROJECT_KEY, next)
    tenantHeaders.selection = saved
    setSelectionState(saved)
  }, [])

  const selectProject = useCallback((projId) => {
    setProjectSelection(!projId || projId === ALL ? ALL : [String(projId)])
  }, [setProjectSelection])

  tenantHeaders.organizationId = organizationId
  tenantHeaders.selection = selection

  const value = useMemo(() => ({
    organizationId,
    projectId,
    selection,
    scopeKey,
    setProjectSelection,
    organizations,
    projects,
    loading,
    selectOrganization,
    selectProject,
    loadOrganizations,
    loadProjects,
    hasConcreteProject: selection !== ALL && selection.length === 1,
  }), [
    organizationId, projectId, selection, scopeKey, setProjectSelection, organizations, projects,
    loading, selectOrganization, selectProject,
  ])

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
}
