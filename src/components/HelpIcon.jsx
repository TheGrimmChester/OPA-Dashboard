import React, { useState, useRef, useEffect } from 'react'
import { FiHelpCircle } from 'react-icons/fi'
import './HelpIcon.css'

function HelpIcon({ text, className = '', position = 'top' }) {
  const [showTooltip, setShowTooltip] = useState(false)
  const tooltipRef = useRef(null)
  const iconRef = useRef(null)

  useEffect(() => {
    if (showTooltip && tooltipRef.current && iconRef.current) {
      const tooltip = tooltipRef.current
      const icon = iconRef.current
      
      // Check if tooltip is inside navigation menu
      const wrapper = tooltip.parentElement
      const isInNav = wrapper?.closest('.main-nav') || wrapper?.closest('.nav-group-dropdown')
      
      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        if (!tooltip || !icon) return
        
        const iconRect = icon.getBoundingClientRect()
        
        // Always ensure high z-index
        tooltip.style.zIndex = '999999'
        
        // For navigation menu, use fixed positioning to escape z-index context
        if (isInNav) {
          // Reset all positioning styles from CSS classes
          tooltip.style.position = 'fixed'
          tooltip.style.left = ''
          tooltip.style.right = ''
          tooltip.style.top = ''
          tooltip.style.bottom = ''
          tooltip.style.marginTop = ''
          tooltip.style.marginBottom = ''
          
          // Calculate position relative to viewport
          if (position === 'right') {
            tooltip.style.left = `${iconRect.right + 8}px`
            tooltip.style.top = `${iconRect.top + iconRect.height / 2}px`
            tooltip.style.transform = 'translateY(-50%)'
          } else if (position === 'top') {
            tooltip.style.left = `${iconRect.left + iconRect.width / 2}px`
            tooltip.style.bottom = `${window.innerHeight - iconRect.top + 8}px`
            tooltip.style.transform = 'translateX(-50%)'
          } else if (position === 'bottom') {
            tooltip.style.left = `${iconRect.left + iconRect.width / 2}px`
            tooltip.style.top = `${iconRect.bottom + 8}px`
            tooltip.style.transform = 'translateX(-50%)'
          } else {
            tooltip.style.right = `${window.innerWidth - iconRect.left + 8}px`
            tooltip.style.top = `${iconRect.top + iconRect.height / 2}px`
            tooltip.style.transform = 'translateY(-50%)'
          }
          
          // Check if tooltip would overflow viewport and adjust
          const rect = tooltip.getBoundingClientRect()
          if (rect.right > window.innerWidth - 10) {
            tooltip.style.left = `${window.innerWidth - rect.width - 10}px`
            tooltip.style.right = 'auto'
          }
          if (rect.left < 10) {
            tooltip.style.left = '10px'
            tooltip.style.right = 'auto'
          }
          if (rect.bottom > window.innerHeight - 10) {
            tooltip.style.top = `${window.innerHeight - rect.height - 10}px`
            tooltip.style.bottom = 'auto'
          }
          if (rect.top < 10) {
            tooltip.style.top = '10px'
            tooltip.style.bottom = 'auto'
          }
        } else {
          // Regular positioning for other tooltips
          tooltip.style.position = 'absolute'
          
          // Check if tooltip would overflow viewport
          const rect = tooltip.getBoundingClientRect()
          
          // Adjust horizontal position if needed
          if (rect.right > window.innerWidth - 10) {
            tooltip.style.left = 'auto'
            tooltip.style.right = '0'
            // For right position, adjust if still overflowing
            const newRect = tooltip.getBoundingClientRect()
            if (newRect.left < 10) {
              tooltip.style.right = 'auto'
              tooltip.style.left = `${iconRect.left - rect.width - 8}px`
            }
          }
          if (rect.left < 10) {
            tooltip.style.left = '10px'
            tooltip.style.right = 'auto'
          }
          
          // Adjust vertical position if needed
          if (rect.bottom > window.innerHeight - 10) {
            tooltip.style.top = 'auto'
            tooltip.style.bottom = '100%'
            tooltip.style.marginBottom = '8px'
            tooltip.style.marginTop = '0'
          }
          if (rect.top < 10) {
            tooltip.style.top = '10px'
            tooltip.style.bottom = 'auto'
            tooltip.style.marginTop = '0'
            tooltip.style.marginBottom = '0'
          }
        }
      })
    }
  }, [showTooltip, position])

  return (
    <span 
      className={`help-icon-wrapper ${className}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onFocus={() => setShowTooltip(true)}
      onBlur={() => setShowTooltip(false)}
      tabIndex={0}
      role="button"
      aria-label="Help"
    >
      <span ref={iconRef} className="help-icon-wrapper-inner">
        <FiHelpCircle 
          className="help-icon" 
          aria-hidden="true"
        />
      </span>
      {showTooltip && text && (
        <div 
          ref={tooltipRef}
          className={`help-tooltip help-tooltip-${position}`}
          role="tooltip"
        >
          {text}
        </div>
      )}
    </span>
  )
}

export default HelpIcon

