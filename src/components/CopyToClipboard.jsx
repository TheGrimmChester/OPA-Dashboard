import React, { useState } from 'react'
import { FiCopy, FiCheck } from 'react-icons/fi'
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

  return (
    <button 
      className={`btn btn-ghost copy-to-clipboard ${className} ${copied ? 'copied' : ''}`}
      onClick={handleCopy}
      title={copied ? 'Copied!' : 'Copy to clipboard'}
    >
      {copied ? <FiCheck className="copy-icon" /> : <FiCopy className="copy-icon" />}
      {label && <span>{label}</span>}
    </button>
  )
}

export default CopyToClipboard

