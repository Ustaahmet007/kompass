import { useEffect, useState, type ReactNode } from 'react'
import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { BookOpen, CalendarDays, ClipboardList, Compass, Flag, GraduationCap, LayoutGrid, MoreHorizontal, NotebookPen, Palette, Settings, Sparkles, Sun, Target, Timer as TimerIcon } from 'lucide-react'
import { useDueCount } from './components/tasks'
import { Sheet, cx } from './components/ui'
import { useSetting } from './lib/hooks'
import { applyTheme, DEFAULT_THEME, type ThemeSettings } from './lib/theme'
import { FramedImage } from './components/Picture'
import { setVoicePrefs, type VoicePrefs } from './lib/voice'
import { setElevenConfig, type ElevenModel } from './lib/eleven'
import { useSyncState } from './components/SyncSettings'
import Today from './pages/Today'
import Timetable from './pages/Timetable'
import Tasks from './pages/Tasks'
import Grades from './pages/Grades'
import Exams from './pages/Exams'
import CalendarPage from './pages/Calendar'
import Subjects from './pages/Subjects'
import SubjectDetail from './pages/SubjectDetail'
import SettingsPage from './pages/Settings'
import Notes from './pages/Notes'
import TimerPage from './pages/Timer'
import Plans from './pages/Plans'
import Assistant from './pages/Assistant'
import DesignPage from './pages/Design'

type NavItem = { to: string; label: string; icon: ReactNode; badge?: boolean }
const NAV: NavItem[] = [
  { to: '/', label: 'Heute', icon: <Sun size={22} /> },
  { to: '/stundenplan', label: 'Stundenplan', icon: <LayoutGrid size={22} /> },
  { to: '/aufgaben', label: 'Aufgaben', icon: <ClipboardList size={22} />, badge: true },
  { to: '/noten', label: 'Noten', icon: <GraduationCap size={22} /> },
  { to: '/assistent', label: 'Assistent', icon: <Sparkles size={22} /> },
  { to: '/lernziele', label: 'Lernziele', icon: <Flag size={22} /> },
  { to: '/lerntimer', label: 'Lerntimer', icon: <TimerIcon size={22} /> },
  { to: '/notizen', label: 'Notizen', icon: <NotebookPen size={22} /> },
  { to: '/pruefungen', label: 'Prüfungen', icon: <Target size={22} /> },
  { to: '/kalender', label: 'Kalender', icon: <CalendarDays size={22} /> },
  { to: '/faecher', label: 'Fächer', icon: <BookOpen size={22} /> },
  { to: '/design', label: 'Design', icon: <Palette size={22} /> },
  { to: '/einstellungen', label: 'Einstellungen', icon: <Settings size={22} /> },
]
const TAB_ITEMS = NAV.slice(0, 4)
const MORE_ITEMS = NAV.slice(4)

function useMedia(query: string) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatch(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return match
}

function useDesign() {
  const legacyMode = useSetting<'system' | 'light' | 'dark'>('theme', 'system')
  const design = useSetting<ThemeSettings | null>('design', null) ?? { ...DEFAULT_THEME, mode: legacyMode }
  const systemDark = useMedia('(prefers-color-scheme: dark)')
  useEffect(() => {
    applyTheme(design, systemDark)
  }, [design, systemDark])
  return design
}

/** Optional photo behind the whole app, softened so text stays readable. */
function BackgroundImage({ design }: { design: ThemeSettings }) {
  const bgId = useSetting<number | null>('bgImageId', null)
  if (design.background !== 'image' || !bgId) return null
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <FramedImage id={bgId} blur={design.bgBlur} />
      <div className="absolute inset-0" style={{ background: 'var(--paper)', opacity: design.bgDim / 100 }} />
    </div>
  )
}

function Badge({ n }: { n: number }) {
  if (!n) return null
  return (
    <span className="ml-auto min-w-5 rounded-full bg-danger px-1.5 text-center text-xs leading-5 font-bold text-white tabular">{n > 99 ? '99+' : n}</span>
  )
}

function Shell() {
  const voicePrefs = useSetting<VoicePrefs | null>('voice', null)
  useEffect(() => setVoicePrefs(voicePrefs), [voicePrefs])
  const engine = useSetting<'system' | 'eleven'>('voiceEngine', 'system')
  const elevenKey = useSetting<string>('elevenKey', '')
  const elevenVoice = useSetting<string>('elevenVoice', '')
  const elevenModel = useSetting<ElevenModel>('elevenModel', 'eleven_flash_v2_5')
  useEffect(() => setElevenConfig(engine === 'eleven' ? { key: elevenKey, voiceId: elevenVoice, model: elevenModel } : null), [engine, elevenKey, elevenVoice, elevenModel])
  const design = useDesign()
  const due = useDueCount()
  // Sidebar when there is room for it: iPad landscape, or any wide window. Split View and portrait get the tab bar.
  const wide = useMedia('(min-width: 1000px), (min-width: 860px) and (orientation: landscape)')
  const [moreOpen, setMoreOpen] = useState(false)
  const loc = useLocation()

  useEffect(() => setMoreOpen(false), [loc.pathname])
  useEffect(() => window.scrollTo(0, 0), [loc.pathname])
  useEffect(() => {
    // Home-screen icon badge (iPadOS 16.4+ when installed)
    const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
    if (due) nav.setAppBadge?.(due).catch(() => {})
    else nav.clearAppBadge?.().catch(() => {})
  }, [due])


  const onAssistant = loc.pathname.startsWith('/assistent')
  const fab = !onAssistant && (
    <NavLink
      to="/assistent"
      aria-label="Assistent öffnen"
      className={cx('fixed right-5 z-30 flex size-14 items-center justify-center rounded-full bg-ink text-paper shadow-xl ring-4 ring-brass/30 transition-transform active:scale-95', wide ? 'bottom-6' : 'bottom-24')}
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    >
      <Sparkles size={24} />
    </NavLink>
  )

  const routes = (
    <Routes>
      <Route path="/" element={<Today />} />
      <Route path="/stundenplan" element={<Timetable />} />
      <Route path="/aufgaben" element={<Tasks />} />
      <Route path="/noten" element={<Grades />} />
      <Route path="/pruefungen" element={<Exams />} />
      <Route path="/kalender" element={<CalendarPage />} />
      <Route path="/faecher" element={<Subjects />} />
      <Route path="/fach/:id" element={<SubjectDetail />} />
      <Route path="/einstellungen" element={<SettingsPage />} />
      <Route path="/notizen" element={<Notes />} />
      <Route path="/notizen/:id" element={<Notes />} />
      <Route path="/lerntimer" element={<TimerPage />} />
      <Route path="/lernziele" element={<Plans />} />
      <Route path="/lernziele/:id" element={<Plans />} />
      <Route path="/assistent" element={<Assistant />} />
      <Route path="/design" element={<DesignPage />} />
      <Route path="*" element={<Today />} />
    </Routes>
  )

  if (wide) {
    return (
      <div className="flex min-h-dvh">
        <BackgroundImage design={design} />
        <aside className="safe-top sticky top-0 h-dvh w-60 shrink-0 border-r border-line bg-surface/90 backdrop-blur"><div className="flex h-full flex-col px-3 py-5">
          <div className="mb-6 flex items-center gap-2.5 px-3">
            <Compass size={26} className="text-brass" />
            <span className="display text-2xl">Kompass</span>
          </div>
          <SyncDot />
          <nav className="flex flex-col gap-0.5">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/'}
                className={({ isActive }) =>
                  cx('flex min-h-11 items-center gap-3 rounded-lg px-3 font-medium transition-colors', isActive ? 'bg-ink text-paper' : 'text-ink-2 hover:bg-sunken hover:text-ink')
                }
              >
                {n.icon}
                <span>{n.label}</span>
                {n.badge && <Badge n={due} />}
              </NavLink>
            ))}
          </nav>
          </div>
        </aside>
        <main className="safe-top min-w-0 flex-1">
          <div className="mx-auto max-w-6xl px-6 py-8 lg:px-10">{routes}</div>
        </main>
        {fab}
      </div>
    )
  }

  const moreActive = MORE_ITEMS.some((m) => loc.pathname.startsWith(m.to)) || loc.pathname.startsWith('/fach/')
  return (
    <div className="min-h-dvh">
      <BackgroundImage design={design} />
      <main className="safe-top"><div className="px-4 pt-6 pb-28 sm:px-6">{routes}</div></main>
      {fab}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto grid max-w-xl grid-cols-5">
          {TAB_ITEMS.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) => cx('relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium', isActive ? 'text-ink' : 'text-ink-3')}
            >
              {({ isActive }) => (
                <>
                  <span className={cx('rounded-full px-4 py-0.5', isActive && 'bg-brass-soft text-brass')}>{n.icon}</span>
                  {n.label === 'Stundenplan' ? 'Plan' : n.label}
                  {n.badge && due > 0 && (
                    <span className="absolute top-1.5 left-1/2 ml-3 min-w-4.5 rounded-full bg-danger px-1 text-center text-[10px] leading-4.5 font-bold text-white">{due}</span>
                  )}
                </>
              )}
            </NavLink>
          ))}
          <button type="button" onClick={() => setMoreOpen(true)} className={cx('flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium', moreActive ? 'text-ink' : 'text-ink-3')}>
            <span className={cx('rounded-full px-4 py-0.5', moreActive && 'bg-brass-soft text-brass')}><MoreHorizontal size={22} /></span>
            Mehr
          </button>
        </div>
      </nav>
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Mehr">
        <div className="grid grid-cols-2 gap-2">
          {MORE_ITEMS.map((n) => (
            <NavLink key={n.to} to={n.to} className="flex min-h-16 items-center gap-3 rounded-xl border border-line px-4 font-medium hover:bg-sunken">
              <span className="text-brass">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </div>
      </Sheet>
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  )
}

function SyncDot() {
  const s = useSyncState()
  if (s.status === 'off') return null
  const text = s.status === 'syncing' ? 'Synchronisiert …' : s.status === 'offline' ? 'Offline' : s.status === 'error' ? 'Sync-Fehler' : 'Synchronisiert'
  return (
    <NavLink to="/einstellungen" className="-mt-4 mb-4 flex items-center gap-2 px-3 text-xs text-ink-3 hover:text-ink">
      <span className={cx('size-2 rounded-full', s.status === 'error' ? 'bg-danger' : s.status === 'offline' ? 'bg-ink-3' : s.status === 'syncing' ? 'animate-pulse bg-brass' : 'bg-ok')} />
      {text}
    </NavLink>
  )
}
