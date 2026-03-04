import type { WeatherType } from "@/lib/weather-simulation"
import { getWeatherLabel as getWeatherLabelFromSim } from "@/lib/weather-simulation"
import { cn } from "@/lib/utils"

interface WeatherIconProps {
  type: WeatherType
  className?: string
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="4" fill="currentColor" opacity="0.9" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
        const rad = (angle * Math.PI) / 180
        const x1 = Math.round((12 + Math.cos(rad) * 6) * 100) / 100
        const y1 = Math.round((12 + Math.sin(rad) * 6) * 100) / 100
        const x2 = Math.round((12 + Math.cos(rad) * 8.5) * 100) / 100
        const y2 = Math.round((12 + Math.sin(rad) * 8.5) * 100) / 100
        return (
          <line
            key={angle}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        )
      })}
    </svg>
  )
}

function SnowflakeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <line x1="12" y1="2" x2="12" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="19.07" y1="4.93" x2="4.93" y2="19.07" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      {[0, 60, 120, 180, 240, 300].map((angle) => {
        const rad = (angle * Math.PI) / 180
        const cx = Math.round((12 + Math.cos(rad) * 5) * 100) / 100
        const cy = Math.round((12 + Math.sin(rad) * 5) * 100) / 100
        return <circle key={angle} cx={cx} cy={cy} r="1" fill="currentColor" />
      })}
    </svg>
  )
}

function CloudIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M6.5 17.5a4 4 0 0 1-.88-7.9A6 6 0 0 1 17.5 10a4.5 4.5 0 0 1 .5 8.97"
        fill="currentColor"
        opacity="0.2"
      />
      <path
        d="M6.5 17.5a4 4 0 0 1-.88-7.9A6 6 0 0 1 17.5 10a4.5 4.5 0 0 1 .5 8.97"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function BlizzardIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M6.5 13a4 4 0 0 1-.88-7.9A6 6 0 0 1 17.5 6a4.5 4.5 0 0 1 .5 8.97"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {[7, 12, 17].map((x) => (
        <g key={x}>
          <line x1={x} y1="16" x2={x - 1.5} y2="21" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <line x1={x} y1="18" x2={x + 1} y2="19.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        </g>
      ))}
    </svg>
  )
}

function IceIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 2L14.5 9H9.5L12 2Z" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1" />
      <path d="M6 8L10 14H2L6 8Z" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1" />
      <path d="M18 8L22 14H14L18 8Z" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1" />
      <line x1="4" y1="19" x2="20" y2="19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="6" y1="21.5" x2="18" y2="21.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

const WEATHER_COLORS: Record<WeatherType, string> = {
  sunny: "text-amber-400",
  snowy: "text-sky-300",
  cloudy: "text-slate-400",
  blizzard: "text-blue-200",
  icy: "text-cyan-300",
}

const iconMap: Record<WeatherType, React.FC<{ className?: string }>> = {
  sunny: SunIcon,
  snowy: SnowflakeIcon,
  cloudy: CloudIcon,
  blizzard: BlizzardIcon,
  icy: IceIcon,
}

export function WeatherIcon({ type, className }: WeatherIconProps) {
  const Icon = iconMap[type]
  return <Icon className={cn("size-6", WEATHER_COLORS[type], className)} />
}

export const getWeatherLabel = getWeatherLabelFromSim
