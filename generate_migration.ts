import fs from 'fs'
import type { MemorialEntry } from './src/modules/types'

const memorials = JSON.parse(fs.readFileSync('./public/data/memorials.json', 'utf8'))

const sql = memorials.map((m: MemorialEntry) => {
  return `INSERT INTO memorials (id, name, name_fa, city, city_fa, location, location_fa, date, coords, bio, bio_fa, testimonials, media, source_links, verified) 
VALUES (
  '${m.id}', 
  '${m.name.replace(/'/g, "''")}', 
  ${m.name_fa ? `'${m.name_fa.replace(/'/g, "''")}'` : 'NULL'}, 
  '${m.city.replace(/'/g, "''")}', 
  ${m.city_fa ? `'${m.city_fa.replace(/'/g, "''")}'` : 'NULL'}, 
  ${m.location ? `'${m.location.replace(/'/g, "''")}'` : 'NULL'}, 
  ${m.location_fa ? `'${m.location_fa.replace(/'/g, "''")}'` : 'NULL'}, 
  '${m.date}', 
  '${JSON.stringify(m.coords)}', 
  '${m.bio.replace(/'/g, "''")}', 
  ${m.bio_fa ? `'${m.bio_fa.replace(/'/g, "''")}'` : 'NULL'}, 
  ${m.testimonials ? `'${JSON.stringify(m.testimonials).replace(/'/g, "''")}'` : 'NULL'}, 
  ${m.media ? `'${JSON.stringify(m.media).replace(/'/g, "''")}'` : 'NULL'}, 
  ${m.references ? `'${JSON.stringify(m.references).replace(/'/g, "''")}'` : 'NULL'}, 
  true
);`
}).join('\n')

fs.writeFileSync('./migration.sql', sql)
// eslint-disable-next-line no-console
console.log('Migration SQL generated in migration.sql')
