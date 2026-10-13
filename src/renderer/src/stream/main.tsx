import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'motion/react'
import '@/styles/index.css'
import { OverlayApp } from '@/overlay/OverlayApp'
import { eventsUrl, subscribeToStream } from './subscribe'

const subscribe = subscribeToStream(eventsUrl(window.location.search))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <OverlayApp subscribe={subscribe} />
    </MotionConfig>
  </StrictMode>,
)
