import { Link, useLocation } from 'react-router-dom'
import { useT } from '../i18n'
import * as db from '../lib/db'

/**
 * Rooster, uren en beschikbaarheid zijn drie beelden op hetzelfde onderwerp en
 * delen daarom één regel in de zijbalk. Deze rij is de weg tussen de drie: wie
 * het rooster van volgende week maakt, wil zien wie zich beschikbaar heeft
 * gemeld, en wie de uren nakijkt, wil zien wat er gepland stond.
 *
 * Woorden op de knoppen, geen pictogrammen alleen (sectie 2.2).
 */
/**
 * De eerste vier staan er voor iedereen. Wat een monteur níet mag, is niet een
 * verstopt scherm maar een knop die er niet is: het rooster leest hij alleen,
 * en op de urenstaat ziet hij zijn eigen regel.
 *
 * Wie er in dienst is, is wel van de eigenaar alleen; die tab staat er dus
 * niet bij als een monteur meekijkt.
 */
const PAGINAS = [
  { to: '/rooster', key: 'nav.rooster', ownerOnly: false },
  { to: '/uren', key: 'nav.uren', ownerOnly: false },
  { to: '/beschikbaarheid', key: 'nav.beschikbaarheid', ownerOnly: false },
  { to: '/klok', key: 'nav.klok', ownerOnly: false },
  { to: '/medewerkers', key: 'nav.team', ownerOnly: true },
]

export function RoosterTabs() {
  const t = useT()
  const { pathname } = useLocation()
  const owner = db.maySeeReports()

  return (
    <nav aria-label={t('rooster.tabs')} className="no-print flex flex-wrap gap-2 mt-4 mb-4">
      {PAGINAS.filter((p) => owner || !p.ownerOnly).map((p) => {
        const active = pathname === p.to
        return (
          <Link
            key={p.to}
            to={p.to}
            aria-current={active ? 'page' : undefined}
            className={[
              'press min-h-touch flex items-center px-4 rounded-xl border-2 font-semibold no-underline',
              active ? 'bg-ink text-white border-ink' : 'bg-white text-ink border-ink hover:bg-shell',
            ].join(' ')}
          >
            {t(p.key)}
          </Link>
        )
      })}
    </nav>
  )
}
