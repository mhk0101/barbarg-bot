'use client'

import { useEffect, useRef } from 'react'

export function usePolling(callback: () => void, interval: number) {
  const savedCallback = useRef(callback)

  useEffect(() => {
    savedCallback.current = callback
  }, [callback])

  useEffect(() => {
    const tick = () => {
      if (!document.hidden) {
        savedCallback.current()
      }
    }

    const id = setInterval(tick, interval)

    const onVisible = () => {
      if (!document.hidden) tick()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [interval])
}
