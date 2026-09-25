import { useEffect, useState } from 'react'
import { ACTIVITY_PAGE_SIZE, type ActivityPage, MAX_ACTIVITY_LIMIT } from '@shared/library'

export function useActivity() {
  const [limit, setLimit] = useState(ACTIVITY_PAGE_SIZE)
  const [page, setPage] = useState<ActivityPage | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    void window.api.listActivity(limit).then((data) => {
      if (!cancelled) setPage(data)
    })
    return () => {
      cancelled = true
    }
  }, [limit, version])

  useEffect(() => window.api.onDataChanged(() => setVersion((v) => v + 1)), [])

  const canShowMore = page !== null && page.hasMore && limit < MAX_ACTIVITY_LIMIT
  const showMore = () =>
    setLimit((current) => Math.min(current + ACTIVITY_PAGE_SIZE, MAX_ACTIVITY_LIMIT))

  return { page, canShowMore, showMore }
}
