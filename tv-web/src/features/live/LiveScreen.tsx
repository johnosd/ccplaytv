import { useState } from 'react'
import { CHANNEL_GROUPS } from '../catalog/mockCatalog'
import { clamp, useRemoteNav } from '../../lib/useRemoteNav'
import { useToast } from '../../lib/useToast'
import { Toast } from '../../components/Toast'

export interface LiveScreenProps {
  onBack: () => void
}

export function LiveScreen({ onBack }: LiveScreenProps) {
  const [col, setCol] = useState<0 | 1>(0)
  const [groupIdx, setGroupIdx] = useState(0)
  const [channelIdx, setChannelIdx] = useState(0)
  const { toastMessage, showToast } = useToast()

  const activeGroup = CHANNEL_GROUPS[groupIdx]

  useRemoteNav({
    onDirection: (dir) => {
      if (dir === 'left') setCol(0)
      if (dir === 'right') setCol(1)

      if (col === 0) {
        if (dir === 'up') {
          setGroupIdx((i) => clamp(i - 1, 0, CHANNEL_GROUPS.length - 1))
          setChannelIdx(0)
        }
        if (dir === 'down') {
          setGroupIdx((i) => clamp(i + 1, 0, CHANNEL_GROUPS.length - 1))
          setChannelIdx(0)
        }
      } else {
        const chLen = activeGroup.channels.length
        if (dir === 'up') setChannelIdx((i) => clamp(i - 1, 0, chLen - 1))
        if (dir === 'down') setChannelIdx((i) => clamp(i + 1, 0, chLen - 1))
      }
    },
    onSelect: () => {
      if (col === 1) showToast('Sintonizando canal...')
    },
    onBack,
  })

  const activeChannelName = activeGroup.channels[channelIdx]

  return (
    <div className="screen screen-row">
      <div className="live-column live-column-groups">
        <div className="live-column-title">Grupos</div>
        {CHANNEL_GROUPS.map((group, i) => (
          <button
            key={group.name}
            type="button"
            className={`live-item${col === 0 && groupIdx === i ? ' tv-focus' : ''}`}
          >
            {group.name}
          </button>
        ))}
      </div>

      <div className="live-column live-column-channels">
        <div className="live-column-title">{activeGroup.name}</div>
        {activeGroup.channels.map((name, i) => (
          <button
            key={name}
            type="button"
            className={`live-item${col === 1 && channelIdx === i ? ' tv-focus' : ''}`}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="live-preview-panel">
        <div className="live-preview-box">
          <div className="live-preview-box-noise" />
          <div className="live-preview-label">▶ prévia — {activeChannelName}</div>
        </div>
        <div className="live-channel-name">{activeChannelName}</div>
        <div className="live-channel-meta">Agora: programação ao vivo · {activeGroup.name}</div>
      </div>

      <Toast message={toastMessage} />
    </div>
  )
}
