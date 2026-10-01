import { useState } from 'react'

const REPO_URL = 'https://github.com/velo4705/floo'
const STORAGE_KEY = 'floo-star-collapsed'

interface GitHubStarProps {
  show: boolean
}

export function GitHubStar({ show }: GitHubStarProps) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })

  if (!show) return null

  const toggle = () => {
    setCollapsed((v) => {
      const next = !v
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      } catch {
        /* blocked storage: collapse lasts for this session only */
      }
      return next
    })
  }

  return (
    <div className={`floo-star${collapsed ? ' is-collapsed' : ''}`}>
      <a className="floo-star__link" href={REPO_URL} target="_blank" rel="noopener noreferrer">
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
        <span className="floo-star__label">Star on GitHub</span>
      </a>
      <button
        type="button"
        className="floo-star__toggle"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Show the GitHub star prompt' : 'Hide the GitHub star prompt'}
      >
        <svg
          viewBox="0 0 24 24"
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          {collapsed ? <path d="M9.5 5.5 16 12l-6.5 6.5" /> : <path d="M14.5 5.5 8 12l6.5 6.5" />}
        </svg>
      </button>
    </div>
  )
}
