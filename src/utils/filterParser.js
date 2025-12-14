/**
 * Filter Query Parser
 * Parses filter query syntax into an AST
 * 
 * Syntax examples:
 * - status_code:500
 * - duration_ms:>1000
 * - service:api AND method:POST
 * - (status_code:>=400 AND status_code:<500) OR error:true
 * - tags.http_request.method:GET
 * - http.status_code:200
 * - url:LIKE /api/*
 * - trace_id:IN (abc123, def456)
 */

// Token types
const TOKEN_TYPES = {
  FIELD: 'FIELD',
  OPERATOR: 'OPERATOR',
  VALUE: 'VALUE',
  LOGICAL_OP: 'LOGICAL_OP',
  LPAREN: 'LPAREN',
  RPAREN: 'RPAREN',
  COMMA: 'COMMA',
  EOF: 'EOF'
}

// Operators
const OPERATORS = {
  '=': 'EQUALS',
  ':': 'EQUALS',
  ':>': 'GREATER_THAN',
  ':<': 'LESS_THAN',
  ':>=': 'GREATER_THAN_OR_EQUAL',
  ':<=': 'LESS_THAN_OR_EQUAL',
  ':!=': 'NOT_EQUALS',
  ':IN': 'IN',
  ':NOT IN': 'NOT_IN',
  ':LIKE': 'LIKE',
  ':NOT LIKE': 'NOT_LIKE'
}

// Logical operators
const LOGICAL_OPS = ['AND', 'OR', 'NOT']

/**
 * Tokenize the filter query string
 */
function tokenize(query) {
  const tokens = []
  let i = 0
  const len = query.length

  const skipWhitespace = () => {
    while (i < len && /\s/.test(query[i])) {
      i++
    }
  }

  const readField = () => {
    let field = ''
    // Field names can contain letters, numbers, dots, and underscores
    // But NOT hyphens (hyphens are used in values like "symfony-php")
    while (i < len && /[a-zA-Z0-9_.]/.test(query[i])) {
      field += query[i]
      i++
    }
    return field
  }

  const readValue = () => {
    let value = ''
    
    // Check for quoted string
    if (query[i] === '"' || query[i] === "'") {
      const quote = query[i]
      i++ // Skip opening quote
      while (i < len && query[i] !== quote) {
        if (query[i] === '\\' && i + 1 < len) {
          value += query[i + 1]
          i += 2
        } else {
          value += query[i]
          i++
        }
      }
      if (i < len) i++ // Skip closing quote
      return { value, type: 'string' }
    }
    
    // Check for number
    if (/[0-9]/.test(query[i]) || (query[i] === '-' && i + 1 < len && /[0-9]/.test(query[i + 1]))) {
      let numStr = ''
      if (query[i] === '-') {
        numStr += query[i]
        i++
      }
      while (i < len && /[0-9.]/.test(query[i])) {
        numStr += query[i]
        i++
      }
      const num = parseFloat(numStr)
      return { value: isNaN(num) ? numStr : num, type: 'number' }
    }
    
    // Check for boolean
    if (query.substring(i, i + 4).toUpperCase() === 'TRUE') {
      i += 4
      return { value: true, type: 'boolean' }
    }
    if (query.substring(i, i + 5).toUpperCase() === 'FALSE') {
      i += 5
      return { value: false, type: 'boolean' }
    }
    
    // Read unquoted string (until whitespace, operator, or parenthesis)
    // Allow hyphens and other characters that are valid in values but not in field names
    while (i < len && !/\s/.test(query[i]) && 
           query[i] !== ':' && query[i] !== '(' && query[i] !== ')' && query[i] !== ',') {
      value += query[i]
      i++
    }
    return { value, type: 'string' }
  }

  const readOperator = () => {
    // Check for multi-character operators first
    const remaining = query.substring(i)
    if (remaining.startsWith(':NOT IN')) {
      i += 7
      return ':NOT IN'
    }
    if (remaining.startsWith(':NOT LIKE')) {
      i += 9
      return ':NOT LIKE'
    }
    if (remaining.startsWith(':>=')) {
      i += 3
      return ':>='
    }
    if (remaining.startsWith(':<=')) {
      i += 3
      return ':<=' 
    }
    if (remaining.startsWith(':!=')) {
      i += 3
      return ':!='
    }
    if (remaining.startsWith(':IN')) {
      i += 3
      return ':IN'
    }
    if (remaining.startsWith(':LIKE')) {
      i += 5
      return ':LIKE'
    }
    if (remaining.startsWith(':>')) {
      i += 2
      return ':>'
    }
    if (remaining.startsWith(':<')) {
      i += 2
      return ':<'
    }
    if (query[i] === ':') {
      i++
      return ':'
    }
    if (query[i] === '=') {
      i++
      return '='
    }
    return null
  }

  const readLogicalOp = () => {
    const remaining = query.substring(i).toUpperCase()
    for (const op of LOGICAL_OPS) {
      if (remaining.startsWith(op) && 
          (remaining.length === op.length || /\s/.test(remaining[op.length]))) {
        i += op.length
        return op
      }
    }
    return null
  }

  while (i < len) {
    skipWhitespace()
    if (i >= len) break

    const char = query[i]

    // Parentheses
    if (char === '(') {
      tokens.push({ type: TOKEN_TYPES.LPAREN, value: '(' })
      i++
      continue
    }
    if (char === ')') {
      tokens.push({ type: TOKEN_TYPES.RPAREN, value: ')' })
      i++
      continue
    }

    // Comma
    if (char === ',') {
      tokens.push({ type: TOKEN_TYPES.COMMA, value: ',' })
      i++
      continue
    }

    // Logical operators
    const logicalOp = readLogicalOp()
    if (logicalOp) {
      tokens.push({ type: TOKEN_TYPES.LOGICAL_OP, value: logicalOp })
      continue
    }

    // Operators
    const operator = readOperator()
    if (operator) {
      tokens.push({ type: TOKEN_TYPES.OPERATOR, value: operator })
      continue
    }

    // Check if we're expecting a value (last token was an operator)
    const lastToken = tokens.length > 0 ? tokens[tokens.length - 1] : null
    const expectingValue = lastToken && lastToken.type === TOKEN_TYPES.OPERATOR

    // Field name (starts with letter or underscore)
    // Only read as field if we're NOT expecting a value
    if (!expectingValue && /[a-zA-Z_]/.test(char)) {
      const field = readField()
      if (field) {
        tokens.push({ type: TOKEN_TYPES.FIELD, value: field })
        continue
      }
    }

    // Value (could be string, number, etc.)
    // This handles values after operators, including values with hyphens like "symfony-php"
    const valueInfo = readValue()
    if (valueInfo.value !== '') {
      tokens.push({ type: TOKEN_TYPES.VALUE, value: valueInfo.value, valueType: valueInfo.type })
      continue
    }

    // Unknown character - skip or error?
    i++
  }

  tokens.push({ type: TOKEN_TYPES.EOF, value: null })
  return tokens
}

/**
 * Parse tokens into an AST
 */
function parse(tokens) {
  let current = 0

  const peek = () => tokens[current]
  const consume = (expectedType = null) => {
    const token = tokens[current++]
    if (expectedType && token.type !== expectedType) {
      throw new Error(`Expected ${expectedType}, got ${token.type}`)
    }
    return token
  }

  const parseExpression = () => {
    return parseOrExpression()
  }

  const parseOrExpression = () => {
    let left = parseAndExpression()
    
    while (peek().type === TOKEN_TYPES.LOGICAL_OP && peek().value === 'OR') {
      const op = consume()
      const right = parseAndExpression()
      left = {
        type: 'logical',
        operator: 'OR',
        left,
        right
      }
    }
    
    return left
  }

  const parseAndExpression = () => {
    let left = parseNotExpression()
    
    while (peek().type === TOKEN_TYPES.LOGICAL_OP && peek().value === 'AND') {
      const op = consume()
      const right = parseNotExpression()
      left = {
        type: 'logical',
        operator: 'AND',
        left,
        right
      }
    }
    
    return left
  }

  const parseNotExpression = () => {
    if (peek().type === TOKEN_TYPES.LOGICAL_OP && peek().value === 'NOT') {
      consume()
      return {
        type: 'logical',
        operator: 'NOT',
        operand: parseNotExpression()
      }
    }
    
    return parseComparison()
  }

  const parseComparison = () => {
    if (peek().type === TOKEN_TYPES.LPAREN) {
      consume(TOKEN_TYPES.LPAREN)
      const expr = parseExpression()
      consume(TOKEN_TYPES.RPAREN)
      return expr
    }

    const field = consume(TOKEN_TYPES.FIELD)
    const operator = consume(TOKEN_TYPES.OPERATOR)
    
    // Handle IN and NOT IN operators
    if (operator.value === ':IN' || operator.value === ':NOT IN') {
      consume(TOKEN_TYPES.LPAREN)
      const values = []
      
      // Parse first value
      if (peek().type === TOKEN_TYPES.VALUE) {
        values.push(consume(TOKEN_TYPES.VALUE))
      }
      
      // Parse additional values
      while (peek().type === TOKEN_TYPES.COMMA) {
        consume(TOKEN_TYPES.COMMA)
        if (peek().type === TOKEN_TYPES.VALUE) {
          values.push(consume(TOKEN_TYPES.VALUE))
        }
      }
      
      consume(TOKEN_TYPES.RPAREN)
      
      return {
        type: 'comparison',
        field: field.value,
        operator: operator.value === ':IN' ? 'IN' : 'NOT_IN',
        value: values.map(v => v.value)
      }
    }
    
    // Handle regular operators
    const value = consume(TOKEN_TYPES.VALUE)
    
    return {
      type: 'comparison',
      field: field.value,
      operator: OPERATORS[operator.value] || 'EQUALS',
      value: value.value,
      valueType: value.valueType
    }
  }

  try {
    const ast = parseExpression()
    if (peek().type !== TOKEN_TYPES.EOF) {
      throw new Error('Unexpected token at end of expression')
    }
    return ast
  } catch (error) {
    throw new Error(`Parse error: ${error.message}`)
  }
}

/**
 * Main parser function
 */
export function parseFilterQuery(query) {
  if (!query || query.trim() === '') {
    return null
  }

  try {
    const tokens = tokenize(query.trim())
    const ast = parse(tokens)
    return ast
  } catch (error) {
    throw new Error(`Filter parse error: ${error.message}`)
  }
}

/**
 * Validate filter query syntax
 * Returns lenient validation that doesn't error on incomplete queries
 */
export function validateFilterQuery(query) {
  if (!query || query.trim() === '') {
    return { valid: true, error: null }
  }

  try {
    const trimmedQuery = query.trim()
    
    // Check if query looks incomplete (ends with operator, colon, or logical operator)
    const looksIncomplete = /[:=<>!]\s*$|(AND|OR|NOT)\s*$/i.test(trimmedQuery)
    
    if (looksIncomplete) {
      // Don't validate incomplete queries - user is still typing
      return { valid: true, error: null }
    }
    
    parseFilterQuery(query)
    return { valid: true, error: null }
  } catch (error) {
    // Check if error is about incomplete input (EOF errors are usually incomplete)
    if (error.message && error.message.includes('EOF')) {
      // Check if it's just incomplete (ends with field name or operator)
      const trimmedQuery = query.trim()
      if (/[a-zA-Z_][a-zA-Z0-9_.]*\s*[:=<>!]*\s*$/i.test(trimmedQuery)) {
        return { valid: true, error: null } // Incomplete but valid so far
      }
    }
    return { valid: false, error: error.message }
  }
}

/**
 * Extract field names from a filter query
 */
export function extractFields(query) {
  const fields = new Set()
  
  const traverse = (node) => {
    if (!node) return
    
    if (node.type === 'comparison') {
      fields.add(node.field)
    } else if (node.type === 'logical') {
      if (node.left) traverse(node.left)
      if (node.right) traverse(node.right)
      if (node.operand) traverse(node.operand)
    }
  }
  
  try {
    const ast = parseFilterQuery(query)
    if (ast) {
      traverse(ast)
    }
  } catch (error) {
    // Ignore parse errors when extracting fields
  }
  
  return Array.from(fields)
}

/**
 * Get the current field being typed (for auto-complete)
 */
export function getCurrentField(query, cursorPosition) {
  if (!query || cursorPosition < 0 || cursorPosition > query.length) {
    return null
  }
  
  // Find the field name before the cursor
  const beforeCursor = query.substring(0, cursorPosition)
  const match = beforeCursor.match(/([a-zA-Z_][a-zA-Z0-9_.]*)\s*[:=<>!]*\s*$/)
  
  if (match) {
    return match[1]
  }
  
  return null
}

/**
 * Rebuild query string from AST
 */
function astToQuery(ast) {
  if (!ast) return ''
  
  if (ast.type === 'comparison') {
    const field = ast.field
    let operator = ':'
    let value = ast.value
    
    // Map operator back to query syntax
    switch (ast.operator) {
      case 'EQUALS':
        operator = ':'
        break
      case 'GREATER_THAN':
        operator = ':>'
        break
      case 'LESS_THAN':
        operator = ':<'
        break
      case 'GREATER_THAN_OR_EQUAL':
        operator = ':>='
        break
      case 'LESS_THAN_OR_EQUAL':
        operator = ':<=' 
        break
      case 'NOT_EQUALS':
        operator = ':!='
        break
      case 'IN':
        operator = ':IN'
        value = `(${Array.isArray(value) ? value.join(', ') : value})`
        break
      case 'NOT_IN':
        operator = ':NOT IN'
        value = `(${Array.isArray(value) ? value.join(', ') : value})`
        break
      case 'LIKE':
        operator = ':LIKE'
        break
      case 'NOT_LIKE':
        operator = ':NOT LIKE'
        break
    }
    
    // Format value
    let valueStr = String(value)
    if (typeof value === 'string' && (value.includes(' ') || value.includes(':'))) {
      valueStr = `"${valueStr.replace(/"/g, '\\"')}"`
    }
    
    return `${field}${operator}${valueStr}`
  } else if (ast.type === 'logical') {
    if (ast.LogicalOp === 'NOT') {
      return `NOT (${astToQuery(ast.operand)})`
    } else {
      const left = astToQuery(ast.left)
      const right = astToQuery(ast.right)
      const op = ast.LogicalOp
      return `(${left}) ${op} (${right})`
    }
  }
  
  return ''
}

/**
 * Remove a filter condition from the query
 * @param {string} query - The current filter query
 * @param {string} field - The field to remove
 * @param {string} operator - The operator to match
 * @param {any} value - The value to match
 * @returns {string} - The new query without the removed condition
 */
export function removeFilterCondition(query, field, operator, value) {
  if (!query || query.trim() === '') return ''
  
  try {
    const ast = parseFilterQuery(query)
    if (!ast) return ''
    
    // Create a deep copy of the AST
    const cloneAST = (node) => {
      if (!node) return null
      
      if (node.type === 'comparison') {
        // Check if this is the condition to remove
        if (node.field === field && node.operator === operator) {
          // Compare values properly (handle arrays)
          let matches = false
          if (Array.isArray(node.value) && Array.isArray(value)) {
            matches = node.value.length === value.length && 
                     node.value.every((v, i) => String(v) === String(value[i]))
          } else if (!Array.isArray(node.value) && !Array.isArray(value)) {
            matches = String(node.value) === String(value)
          }
          
          if (matches) {
            return null // Mark for removal
          }
        }
        return { ...node }
      } else if (node.type === 'logical') {
        const cloned = {
          type: 'logical',
          LogicalOp: node.LogicalOp
        }
        
        if (node.LogicalOp === 'NOT') {
          cloned.operand = cloneAST(node.operand)
          if (!cloned.operand) return null
        } else {
          cloned.left = cloneAST(node.left)
          cloned.right = cloneAST(node.right)
          
          // If one side is null, return the other side
          if (!cloned.left && !cloned.right) return null
          if (!cloned.left) return cloned.right
          if (!cloned.right) return cloned.left
        }
        
        return cloned
      }
      
      return node
    }
    
    const newAST = cloneAST(ast)
    if (!newAST) return ''
    
    return astToQuery(newAST)
  } catch (error) {
    return query // Return original if removal fails
  }
}

/**
 * Extract chips with their positions in the query string
 * Returns array of { chip, startIndex, endIndex, queryPart }
 */
export function extractChipsWithPositions(query) {
  if (!query || query.trim() === '') return []
  
  try {
    const ast = parseFilterQuery(query)
    if (!ast) return []
    
    const chips = []
    const extractChips = (node, startPos = 0) => {
      if (node.type === 'comparison') {
        // Build the query part for this chip
        let operator = ':'
        let value = node.value
        
        switch (node.operator) {
          case 'EQUALS':
            operator = ':'
            break
          case 'GREATER_THAN':
            operator = ':>'
            break
          case 'LESS_THAN':
            operator = ':<'
            break
          case 'GREATER_THAN_OR_EQUAL':
            operator = ':>='
            break
          case 'LESS_THAN_OR_EQUAL':
            operator = ':<=' 
            break
          case 'NOT_EQUALS':
            operator = ':!='
            break
          case 'IN':
            operator = ':IN'
            value = `(${Array.isArray(value) ? value.join(', ') : value})`
            break
          case 'NOT_IN':
            operator = ':NOT IN'
            value = `(${Array.isArray(value) ? value.join(', ') : value})`
            break
          case 'LIKE':
            operator = ':LIKE'
            break
          case 'NOT_LIKE':
            operator = ':NOT LIKE'
            break
        }
        
        let valueStr = String(value)
        if (typeof value === 'string' && (value.includes(' ') || value.includes(':'))) {
          valueStr = `"${valueStr.replace(/"/g, '\\"')}"`
        }
        
        const queryPart = `${node.field}${operator}${valueStr}`
        
        // Find this part in the query string
        const searchStart = startPos
        const index = query.indexOf(queryPart, searchStart)
        
        if (index !== -1) {
          chips.push({
            chip: {
              field: node.field,
              operator: node.operator,
              value: node.value,
              valueDisplay: Array.isArray(node.value) ? node.value.join(', ') : String(node.value)
            },
            startIndex: index,
            endIndex: index + queryPart.length,
            queryPart
          })
          return index + queryPart.length
        }
        return startPos
      } else if (node.type === 'logical') {
        let pos = startPos
        if (node.left) {
          pos = extractChips(node.left, pos)
          // Account for logical operator
          const opMatch = query.substring(pos).match(/^\s*(AND|OR|NOT)\s*/i)
          if (opMatch) {
            pos += opMatch[0].length
          }
        }
        if (node.right) {
          pos = extractChips(node.right, pos)
        }
        if (node.operand) {
          pos = extractChips(node.operand, pos)
        }
        return pos
      }
      return startPos
    }
    
    extractChips(ast, 0)
    return chips.sort((a, b) => a.startIndex - b.startIndex)
  } catch (error) {
    return []
  }
}

export default {
  parseFilterQuery,
  validateFilterQuery,
  extractFields,
  getCurrentField,
  removeFilterCondition,
  extractChipsWithPositions
}

