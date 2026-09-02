#!/usr/bin/env node
/**
 * Regel 14.4 uit de specificatie: geen enkele tekstregel in JSX, alles via t().
 * Zonder deze controle blijft de helft van het scherm onvertaald en komt dat
 * pas tijdens de demonstratie bij de eigenaar aan het licht.
 *
 * Controleert daarnaast:
 *  - nl.json en en.json hebben exact dezelfde sleutels;
 *  - elke t('sleutel') en tNL('sleutel') in de code bestaat ook echt.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const SRC = join(ROOT, 'src')

// Tekens en losse leestekens die geen vertaling nodig hebben.
const ALLOWED = new Set(['✓', '○', '●', '⚠', '·', '—', '×', '€', ':', ',', '.', '-', '/', '|'])

/** Commentaar telt niet mee; regelnummers blijven kloppen. */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((line) => (line.trimStart().startsWith('//') ? '' : line))
    .join('\n')
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

const files = walk(SRC)
const dict = JSON.parse(readFileSync(join(SRC, 'i18n/nl.json'), 'utf8'))
const dictEn = JSON.parse(readFileSync(join(SRC, 'i18n/en.json'), 'utf8'))
const problems = []

// 1. Sleutels in beide woordenboeken gelijk.
for (const key of Object.keys(dict)) {
  if (!(key in dictEn)) problems.push(`en.json mist de sleutel ${key}`)
}
for (const key of Object.keys(dictEn)) {
  if (!(key in dict)) problems.push(`nl.json mist de sleutel ${key}`)
}

// 2. Letterlijke tekst in JSX.
for (const file of files.filter((f) => f.endsWith('.tsx'))) {
  const source = stripComments(readFileSync(file, 'utf8'))
  const lines = source.split('\n')
  lines.forEach((line, index) => {
    // Het teken voor '>' mag geen '=' zijn: dan is het een pijlfunctie in
    // code (`(l) => l.qty < l.max`) en geen tekst tussen twee JSX-tags.
    for (const match of line.matchAll(/(?<![=\-!<>])>([^<>{}]+)</g)) {
      const text = match[1].trim()
      if (text === '' || ALLOWED.has(text)) continue
      // Woorden van drie letters of meer horen in het woordenboek.
      if (/[A-Za-zÀ-ÿ]{3,}/.test(text)) {
        problems.push(`${relative(ROOT, file)}:${index + 1} letterlijke tekst in JSX: "${text}"`)
      }
    }
  })
}

// 3. Gebruikte sleutels bestaan. Alleen letterlijke sleutels zijn te
//    controleren; samengestelde sleutels (`status.${x}`) slaan we over.
for (const file of files.filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))) {
  const source = readFileSync(file, 'utf8')
  for (const match of source.matchAll(/\bt(?:NL)?\(\s*'([^']+)'/g)) {
    const key = match[1]
    if (!(key in dict)) problems.push(`${relative(ROOT, file)}: onbekende sleutel '${key}'`)
  }
}

if (problems.length > 0) {
  console.error('i18n-controle mislukt:\n')
  for (const p of problems) console.error(`  ${p}`)
  console.error(`\n${problems.length} probleem(en).`)
  process.exit(1)
}
console.log(`i18n-controle in orde: ${Object.keys(dict).length} sleutels, ${files.length} bestanden.`)
