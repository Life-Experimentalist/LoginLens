import React, { useState, useEffect } from 'react'
import { isAppPackageDomain } from '../../core/utils/domain'

export const AppNameDisplay: React.FC<{ domain: string, className?: string }> = ({ domain, className = '' }) => {
  const [appName, setAppName] = useState<string | null>(null)

  useEffect(() => {
    if (isAppPackageDomain(domain)) {
      chrome.runtime.sendMessage(
        { type: 'RESOLVE_APP_PACKAGE', packageId: domain },
        (response) => {
          if (response && response.appName && response.appName !== domain) {
            setAppName(response.appName)
          }
        }
      )
    }
  }, [domain])

  if (!appName) {
    return <span className={className}>{domain}</span>
  }

  return (
    <span className={className} title={domain}>
      {appName} <span className="opacity-50 text-[0.85em] font-mono ml-1">({domain})</span>
    </span>
  )
}
