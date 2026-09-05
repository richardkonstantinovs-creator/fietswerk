import { useLayoutEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigationType } from 'react-router-dom'
import { Layout } from './components/Layout'
import * as db from './lib/db'
import { useDbVersion } from './lib/useDb'
import Werkplaats from './screens/Werkplaats'
import Aanname from './screens/Aanname'
import Werkbon from './screens/Werkbon'
import Klanten from './screens/Klanten'
import Klant from './screens/Klant'
import Overzicht from './screens/Overzicht'
import Scan from './screens/Scan'
import ScanActie from './screens/ScanActie'
import PublicStatus from './screens/PublicStatus'
import Aanmelden from './screens/Aanmelden'
import Onderdelen from './screens/Onderdelen'
import Onderdeel from './screens/Onderdeel'
import Bestellingen from './screens/Bestellingen'
import Bestelling from './screens/Bestelling'
import Occasions from './screens/Occasions'
import Occasion from './screens/Occasion'
import Inkoop from './screens/Inkoop'
import Rapporten from './screens/Rapporten'
import Rooster from './screens/Rooster'
import Uren from './screens/Uren'
import Beschikbaarheid from './screens/Beschikbaarheid'
import Klok from './screens/Klok'
import Medewerkers from './screens/Medewerkers'
import Factuur from './screens/Factuur'
import Inkoopverklaring from './screens/Inkoopverklaring'

/**
 * Elk scherm begint bovenaan. Zonder dit blijft de bladzijde staan waar hij
 * stond: open je een werkbon vanuit een lijst waar je halverwege in zat, dan
 * kom je ook halverwege die werkbon binnen — de fiets en de klacht staan dan
 * boven het scherm en de monteur ziet ze niet.
 *
 * Ga je terug met de terugknop van de browser (POP), dan doen we niets: dan
 * hoort de lijst te staan waar je hem liet.
 */
function ScrollNaarBoven() {
  const { pathname } = useLocation()
  const soort = useNavigationType()
  useLayoutEffect(() => {
    if (soort === 'POP') return
    window.scrollTo(0, 0)
  }, [pathname, soort])
  return null
}

/**
 * Twee niveaus navigatie (sectie 2.2): hoofdscherm -> lijst -> kaart.
 * Buiten de winkelschil staan de schermen met één handeling: het label
 * /W/<code>, de klantpagina /s/<token> en de documenten die naar papier gaan.
 */
export default function App() {
  useDbVersion()
  const location = useLocation()

  // Aanmelden is nodig voor de winkelschil, niet voor de klantpagina en niet
  // voor een gescand label: die moeten ook werken op een toestel zonder sessie.
  const publiek = location.pathname.startsWith('/s/') || location.pathname.toUpperCase().startsWith('/W/')
  if (!db.isLoggedIn() && !publiek) return <Aanmelden />

  return (
    <>
      <ScrollNaarBoven />
      <Routes>
        <Route path="/s/:token" element={<PublicStatus />} />
        <Route path="/W/:code" element={<ScanActie />} />
        <Route path="/factuur/:id" element={<Factuur />} />
        <Route path="/inkoopverklaring/:id" element={<Inkoopverklaring />} />
        <Route
          path="*"
          element={
            <Layout>
              <Routes>
                <Route path="/" element={<Werkplaats />} />
                <Route path="/aanname" element={<Aanname />} />
                <Route path="/werkbon/:id" element={<Werkbon />} />
                <Route path="/klanten" element={<Klanten />} />
                <Route path="/klant/:id" element={<Klant />} />
                <Route path="/onderdelen" element={<Onderdelen />} />
                <Route path="/onderdeel/:id" element={<Onderdeel />} />
                <Route path="/bestellingen" element={<Bestellingen />} />
                <Route path="/bestelling/:id" element={<Bestelling />} />
                <Route path="/occasions" element={<Occasions />} />
                <Route path="/occasions/inkoop" element={<Inkoop />} />
                <Route path="/occasion/:id" element={<Occasion />} />
                <Route path="/rapporten" element={<Rapporten />} />
                <Route path="/rooster" element={<Rooster />} />
                <Route path="/uren" element={<Uren />} />
                <Route path="/beschikbaarheid" element={<Beschikbaarheid />} />
                <Route path="/klok" element={<Klok />} />
                <Route path="/medewerkers" element={<Medewerkers />} />
                <Route path="/overzicht" element={<Overzicht />} />
                <Route path="/scan" element={<Scan />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          }
        />
      </Routes>
    </>
  )
}
