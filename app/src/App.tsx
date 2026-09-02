import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
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
import Abonnementen from './screens/Abonnementen'
import Accus from './screens/Accus'
import Rapporten from './screens/Rapporten'
import Factuur from './screens/Factuur'
import Inkoopverklaring from './screens/Inkoopverklaring'

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
              <Route path="/abonnementen" element={<Abonnementen />} />
              <Route path="/accus" element={<Accus />} />
              <Route path="/rapporten" element={<Rapporten />} />
              <Route path="/overzicht" element={<Overzicht />} />
              <Route path="/scan" element={<Scan />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        }
      />
    </Routes>
  )
}
