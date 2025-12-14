import React, { useEffect, useRef, useCallback, useMemo, useState } from 'react'
import { FiX, FiSearch, FiAlertCircle, FiCheckCircle, FiFilter, FiHash, FiType, FiClock, FiTag } from 'react-icons/fi'
import { parseFilterQuery, validateFilterQuery, removeFilterCondition, extractChipsWithPositions } from '../utils/filterParser'
import { getFilterKeySuggestions, getFilterValueSuggestions } from '../services/filterApi'
import './FilterBuilder.css'

// Type-aware operator definitions with icons
const OPERATORS_BY_TYPE = {
  string: [
    { value: ':', label: 'equals', symbol: ':', operator: 'EQUALS', description: 'Exact match', icon: '=' },
    { value: ':!=', label: 'not equals', symbol: '!=', operator: 'NOT_EQUALS', description: 'Exclude value', icon: '≠' },
    { value: ':LIKE', label: 'like', symbol: 'LIKE', operator: 'LIKE', description: 'Pattern matching', icon: '~' },
    { value: ':IN', label: 'in', symbol: 'IN', operator: 'IN', description: 'Match any in list', icon: '∈' },
    { value: ':NOT IN', label: 'not in', symbol: 'NOT IN', operator: 'NOT_IN', description: 'Exclude list', icon: '∉' },
    { value: ':NOT LIKE', label: 'not like', symbol: 'NOT LIKE', operator: 'NOT_LIKE', description: 'Exclude pattern', icon: '≁' },
  ],
  number: [
    { value: ':', label: 'equals', symbol: ':', operator: 'EQUALS', description: 'Exact match', icon: '=' },
    { value: ':!=', label: 'not equals', symbol: '!=', operator: 'NOT_EQUALS', description: 'Exclude value', icon: '≠' },
    { value: ':>', label: 'greater than', symbol: '>', operator: 'GREATER_THAN', description: 'Numeric comparison', icon: '>' },
    { value: ':<', label: 'less than', symbol: '<', operator: 'LESS_THAN', description: 'Numeric comparison', icon: '<' },
    { value: ':>=', label: 'greater or equal', symbol: '>=', operator: 'GREATER_THAN_OR_EQUAL', description: 'Numeric comparison', icon: '≥' },
    { value: ':<=', label: 'less or equal', symbol: '<=', operator: 'LESS_THAN_OR_EQUAL', description: 'Numeric comparison', icon: '≤' },
    { value: ':IN', label: 'in', symbol: 'IN', operator: 'IN', description: 'Match any in list', icon: '∈' },
    { value: ':NOT IN', label: 'not in', symbol: 'NOT IN', operator: 'NOT_IN', description: 'Exclude list', icon: '∉' },
  ],
  datetime: [
    { value: ':', label: 'equals', symbol: ':', operator: 'EQUALS', description: 'Exact match', icon: '=' },
    { value: ':!=', label: 'not equals', symbol: '!=', operator: 'NOT_EQUALS', description: 'Exclude value', icon: '≠' },
    { value: ':>', label: 'greater than', symbol: '>', operator: 'GREATER_THAN', description: 'After date/time', icon: '>' },
    { value: ':<', label: 'less than', symbol: '<', operator: 'LESS_THAN', description: 'Before date/time', icon: '<' },
    { value: ':>=', label: 'greater or equal', symbol: '>=', operator: 'GREATER_THAN_OR_EQUAL', description: 'On or after', icon: '≥' },
    { value: ':<=', label: 'less or equal', symbol: '<=', operator: 'LESS_THAN_OR_EQUAL', description: 'On or before', icon: '≤' },
    { value: ':IN', label: 'in', symbol: 'IN', operator: 'IN', description: 'Match any in list', icon: '∈' },
    { value: ':NOT IN', label: 'not in', symbol: 'NOT IN', operator: 'NOT_IN', description: 'Exclude list', icon: '∉' },
  ],
  boolean: [
    { value: ':', label: 'equals', symbol: ':', operator: 'EQUALS', description: 'Exact match', icon: '=' },
    { value: ':!=', label: 'not equals', symbol: '!=', operator: 'NOT_EQUALS', description: 'Exclude value', icon: '≠' },
  ],
}

// Default operators when field type is unknown
const DEFAULT_OPERATORS = OPERATORS_BY_TYPE.string

// Type icons mapping
const TYPE_ICONS = {
  string: FiType,
  number: FiHash,
  datetime: FiClock,
  boolean: FiTag,
}

// Query examples for help
const QUERY_EXAMPLES = [
  { query: 'service:api', label: 'Filter by service' },
  { query: 'status:error', label: 'Find errors' },
  { query: 'duration_ms:>1000', label: 'Slow requests' },
  { query: 'service:api AND status:200', label: 'Successful API calls' },
]

/**
 * Analyze query context to determine current input state
 */
function analyzeContext(query, cursorPosition) {
  const beforeCursor = query.substring(0, cursorPosition)
  const afterCursor = query.substring(cursorPosition)
  
  // Check if we're in a value context (after operator)
  const valueMatch = beforeCursor.match(/([a-zA-Z_][a-zA-Z0-9_.]+)\s*([:=<>!]+|:LIKE|:IN|:NOT\s+IN|:NOT\s+LIKE)\s*(.*)$/)
  if (valueMatch) {
    const field = valueMatch[1]
    const operator = valueMatch[2]
    const rawValue = valueMatch[3] || ''
    
    if (rawValue.trim().length > 0 || operator === ':') {
      const valuePrefix = rawValue.replace(/^\s+/, '')
      const quoteMatch = rawValue.match(/^(["'])(.*)$/)
      const inQuotes = quoteMatch !== null
      
      return {
        type: 'value',
        field,
        operator,
        valuePrefix: inQuotes ? quoteMatch[2] : valuePrefix,
        inQuotes,
        quoteChar: inQuotes ? quoteMatch[1] : null,
      }
    }
  }
  
  // Check if we're after field name with space, ready for operator
  const operatorMatch = beforeCursor.match(/([a-zA-Z_][a-zA-Z0-9_.]+)\s+$/)
  if (operatorMatch && !afterCursor.match(/^[:=<>!]/)) {
    return {
      type: 'operator',
      field: operatorMatch[1],
    }
  }
  
  // Check if we're typing an operator after field
  const operatorPrefixMatch = beforeCursor.match(/([a-zA-Z_][a-zA-Z0-9_.]+)\s*(:>|:<|:>=|:<=|:!=|:LIKE|:IN|:NOT\s+IN|:NOT\s+LIKE)$/)
  if (operatorPrefixMatch) {
    return {
      type: 'operator',
      field: operatorPrefixMatch[1],
      operatorPrefix: operatorPrefixMatch[2],
    }
  }
  
  // Check if we're after field and operator with space, ready for value
  const operatorSpaceMatch = beforeCursor.match(/([a-zA-Z_][a-zA-Z0-9_.]+)\s*([:=<>!]+|:LIKE|:IN|:NOT\s+IN|:NOT\s+LIKE)\s+$/)
  if (operatorSpaceMatch) {
    return {
      type: 'value',
      field: operatorSpaceMatch[1],
      operator: operatorSpaceMatch[2],
      valuePrefix: '',
      inQuotes: false,
    }
  }
  
  // We're typing a field name
  const words = beforeCursor.split(/\s+/)
  const lastWord = words[words.length - 1] || ''
  const isAfterLogicalOp = /(AND|OR|NOT|\(|\s+)$/i.test(beforeCursor.trim())
  const fieldPrefixMatch = lastWord.match(/^([a-zA-Z_][a-zA-Z0-9_.]*)$/)
  const fieldPrefix = fieldPrefixMatch ? fieldPrefixMatch[1] : (isAfterLogicalOp ? '' : lastWord)
  
  return {
    type: 'field',
    fieldPrefix,
  }
}

/**
 * Get operators for a given field type
 */
function getOperatorsForType(fieldType) {
  if (!fieldType) return DEFAULT_OPERATORS
  const normalizedType = fieldType.toLowerCase()
  return OPERATORS_BY_TYPE[normalizedType] || DEFAULT_OPERATORS
}

// Standard filter fields configuration
const STANDARD_FILTER_FIELDS = [
  { key: 'service', label: 'Service', type: 'string' },
  { key: 'status', label: 'Status', type: 'string' },
  { key: 'language', label: 'Language', type: 'string' },
  { key: 'framework', label: 'Framework', type: 'string' },
  { key: 'http.method', label: 'HTTP Method', type: 'string' },
  { key: 'http.status_code', label: 'HTTP Status', type: 'number' },
]

/**
 * Extract field values from a parsed filter query AST
 */
function extractFieldValuesFromAST(ast, targetFields) {
  const values = {}
  targetFields.forEach(field => {
    values[field.key] = ''
  })
  
  if (!ast) return values
  
  const traverse = (node) => {
    if (!node) return
    
    if (node.type === 'comparison' && node.operator === 'EQUALS') {
      const fieldKey = node.field
      if (targetFields.find(f => f.key === fieldKey)) {
        // Extract string or number values, not arrays or complex operators
        if (typeof node.value === 'string' || typeof node.value === 'number') {
          values[fieldKey] = String(node.value)
        }
      }
    } else if (node.type === 'logical') {
      if (node.left) traverse(node.left)
      if (node.right) traverse(node.right)
      if (node.operand) traverse(node.operand)
    }
  }
  
  traverse(ast)
  return values
}

/**
 * Build filter query string from dropdown values
 */
function buildQueryFromValues(values) {
  const conditions = []
  
  Object.entries(values).forEach(([field, value]) => {
    if (value && value.trim() !== '') {
      // Escape value if it contains spaces or special characters
      const needsQuotes = value.includes(' ') || value.includes(':') || value.includes('-')
      const escapedValue = needsQuotes ? `"${value}"` : value
      conditions.push(`${field}:${escapedValue}`)
    }
  })
  
  return conditions.join(' AND ')
}

function FilterBuilder({ value = '', onChange, placeholder = 'Search and filter...' }) {
  // State for dropdown values
  const [dropdownValues, setDropdownValues] = useState(() => {
    const initial = {}
    STANDARD_FILTER_FIELDS.forEach(field => {
      initial[field.key] = ''
    })
    return initial
  })
  
  // State for dropdown options
  const [dropdownOptions, setDropdownOptions] = useState(() => {
    const initial = {}
    STANDARD_FILTER_FIELDS.forEach(field => {
      initial[field.key] = []
    })
    return initial
  })
  
  // Loading states for dropdowns
  const [dropdownLoading, setDropdownLoading] = useState(() => {
    const initial = {}
    STANDARD_FILTER_FIELDS.forEach(field => {
      initial[field.key] = false
    })
    return initial
  })
  
  // State
  const [query, setQuery] = useState(value)
  const [cursorPosition, setCursorPosition] = useState(0)
  const [context, setContext] = useState({ type: 'field' })
  const [suggestions, setSuggestions] = useState({
    type: null,
    items: [],
    loading: false,
    selectedIndex: -1,
  })
  const [fieldMetadata, setFieldMetadata] = useState(new Map())
  const [validationError, setValidationError] = useState(null)
  const [isFocused, setIsFocused] = useState(false)
  const [showExamples, setShowExamples] = useState(false)
  const [editingChipIndex, setEditingChipIndex] = useState(null)
  const [chipPositions, setChipPositions] = useState([])
  
  // Refs
  const inputRef = useRef(null)
  const suggestionsRef = useRef(null)
  const containerRef = useRef(null)
  const chipsContainerRef = useRef(null)
  const abortControllerRef = useRef(null)
  const debouncedLoadKeysRef = useRef(null)
  const debouncedLoadValuesRef = useRef(null)
  const fieldMetadataRef = useRef(new Map())
  const debouncedQueryChangeRef = useRef(null)
  
  // Parse incoming query and populate dropdowns
  // Use a ref to track the last processed query to avoid loops
  const lastProcessedQueryRef = useRef('')
  
  useEffect(() => {
    // Skip if this is the same query we just generated ourselves
    if (value === lastProcessedQueryRef.current) {
      return
    }
    
    if (value && value.trim() !== '') {
      try {
        const ast = parseFilterQuery(value)
        if (ast) {
          const extracted = extractFieldValuesFromAST(ast, STANDARD_FILTER_FIELDS)
          // Only update if values actually changed to prevent loops
          setDropdownValues(prev => {
            const changed = STANDARD_FILTER_FIELDS.some(field => 
              prev[field.key] !== extracted[field.key]
            )
            if (changed) {
              lastProcessedQueryRef.current = value
              return extracted
            }
            return prev
          })
        }
      } catch (error) {
        // If parsing fails, don't update dropdowns - might be complex query
        console.debug('Could not parse query for dropdowns:', error)
      }
    } else {
      // Clear all dropdowns when query is empty
      setDropdownValues(prev => {
        const hasValues = STANDARD_FILTER_FIELDS.some(field => prev[field.key] && prev[field.key].trim() !== '')
        if (!hasValues) return prev // Already clear, no need to update
        
        lastProcessedQueryRef.current = value
        const cleared = {}
        STANDARD_FILTER_FIELDS.forEach(field => {
          cleared[field.key] = ''
        })
        return cleared
      })
    }
  }, [value])
  
  // Load dropdown options on mount
  useEffect(() => {
    const loadOptions = async () => {
      for (const field of STANDARD_FILTER_FIELDS) {
        setDropdownLoading(prev => ({ ...prev, [field.key]: true }))
        try {
          const options = await getFilterValueSuggestions(field.key, '', 100)
          setDropdownOptions(prev => ({ ...prev, [field.key]: options }))
        } catch (error) {
          console.error(`Error loading options for ${field.key}:`, error)
          setDropdownOptions(prev => ({ ...prev, [field.key]: [] }))
        } finally {
          setDropdownLoading(prev => ({ ...prev, [field.key]: false }))
        }
      }
    }
    
    loadOptions()
  }, [])
  
  // Handle dropdown value change
  const handleDropdownChange = useCallback((fieldKey, newValue) => {
    setDropdownValues(prev => {
      const updated = { ...prev, [fieldKey]: newValue }
      // Build query from updated values
      const newQuery = buildQueryFromValues(updated)
      setQuery(newQuery)
      // Mark this query as one we generated to avoid parsing it back
      lastProcessedQueryRef.current = newQuery
      // Call onChange with new query
      if (onChange) {
        onChange(newQuery)
      }
      return updated
    })
  }, [onChange])
  
  // Clear all dropdowns
  const handleClearAll = useCallback(() => {
    const cleared = {}
    STANDARD_FILTER_FIELDS.forEach(field => {
      cleared[field.key] = ''
    })
    setDropdownValues(cleared)
    setQuery('')
    lastProcessedQueryRef.current = ''
    if (onChange) {
      onChange('')
    }
  }, [onChange])
  
  // Update context when query or cursor changes
  useEffect(() => {
    const newContext = analyzeContext(query, cursorPosition)
    setContext(prev => {
      if (prev.type !== newContext.type ||
          prev.field !== newContext.field ||
          prev.fieldPrefix !== newContext.fieldPrefix ||
          prev.operator !== newContext.operator ||
          prev.valuePrefix !== newContext.valuePrefix) {
        return newContext
      }
      return prev
    })
  }, [query, cursorPosition])
  
  // Update fieldMetadata ref when state changes
  useEffect(() => {
    fieldMetadataRef.current = fieldMetadata
  }, [fieldMetadata])
  
  // Load key suggestions
  const loadKeySuggestions = useCallback(async (prefix = '') => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()
    
    setSuggestions(prev => ({ ...prev, type: 'key', loading: true, items: [] }))
    
    try {
      const suggestions = await getFilterKeySuggestions(prefix)
      
      if (!abortControllerRef.current?.signal.aborted) {
        const newMetadata = new Map(fieldMetadataRef.current)
        suggestions.forEach(item => {
          if (item.key && item.type) {
            newMetadata.set(item.key, { type: item.type, category: item.category })
          }
        })
        setFieldMetadata(newMetadata)
        
        setSuggestions(prev => ({
          ...prev,
          items: suggestions,
          loading: false,
          selectedIndex: -1,
        }))
      }
    } catch (error) {
      if (error.name !== 'AbortError' && !abortControllerRef.current?.signal.aborted) {
        console.error('Error loading key suggestions:', error)
        setSuggestions(prev => ({ ...prev, loading: false, items: [] }))
      }
    }
  }, [])
  
  // Load value suggestions
  const loadValueSuggestions = useCallback(async (field, prefix = '') => {
    if (!field) {
      setSuggestions(prev => ({ ...prev, type: null, loading: false, items: [] }))
      return
    }
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()
    
    const trimmedPrefix = (prefix || '').trim()
    setSuggestions(prev => ({ ...prev, type: 'value', loading: true, items: [] }))
    
    if (debouncedLoadValuesRef.current) {
      clearTimeout(debouncedLoadValuesRef.current)
    }
    
    const debounceTime = trimmedPrefix.length > 0 ? 150 : 200
    
    debouncedLoadValuesRef.current = setTimeout(async () => {
      try {
        const suggestions = await getFilterValueSuggestions(field, trimmedPrefix, 50)
        
        if (!abortControllerRef.current?.signal.aborted) {
          setSuggestions(prev => ({
            ...prev,
            type: 'value',
            items: suggestions,
            loading: false,
            selectedIndex: -1,
          }))
        }
      } catch (error) {
        if (error.name !== 'AbortError' && !abortControllerRef.current?.signal.aborted) {
          console.error('Error loading value suggestions:', error)
          setSuggestions(prev => ({ ...prev, type: 'value', loading: false, items: [] }))
        }
      }
      debouncedLoadValuesRef.current = null
    }, debounceTime)
  }, [])
  
  // Load suggestions based on context
  useEffect(() => {
    if (!isFocused) {
      return
    }
    
    const cleanup = () => {
      if (debouncedLoadKeysRef.current) {
        clearTimeout(debouncedLoadKeysRef.current)
        debouncedLoadKeysRef.current = null
      }
    }
    
    if (context.type !== 'field' && debouncedLoadKeysRef.current) {
      cleanup()
    }
    
    if (context.type === 'field') {
      const prefix = context.fieldPrefix || ''
      if (debouncedLoadKeysRef.current) {
        clearTimeout(debouncedLoadKeysRef.current)
      }
      debouncedLoadKeysRef.current = setTimeout(() => {
        loadKeySuggestions(prefix)
      }, 150)
    } else if (context.type === 'operator') {
      cleanup()
      const fieldType = fieldMetadataRef.current.get(context.field)?.type || null
      const operators = getOperatorsForType(fieldType)
      setSuggestions(prev => {
        if (prev.type === 'operator' && prev.items.length === operators.length) {
          const itemsSame = prev.items.every((item, i) => item.value === operators[i].value)
          if (itemsSame) return prev
        }
        return {
          type: 'operator',
          items: operators,
          loading: false,
          selectedIndex: -1,
        }
      })
    } else if (context.type === 'value') {
      cleanup()
      if (context.field) {
        loadValueSuggestions(context.field, context.valuePrefix || '')
      }
    }
    
    return cleanup
  }, [context.type, context.field, context.fieldPrefix, context.valuePrefix, isFocused, loadKeySuggestions, loadValueSuggestions])
  
  // Normalize filter query
  const normalizeFilterQuery = useCallback((queryString) => {
    if (!queryString || queryString.trim() === '') {
      return queryString
    }
    
    let normalized = queryString
    normalized = normalized.replace(/([a-zA-Z_][a-zA-Z0-9_.]+)\s*:\s*/g, '$1:')
    normalized = normalized.replace(/([a-zA-Z_][a-zA-Z0-9_.]+)\s*(:>|:<|:>=|:<=|:!=)\s*/g, '$1$2')
    normalized = normalized.replace(/([a-zA-Z_][a-zA-Z0-9_.]+)\s*(:LIKE|:IN|:NOT\s+IN|:NOT\s+LIKE)\s+/gi, '$1$2 ')
    normalized = normalized.replace(/\s+/g, ' ').trim()
    
    return normalized
  }, [])
  
  // Validate query and debounce onChange
  useEffect(() => {
    if (debouncedQueryChangeRef.current) {
      clearTimeout(debouncedQueryChangeRef.current)
      debouncedQueryChangeRef.current = null
    }
    
    if (query.trim() === '') {
      setValidationError(null)
      onChange && onChange('')
      return
    }
    
    const trimmedQuery = query.trim()
    const looksIncomplete = 
      /[:=<>!]\s*$/.test(trimmedQuery) ||
      /\s+(AND|OR|NOT)\s*$/i.test(trimmedQuery) ||
      /^[a-zA-Z_][a-zA-Z0-9_.]*\s+$/.test(trimmedQuery) ||
      (trimmedQuery && !trimmedQuery.match(/[:=<>!]/) && /^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(trimmedQuery))
    
    if (looksIncomplete) {
      setValidationError(null)
      return
    }
    
    const validation = validateFilterQuery(query)
    if (validation.valid) {
      setValidationError(null)
      debouncedQueryChangeRef.current = setTimeout(() => {
        const normalizedQuery = normalizeFilterQuery(query)
        onChange && onChange(normalizedQuery)
        debouncedQueryChangeRef.current = null
      }, 300)
    } else {
      if (validation.error && validation.error.includes('EOF') && looksIncomplete) {
        setValidationError(null)
      } else {
        setValidationError(validation.error)
      }
    }
    
    return () => {
      if (debouncedQueryChangeRef.current) {
        clearTimeout(debouncedQueryChangeRef.current)
        debouncedQueryChangeRef.current = null
      }
    }
  }, [query, onChange, normalizeFilterQuery])
  
  // Keyboard shortcut: Cmd/Ctrl+K to focus
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])
  
  // Handle input change
  const handleInputChange = useCallback((e) => {
    const newQuery = e.target.value
    const newCursorPosition = e.target.selectionStart
    
    setQuery(newQuery)
    setCursorPosition(newCursorPosition)
    setShowExamples(false)
  }, [])
  
  // Handle input focus
  const handleInputFocus = useCallback(() => {
    setIsFocused(true)
    if (query.trim() === '') {
      setShowExamples(true)
    }
  }, [query])
  
  // Handle input blur
  const handleInputBlur = useCallback(() => {
    setTimeout(() => {
      if (document.activeElement !== inputRef.current && 
          !containerRef.current?.contains(document.activeElement)) {
        setIsFocused(false)
        setShowExamples(false)
      }
    }, 200)
  }, [])
  
  // Handle suggestion selection
  const handleSuggestionSelect = useCallback((suggestion) => {
    const beforeCursor = query.substring(0, cursorPosition)
    const afterCursor = query.substring(cursorPosition)
    
    let newQuery = ''
    let newCursorPosition = cursorPosition
    let nextContext = { type: 'field' }
    
    if (context.type === 'value') {
      const valueMatch = beforeCursor.match(/([a-zA-Z_][a-zA-Z0-9_.]+)\s*([:=<>!]+|:LIKE|:IN|:NOT\s+IN|:NOT\s+LIKE)\s*(.*)$/)
      if (valueMatch) {
        const fieldPart = valueMatch[1] + ' ' + valueMatch[2] + ' '
        const valueStr = typeof suggestion === 'string' ? suggestion : (suggestion.value || suggestion)
        const needsQuotes = valueStr.includes(' ') || valueStr.includes(':')
        const finalValue = needsQuotes ? `"${valueStr}"` : valueStr
        
        newQuery = beforeCursor.replace(/([a-zA-Z_][a-zA-Z0-9_.]+)\s*([:=<>!]+|:LIKE|:IN|:NOT\s+IN|:NOT\s+LIKE)\s*.*$/, fieldPart + finalValue) + afterCursor
        newCursorPosition = beforeCursor.replace(/([a-zA-Z_][a-zA-Z0-9_.]+)\s*([:=<>!]+|:LIKE|:IN|:NOT\s+IN|:NOT\s+LIKE)\s*.*$/, fieldPart + finalValue).length
      } else {
        const valueStr = typeof suggestion === 'string' ? suggestion : (suggestion.value || suggestion)
        newQuery = beforeCursor + valueStr + afterCursor
        newCursorPosition = beforeCursor.length + valueStr.length
      }
      nextContext = { type: 'field' }
    } else if (context.type === 'operator') {
      const fieldMatch = beforeCursor.match(/([a-zA-Z_][a-zA-Z0-9_.]+)\s*$/)
      const opValue = typeof suggestion === 'string' ? suggestion : suggestion.value
      
      if (fieldMatch) {
        const beforeField = beforeCursor.substring(0, beforeCursor.length - fieldMatch[1].length)
        newQuery = beforeField + fieldMatch[1] + ' ' + opValue + ' ' + afterCursor
        newCursorPosition = beforeField.length + fieldMatch[1].length + 1 + opValue.length + 1
      } else {
        newQuery = beforeCursor + opValue + ' ' + afterCursor
        newCursorPosition = beforeCursor.length + opValue.length + 1
      }
      nextContext = { type: 'value', field: context.field, operator: opValue, valuePrefix: '' }
    } else {
      // Handle field selection
      const fieldValue = typeof suggestion === 'string' ? suggestion : String(suggestion.key || suggestion.value || suggestion)
      
      // Always try to find and replace the current field prefix/word being typed
      const fieldMatch = beforeCursor.match(/([a-zA-Z_][a-zA-Z0-9_.]*)$/)
      
      if (fieldMatch && fieldMatch[1]) {
        // Replace the matched field word with the selected field value
        const beforeField = beforeCursor.substring(0, beforeCursor.length - fieldMatch[1].length)
        newQuery = beforeField + fieldValue + ' ' + afterCursor
        newCursorPosition = beforeField.length + fieldValue.length + 1
      } else {
        // No field word found, check for logical operators or empty
        const logicalOpMatch = beforeCursor.match(/\s+(AND|OR|NOT)\s+$/i)
        const parenMatch = beforeCursor.match(/\(\s*$/)
        if (logicalOpMatch || parenMatch || beforeCursor.trim() === '') {
          newQuery = beforeCursor + fieldValue + ' ' + afterCursor
          newCursorPosition = beforeCursor.length + fieldValue.length + 1
        } else {
          // Fallback: append the field value
          newQuery = beforeCursor + fieldValue + ' ' + afterCursor
          newCursorPosition = beforeCursor.length + fieldValue.length + 1
        }
      }
      nextContext = { type: 'operator', field: fieldValue }
    }
    
    setQuery(newQuery)
    setCursorPosition(newCursorPosition)
    setContext(nextContext)
    setSuggestions(prev => ({ ...prev, selectedIndex: -1 }))
    setShowExamples(false)
    
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus()
        inputRef.current.setSelectionRange(newCursorPosition, newCursorPosition)
      }
    }, 0)
  }, [query, cursorPosition, context])
  
  // Handle keyboard navigation
  const handleKeyDown = useCallback((e) => {
    // Handle Enter when no suggestions or when suggestions are closed
    if (e.key === 'Enter' && (!suggestions.type || suggestions.items.length === 0)) {
      if (!validationError && query.trim()) {
        e.preventDefault()
        
        // Normalize the query to ensure proper chip conversion
        const normalizedQuery = normalizeFilterQuery(query)
        
        // Update query if normalization changed it
        if (normalizedQuery !== query) {
          setQuery(normalizedQuery)
        }
        
        // Clear editing state and close suggestions
        setEditingChipIndex(null)
        setSuggestions({ type: null, items: [], loading: false, selectedIndex: -1 })
        setShowExamples(false)
        
        // Trigger onChange to apply the filter
        onChange && onChange(normalizedQuery)
        
        // Position cursor at end
        setTimeout(() => {
          if (inputRef.current) {
            const newCursorPos = normalizedQuery.length
            inputRef.current.setSelectionRange(newCursorPos, newCursorPos)
            setCursorPosition(newCursorPos)
          }
        }, 0)
      }
      return
    }
    
    // Handle suggestions navigation
    if (!suggestions.type || suggestions.items.length === 0) {
      return
    }
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSuggestions(prev => ({
          ...prev,
          selectedIndex: prev.selectedIndex < prev.items.length - 1 ? prev.selectedIndex + 1 : prev.selectedIndex,
        }))
        setTimeout(() => {
          const selectedEl = suggestionsRef.current?.querySelector('.filter-suggestion.selected')
          if (selectedEl) {
            selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
          }
        }, 0)
        break
      case 'ArrowUp':
        e.preventDefault()
        setSuggestions(prev => ({
          ...prev,
          selectedIndex: prev.selectedIndex > 0 ? prev.selectedIndex - 1 : -1,
        }))
        setTimeout(() => {
          const selectedEl = suggestionsRef.current?.querySelector('.filter-suggestion.selected')
          if (selectedEl) {
            selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
          }
        }, 0)
        break
      case 'Enter':
      case 'Tab':
        e.preventDefault()
        if (suggestions.selectedIndex >= 0 && suggestions.selectedIndex < suggestions.items.length) {
          handleSuggestionSelect(suggestions.items[suggestions.selectedIndex])
        } else if (e.key === 'Enter' && query.trim()) {
          // If no suggestion selected but Enter pressed, validate and finalize query
          const normalizedQuery = normalizeFilterQuery(query)
          const validation = validateFilterQuery(normalizedQuery)
          
          if (validation.valid) {
            if (normalizedQuery !== query) {
              setQuery(normalizedQuery)
            }
            setEditingChipIndex(null)
            setSuggestions({ type: null, items: [], loading: false, selectedIndex: -1 })
            setShowExamples(false)
            onChange && onChange(normalizedQuery)
            setTimeout(() => {
              if (inputRef.current) {
                const newCursorPos = normalizedQuery.length
                inputRef.current.setSelectionRange(newCursorPos, newCursorPos)
                setCursorPosition(newCursorPos)
              }
            }, 0)
          } else {
            // Invalid query - set validation error
            setValidationError(validation.error || 'Invalid filter query')
          }
        }
        break
      case 'Escape':
        e.preventDefault()
        setSuggestions(prev => ({ ...prev, type: null, items: [], selectedIndex: -1 }))
        setShowExamples(false)
        break
      default:
        break
    }
  }, [suggestions, validationError, query, handleSuggestionSelect, normalizeFilterQuery, onChange])
  
  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsFocused(false)
        setShowExamples(false)
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      if (debouncedLoadKeysRef.current) {
        clearTimeout(debouncedLoadKeysRef.current)
      }
      if (debouncedLoadValuesRef.current) {
        clearTimeout(debouncedLoadValuesRef.current)
      }
      if (debouncedQueryChangeRef.current) {
        clearTimeout(debouncedQueryChangeRef.current)
      }
    }
  }, [])
  
  // Clear filter
  const handleClear = useCallback(() => {
    setQuery('')
    setCursorPosition(0)
    setContext({ type: 'field' })
    setSuggestions({ type: null, items: [], loading: false, selectedIndex: -1 })
    setValidationError(null)
    onChange && onChange('')
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [onChange])
  
  // Extract filter chips with positions from query
  const filterChipsWithPositions = useMemo(() => {
    if (!query || query.trim() === '') return []
    return extractChipsWithPositions(query)
  }, [query])
  
  // Handle removing a filter chip
  const handleRemoveChip = useCallback((chip, e) => {
    if (e) {
      e.stopPropagation()
      e.preventDefault()
    }
    const newQuery = removeFilterCondition(query, chip.field, chip.operator, chip.value)
    setQuery(newQuery)
    const normalizedQuery = normalizeFilterQuery(newQuery)
    onChange && onChange(normalizedQuery)
    setEditingChipIndex(null)
  }, [query, onChange, normalizeFilterQuery])
  
  // Handle chip click to edit
  const handleChipClick = useCallback((chipWithPosition, index, e) => {
    e.stopPropagation()
    e.preventDefault()
    
    setEditingChipIndex(index)
    
    // Position cursor at the start of this chip in the query
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus()
        // Position cursor at the chip location - select the entire chip for editing
        const cursorPos = chipWithPosition.startIndex
        inputRef.current.setSelectionRange(cursorPos, chipWithPosition.endIndex)
        setCursorPosition(cursorPos)
      }
    }, 0)
  }, [])
  
  // Clear editing state when query changes significantly
  useEffect(() => {
    if (editingChipIndex !== null) {
      const chip = filterChipsWithPositions[editingChipIndex]
      if (chip) {
        // Check if the chip still exists at the same position
        if (cursorPosition < chip.startIndex || cursorPosition > chip.endIndex) {
          setEditingChipIndex(null)
        }
      } else {
        setEditingChipIndex(null)
      }
    }
  }, [query, cursorPosition, editingChipIndex, filterChipsWithPositions])
  
  // Handle example click
  const handleExampleClick = useCallback((exampleQuery) => {
    setQuery(exampleQuery)
    setShowExamples(false)
    setIsFocused(true)
    if (inputRef.current) {
      inputRef.current.focus()
      inputRef.current.setSelectionRange(exampleQuery.length, exampleQuery.length)
    }
  }, [])
  
  // Highlight matching text
  const highlightMatch = useCallback((text, query) => {
    if (!query) return text
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    const parts = text.split(regex)
    return parts.map((part, i) => 
      regex.test(part) ? <mark key={i}>{part}</mark> : part
    )
  }, [])
  
  // Determine which suggestions to show
  const shouldShowSuggestions = isFocused && suggestions.type !== null && (suggestions.items.length > 0 || suggestions.loading)
  const shouldShowExamples = isFocused && showExamples && query.trim() === '' && !shouldShowSuggestions
  
  // Get help text and icon based on context
  const helpInfo = useMemo(() => {
    if (context.type === 'field') {
      return { text: 'Select a field to filter by', icon: FiFilter }
    } else if (context.type === 'operator') {
      return { text: 'Choose a comparison operator', icon: FiHash }
    } else {
      return { text: 'Enter or select a value', icon: FiType }
    }
  }, [context.type])
  
  // Get type icon for field
  const getTypeIcon = useCallback((type) => {
    if (!type) return null
    const normalizedType = type.toLowerCase()
    const IconComponent = TYPE_ICONS[normalizedType]
    return IconComponent ? <IconComponent className="suggestion-type-icon" /> : null
  }, [])
  
  // Render query with inline chips
  const renderQueryWithChips = useCallback(() => {
    if (!query || filterChipsWithPositions.length === 0) {
      return null
    }
    
    const parts = []
    let lastIndex = 0
    
    filterChipsWithPositions.forEach((chipWithPos, index) => {
      // Add text before chip (logical operators, spaces, etc.)
      if (chipWithPos.startIndex > lastIndex) {
        const beforeText = query.substring(lastIndex, chipWithPos.startIndex)
        if (beforeText.trim()) {
          parts.push(
            <span key={`text-${lastIndex}`} className="filter-query-text">
              {beforeText}
            </span>
          )
        } else if (beforeText) {
          // Preserve spaces
          parts.push(
            <span key={`space-${lastIndex}`} className="filter-query-space">
              {beforeText}
            </span>
          )
        }
      }
      
      // Add chip
      const isEditing = editingChipIndex === index
      let operatorDisplay = chipWithPos.chip.operator
      switch (chipWithPos.chip.operator) {
        case 'EQUALS':
          operatorDisplay = '='
          break
        case 'GREATER_THAN':
          operatorDisplay = '>'
          break
        case 'LESS_THAN':
          operatorDisplay = '<'
          break
        case 'GREATER_THAN_OR_EQUAL':
          operatorDisplay = '≥'
          break
        case 'LESS_THAN_OR_EQUAL':
          operatorDisplay = '≤'
          break
        case 'NOT_EQUALS':
          operatorDisplay = '≠'
          break
        case 'IN':
          operatorDisplay = 'IN'
          break
        case 'NOT_IN':
          operatorDisplay = 'NOT IN'
          break
        case 'LIKE':
          operatorDisplay = 'LIKE'
          break
        case 'NOT_LIKE':
          operatorDisplay = 'NOT LIKE'
          break
      }
      
      parts.push(
        <span
          key={`chip-${index}`}
          className={`filter-inline-chip ${isEditing ? 'editing' : ''}`}
          onClick={(e) => handleChipClick(chipWithPos, index, e)}
          title="Click to edit"
        >
          <span className="chip-field">{chipWithPos.chip.field}</span>
          <span className="chip-operator">{operatorDisplay}</span>
          <span className="chip-value">{chipWithPos.chip.valueDisplay}</span>
          <button
            className="chip-remove-inline"
            onClick={(e) => handleRemoveChip(chipWithPos.chip, e)}
            title="Remove filter"
            aria-label={`Remove filter ${chipWithPos.chip.field} ${operatorDisplay} ${chipWithPos.chip.valueDisplay}`}
          >
            <FiX />
          </button>
        </span>
      )
      
      lastIndex = chipWithPos.endIndex
    })
    
    // Add remaining text after last chip
    if (lastIndex < query.length) {
      const afterText = query.substring(lastIndex)
      if (afterText.trim() || afterText) {
        parts.push(
          <span key={`text-${lastIndex}`} className="filter-query-text">
            {afterText}
          </span>
        )
      }
    }
    
    return parts
  }, [query, filterChipsWithPositions, editingChipIndex, handleChipClick, handleRemoveChip])
  
  // Check if cursor is in a chip area
  const cursorInChip = useMemo(() => {
    if (editingChipIndex !== null) return editingChipIndex
    if (filterChipsWithPositions.length === 0) return null
    
    for (let i = 0; i < filterChipsWithPositions.length; i++) {
      const chip = filterChipsWithPositions[i]
      if (cursorPosition >= chip.startIndex && cursorPosition <= chip.endIndex) {
        return i
      }
    }
    return null
  }, [cursorPosition, filterChipsWithPositions, editingChipIndex])
  
  return (
    <div className="filter-builder" ref={containerRef}>
      {/* Standard Filter Dropdowns */}
      <div className="filter-fields-grid">
        {STANDARD_FILTER_FIELDS.map(field => (
          <div key={field.key} className="filter-field-group">
            <label htmlFor={`filter-${field.key}`}>{field.label}</label>
            <select
              id={`filter-${field.key}`}
              className="filter-select"
              value={dropdownValues[field.key] || ''}
              onChange={(e) => handleDropdownChange(field.key, e.target.value)}
              disabled={dropdownLoading[field.key]}
            >
              <option value="">All {field.label}s</option>
              {dropdownOptions[field.key]?.map((option, index) => {
                const value = typeof option === 'string' ? option : String(option || '')
                return (
                  <option key={index} value={value}>
                    {value}
                  </option>
                )
              })}
            </select>
            {dropdownLoading[field.key] && (
              <div className="filter-dropdown-loading">
                <div className="loading-spinner"></div>
              </div>
            )}
          </div>
        ))}
        <div className="filter-field-group filter-clear-group">
          <button
            type="button"
            className="filter-clear-all-btn"
            onClick={handleClearAll}
            title="Clear all filters"
            aria-label="Clear all filters"
          >
            <FiX />
            <span>Clear All</span>
          </button>
        </div>
      </div>

      {/* Query String Input - Hidden but preserved for future use */}
      {false && (
        <div className="filter-input-wrapper">
          <div className={`filter-input-container ${validationError ? 'error' : ''} ${query && !validationError ? 'valid' : ''}`}>
            <FiSearch className="filter-input-icon" />
            <div className="filter-input-content">
              {filterChipsWithPositions.length > 0 && (
                <div className="filter-inline-chips-overlay" ref={chipsContainerRef}>
                  {renderQueryWithChips()}
                </div>
              )}
              <input
                ref={inputRef}
                type="text"
                className={`filter-input ${filterChipsWithPositions.length > 0 && editingChipIndex === null ? 'with-chips' : ''} ${editingChipIndex !== null ? 'editing-chip' : ''}`}
                value={query}
                onChange={handleInputChange}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                onKeyDown={handleKeyDown}
                onSelect={(e) => {
                  setCursorPosition(e.target.selectionStart)
                  // Clear editing state when cursor moves outside chip
                  if (editingChipIndex !== null) {
                    const chip = filterChipsWithPositions[editingChipIndex]
                    if (chip && (e.target.selectionStart < chip.startIndex || e.target.selectionStart > chip.endIndex)) {
                      setEditingChipIndex(null)
                    }
                  }
                }}
                placeholder={filterChipsWithPositions.length > 0 && editingChipIndex === null ? '' : placeholder}
                aria-label="Filter input"
                aria-describedby={validationError ? 'filter-error' : undefined}
                aria-autocomplete="list"
                aria-expanded={shouldShowSuggestions}
                aria-controls="filter-suggestions"
              />
            </div>
            {!query && (
              <div className="filter-shortcut-hint">
                <kbd>⌘</kbd><kbd>K</kbd>
              </div>
            )}
            {query && (
              <button
                className="filter-clear-btn"
                onClick={handleClear}
                title="Clear filter"
                aria-label="Clear filter"
              >
                <FiX />
              </button>
            )}
            {query && !validationError && (
              <div className="filter-valid-indicator" title="Valid filter">
                <FiCheckCircle />
              </div>
            )}
          </div>
          
          {shouldShowSuggestions && (
            <div 
              className="filter-suggestions" 
              ref={suggestionsRef}
              id="filter-suggestions"
              role="listbox"
            >
              {suggestions.loading ? (
                <div className="filter-suggestion-loading">
                  <div className="loading-spinner"></div>
                  <span>Loading suggestions...</span>
                </div>
              ) : suggestions.items.length > 0 ? (
                <>
                  <div className="filter-suggestion-header">
                    <div className="suggestion-header-content">
                      {helpInfo.icon && <helpInfo.icon className="suggestion-header-icon" />}
                      <span className="suggestion-header-text">{helpInfo.text}</span>
                    </div>
                    <span className="suggestion-header-hint">↑↓ Navigate • Enter/Tab Select • Esc Close</span>
                  </div>
                  <div className="filter-suggestions-list">
                    {suggestions.items.map((item, index) => {
                      let displayValue, displayLabel, category, type, description, symbol, icon
                      
                      if (suggestions.type === 'operator') {
                        displayValue = item.value || ''
                        displayLabel = item.label || displayValue
                        symbol = item.symbol
                        description = item.description
                        icon = item.icon
                        category = 'Operator'
                      } else if (suggestions.type === 'value') {
                        if (typeof item === 'string') {
                          displayValue = item
                        } else if (item && typeof item === 'object') {
                          displayValue = String(item.value || item || '')
                        } else {
                          displayValue = String(item || '')
                        }
                        displayLabel = displayValue
                      } else {
                        // For field/key suggestions
                        if (item && typeof item === 'object') {
                          displayValue = String(item.key || item.value || '')
                          displayLabel = displayValue
                          category = item.category || null
                          type = item.type || null
                        } else {
                          displayValue = String(item || '')
                          displayLabel = displayValue
                          category = null
                          type = null
                        }
                      }
                      
                      // Ensure displayValue and displayLabel are strings
                      displayValue = String(displayValue || '')
                      displayLabel = String(displayLabel || displayValue)
                      
                      return (
                        <div
                          key={index}
                          role="option"
                          aria-selected={suggestions.selectedIndex === index}
                          className={`filter-suggestion ${suggestions.selectedIndex === index ? 'selected' : ''}`}
                          onClick={() => handleSuggestionSelect(item)}
                          onMouseEnter={() => setSuggestions(prev => ({ ...prev, selectedIndex: index }))}
                        >
                          {category && (
                            <span className="suggestion-category">
                              {category}
                            </span>
                          )}
                          {symbol && (
                            <span className="suggestion-symbol" title={description}>
                              {icon || symbol}
                            </span>
                          )}
                          {getTypeIcon(type) && (
                            <span className="suggestion-type-icon-wrapper">
                              {getTypeIcon(type)}
                            </span>
                          )}
                          <span className="suggestion-value">
                            {suggestions.type === 'key' && context.fieldPrefix 
                              ? highlightMatch(displayLabel, context.fieldPrefix)
                              : displayLabel}
                          </span>
                          {type && !getTypeIcon(type) && (
                            <span className="suggestion-type-badge">{type}</span>
                          )}
                          {description && (
                            <span className="suggestion-description">{description}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </>
              ) : (
                <div className="filter-suggestion-empty">
                  {suggestions.type === 'value' 
                    ? 'No values found. Continue typing to search...' 
                    : suggestions.type === 'operator' 
                    ? 'Select an operator' 
                    : 'No matching fields. Try a different search term.'}
                </div>
              )}
            </div>
          )}
          
          {shouldShowExamples && (
            <div className="filter-examples">
              <div className="filter-examples-header">
                <FiFilter className="filter-examples-icon" />
                <span>Query Examples</span>
              </div>
              <div className="filter-examples-list">
                {QUERY_EXAMPLES.map((example, index) => (
                  <button
                    key={index}
                    className="filter-example-item"
                    onClick={() => handleExampleClick(example.query)}
                    type="button"
                  >
                    <code className="filter-example-query">{example.query}</code>
                    <span className="filter-example-label">{example.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {validationError && (
        <div className="filter-error" id="filter-error" role="alert">
          <FiAlertCircle />
          <span>{validationError}</span>
        </div>
      )}
    </div>
  )
}

export default FilterBuilder
