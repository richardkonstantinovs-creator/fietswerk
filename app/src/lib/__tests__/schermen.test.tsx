import { beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import App from '../../App'
import { I18nProvider } from '../../i18n'
import * as db from '../db'

/**
 * Rooktest: alle schermen moeten met de demodata zonder fout renderen.
 * Dit vangt geen ontwerpfouten, maar wel de stomme fouten die je pas ziet
 * als de eigenaar al voor het scherm staat.
 */

function render(path: string): string {
  return renderToStaticMarkup(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </I18nProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  db.resetDemoData()
  db.login('usr_owner', '1111')
})

describe('schermen renderen', () => {
  it('vraagt eerst wie er werkt', () => {
    db.logout()
    expect(render('/')).toContain('Wie werkt er?')
    // De klantpagina en een gescand label werken zonder aanmelden.
    const wo = db.data().work_orders.find((w) => w.status === 'wachtrij')!
    expect(render(`/s/${wo.public_token}`)).toContain('Status')
  })

  it('weigert de rapporten aan wie geen eigenaar is', () => {
    db.login('usr_monteur', '2222')
    expect(render('/rapporten')).toContain('Dit deel is voor de eigenaar')
  })

  const paden = (): Array<[string, string]> => {
    const wo = db.data().work_orders.find((w) => w.status === 'wachtrij')!
    const wachtend = db.data().work_orders.find((w) => w.status === 'wacht_op_onderdeel')!
    const klant = db.data().customers[0]
    const deel = db.data().parts[0]
    const po = db.data().purchase_orders[0]
    const occ = db.data().stock_bikes[0]
    const factuur = db.data().invoices[0]
    return [
      ['/', 'Werkplaats'],
      ['/aanname', 'Stap 1 van 6'],
      [`/werkbon/${wo.id}`, 'Werkbon'],
      [`/werkbon/${wachtend.id}`, 'Wacht op'],
      ['/klanten', 'Klanten'],
      [`/klant/${klant.id}`, klant.last_name],
      ['/onderdelen', 'Onderdelen'],
      [`/onderdeel/${deel.id}`, deel.name],
      ['/bestellingen', 'Bestellingen'],
      [`/bestelling/${po.id}`, po.number],
      ['/occasions', 'Occasions'],
      [`/occasion/${occ.id}`, 'Echte marge'],
      ['/occasions/inkoop', 'stopheling'],
      ['/abonnementen', 'Onderhoudsabonnementen'],
      ['/accus', 'in de winkel en op de lader'],
      ['/rapporten', 'Rapporten'],
      ['/overzicht', 'Overzicht'],
      ['/scan', 'Label scannen'],
      [`/factuur/${factuur.id}`, factuur.number],
      [`/inkoopverklaring/${occ.id}`, 'Inkoopverklaring'],
      [`/W/${wo.tag_code}`, 'reparatie'],
      [`/s/${wo.public_token}`, 'Status'],
    ]
  }

  for (const [pad, verwacht] of paden()) {
    it(`rendert ${pad}`, () => {
      const html = render(pad)
      expect(html.length).toBeGreaterThan(200)
      expect(html).toContain(verwacht)
    })
  }

  it('toont bij een gescand label geen naam of telefoonnummer van een vreemde', () => {
    // Sectie 8.1: een scan zonder winkelsessie mag geen persoonsgegevens tonen.
    localStorage.removeItem('fietswerk.session')
    const wo = db.data().work_orders.find((w) => w.status === 'wachtrij')!
    const klantVanBon = db.customer(wo.customer_id)!
    const html = render(`/W/${wo.tag_code}`)
    expect(html).not.toContain(klantVanBon.last_name)
    expect(html).not.toContain(klantVanBon.phone.slice(-6))
  })
})
