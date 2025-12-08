import React, { useState, useEffect, useRef, useMemo } from 'react'
import './StackTraceViewer.css'

const INITIAL_FRAME_COUNT = 50
const LOAD_MORE_COUNT = 50
const SCROLL_THRESHOLD = 200 // pixels from bottom to trigger load

function StackTraceViewer({ stack, expandAll = false }) {
  const [expanded, setExpanded] = useState(new Set())
  const [visibleFrameCount, setVisibleFrameCount] = useState(INITIAL_FRAME_COUNT)
  const [isLoading, setIsLoading] = useState(false)
  const scrollContainerRef = useRef(null)
  const sentinelRef = useRef(null)

  // Parse and normalize frames
  const frames = useMemo(() => {
    if (!stack || (Array.isArray(stack) && stack.length === 0)) {
      return []
    }

    let parsedFrames = []
    if (Array.isArray(stack)) {
      parsedFrames = stack.map((frame, idx) => {
        if (typeof frame === 'string') {
          return { id: idx, raw: frame }
        }
        if (frame.function || frame.file) {
          return {
            id: idx,
            function: frame.function,
            class: frame.class,
            file: frame.file,
            line: frame.line,
            raw: frame,
          }
        }
        if (frame.CallID || frame.Function) {
          // CallNode format from agent
          return {
            id: idx,
            function: frame.Function || frame.function,
            class: frame.Class || frame.class,
            file: frame.File || frame.file,
            line: frame.Line || frame.line,
            raw: frame,
          }
        }
        return { id: idx, raw: JSON.stringify(frame, null, 2) }
      })
    } else if (typeof stack === 'string') {
      // Try to parse as JSON
      try {
        const parsed = JSON.parse(stack)
        if (Array.isArray(parsed)) {
          parsedFrames = parsed.map((frame, idx) => ({
            id: idx,
            function: frame.function || frame.Function,
            class: frame.class || frame.Class,
            file: frame.file || frame.File,
            line: frame.line || frame.Line,
            raw: frame,
          }))
        }
      } catch {
        // Not JSON, treat as text
        parsedFrames = stack.split('\n').map((line, idx) => ({ id: idx, raw: line }))
      }
    }
    return parsedFrames
  }, [stack])

  // Reset visible count when stack changes
  useEffect(() => {
    setVisibleFrameCount(INITIAL_FRAME_COUNT)
  }, [stack])

  // Intersection Observer for infinite scrolling
  useEffect(() => {
    if (!sentinelRef.current || frames.length <= visibleFrameCount) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries
        if (entry.isIntersecting && !isLoading && visibleFrameCount < frames.length) {
          setIsLoading(true)
          // Simulate slight delay for smooth loading
          setTimeout(() => {
            setVisibleFrameCount(prev => Math.min(prev + LOAD_MORE_COUNT, frames.length))
            setIsLoading(false)
          }, 50)
        }
      },
      {
        root: scrollContainerRef.current,
        rootMargin: `${SCROLL_THRESHOLD}px`,
        threshold: 0.1,
      }
    )

    observer.observe(sentinelRef.current)

    return () => {
      observer.disconnect()
    }
  }, [frames.length, visibleFrameCount, isLoading])

  // Handle manual scroll detection as fallback
  const handleScroll = () => {
    if (isLoading || visibleFrameCount >= frames.length) return

    const container = scrollContainerRef.current
    if (!container) return

    const { scrollTop, scrollHeight, clientHeight } = container
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight

    if (distanceFromBottom < SCROLL_THRESHOLD) {
      setIsLoading(true)
      setTimeout(() => {
        setVisibleFrameCount(prev => Math.min(prev + LOAD_MORE_COUNT, frames.length))
        setIsLoading(false)
      }, 50)
    }
  }

  if (frames.length === 0) {
    return <div className="stack-trace-empty">No stack trace available</div>
  }

  const visibleFrames = frames.slice(0, visibleFrameCount)
  const hasMore = visibleFrameCount < frames.length

  const toggleFrame = (id) => {
    const newExpanded = new Set(expanded)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpanded(newExpanded)
  }

  const formatFrame = (frame) => {
    if (frame.raw && !frame.function && !frame.file) {
      return frame.raw
    }

    const parts = []
    if (frame.class) {
      parts.push(frame.class + '::')
    }
    if (frame.function) {
      parts.push(frame.function)
    } else {
      parts.push('{anonymous}')
    }
    
    let result = parts.join('')
    if (frame.file) {
      result += ` (${frame.file}`
      if (frame.line) {
        result += `:${frame.line}`
      }
      result += ')'
    }
    
    return result || 'Unknown frame'
  }

  return (
    <div className="stack-trace-viewer">
      <div className="stack-trace-header">
        <h3>Stack Trace ({frames.length} frames{hasMore ? `, showing ${visibleFrameCount}` : ''})</h3>
        <div className="stack-trace-actions">
          {hasMore && (
            <button
              onClick={() => setVisibleFrameCount(frames.length)}
              className="load-all-btn"
            >
              Load All
            </button>
          )}
          <button
            onClick={() => setExpanded(new Set(visibleFrames.map(f => f.id)))}
            className="expand-all-btn"
          >
            Expand All
          </button>
          <button
            onClick={() => setExpanded(new Set())}
            className="collapse-all-btn"
          >
            Collapse All
          </button>
        </div>
      </div>
      <div 
        className="stack-trace-frames"
        ref={scrollContainerRef}
        onScroll={handleScroll}
      >
        {visibleFrames.map((frame, idx) => {
          const isExpanded = expanded.has(frame.id) || expandAll
          const hasDetails = frame.file || frame.function
          
          return (
            <div key={frame.id || idx} className="stack-trace-frame">
              <div
                className={`frame-header ${hasDetails ? 'clickable' : ''}`}
                onClick={() => hasDetails && toggleFrame(frame.id)}
              >
                <span className="frame-number">#{frames.length - idx}</span>
                <span className="frame-text">{formatFrame(frame)}</span>
                {hasDetails && (
                  <span className="frame-toggle">
                    {isExpanded ? '▼' : '▶'}
                  </span>
                )}
              </div>
              {isExpanded && hasDetails && (
                <div className="frame-details">
                  {frame.file && (
                    <div className="frame-file">
                      <strong>File:</strong> {frame.file}
                      {frame.line && <span> (line {frame.line})</span>}
                    </div>
                  )}
                  {frame.function && (
                    <div className="frame-function">
                      <strong>Function:</strong> {frame.function}
                    </div>
                  )}
                  {frame.class && (
                    <div className="frame-class">
                      <strong>Class:</strong> {frame.class}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {hasMore && (
          <div ref={sentinelRef} className="stack-trace-sentinel">
            {isLoading && (
              <div className="stack-trace-loading">
                <span className="loading-spinner"></span>
                <span>Loading more frames...</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default StackTraceViewer

