import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Sparkles } from 'lucide-react'
import { kiStatus } from '../lib/claude'
import { Button } from './ui'

/** Shows a setup card instead of the children while no API key is stored. */
export function useKi() {
  return useLiveQuery(() => kiStatus(), [], undefined)
}

export function KiSetupCard({ what }: { what: string }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-line bg-surface px-5 py-5">
      <p className="flex items-center gap-2 font-semibold"><Sparkles size={18} className="text-brass" /> KI noch nicht eingerichtet</p>
      <p className="mt-1.5 max-w-prose text-ink-2">
        {what} braucht einen eigenen API-Schlüssel von Anthropic. Den bekommst du auf console.anthropic.com unter „API Keys". Er bleibt nur auf diesem iPad.
      </p>
      <Link to="/einstellungen#ki" className="mt-3 inline-block"><Button variant="primary">Schlüssel eintragen</Button></Link>
    </div>
  )
}
