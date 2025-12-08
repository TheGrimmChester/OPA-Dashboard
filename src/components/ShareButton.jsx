import React, { useState } from 'react'
import { FiShare2, FiCheck } from 'react-icons/fi'
import './ShareButton.css'

function ShareButton({ url, text = 'Share' }) {
  const [copied, setCopied] = useState(false)

  const handleShare = async () => {
    const fullUrl = url || window.location.href
    
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(fullUrl)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea')
        textArea.value = fullUrl
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
      console.error('Failed to copy URL:', err)
    }
  }

  return (
    <button 
      className={`btn btn-ghost share-button ${copied ? 'copied' : ''}`}
      onClick={handleShare}
      title={copied ? 'Copied!' : 'Copy link to clipboard'}
    >
      {copied ? (
        <>
          <FiCheck className="share-icon" />
          <span>Copied!</span>
        </>
      ) : (
        <>
          <FiShare2 className="share-icon" />
          <span>{text}</span>
        </>
      )}
    </button>
  )
}

export default ShareButton

