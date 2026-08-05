import React, { useState } from 'react'
import { FiCopy, FiCheck } from 'react-icons/fi'
import { Button } from '@open-family/ui'
import './CopyToClipboard.css'

function CopyToClipboard({ text, label, className = '' }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea')
        textArea.value = text
        textArea.style.position = 'fixed'
        textArea.style.left = '-999999px'
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch (err) {
      console.error('Failed to copy text:', err)
    }
  }

  // The glyph changes as well as the colour, so the confirmation never rests on
  // hue alone. Without a label there is no visible text to name the control.
  const name = copied ? 'Copied to clipboard' : 'Copy to clipboard'

  return (
    <Button
      variant="ghost"
      size="sm"
      className={`opa-copy${copied ? ' is-copied' : ''}${className ? ` ${className}` : ''}`}
      icon={copied ? <FiCheck /> : <FiCopy />}
      onClick={handleCopy}
      title={name}
      aria-label={label ? undefined : name}
    >
      {label}
    </Button>
  )
}

export default CopyToClipboard
