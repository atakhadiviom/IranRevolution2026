import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  /* eslint-disable no-console */
  console.error('Error: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in .env')
  console.log('Please ensure your .env file contains these variables.')
  /* eslint-enable no-console */
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function backup() {
  // eslint-disable-next-line no-console
  console.log('📦 Starting backup from Supabase...')
  
  // Fetch all records from the memorials table
  const { data, error } = await supabase
    .from('memorials')
    .select('*')

  if (error) {
    // eslint-disable-next-line no-console
    console.error('❌ Error fetching data:', error.message)
    return
  }

  // Ensure backup directory exists
  const backupDir = path.join(process.cwd(), 'backups')
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir)
    // eslint-disable-next-line no-console
    console.log('📁 Created backups directory')
  }

  // Create filename with current date and time
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const time = now.toTimeString().split(' ')[0].replace(/:/g, '-');
  const filename = `memorials_backup_${date}_${time}.json`
  const filepath = path.join(backupDir, filename)

  // Save data to JSON file
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2))
  
  /* eslint-disable no-console */
  console.log(`✅ Backup successful!`)
  console.log(`📄 Saved to: backups/${filename}`)
  console.log(`📊 Total records: ${data.length}`)
  /* eslint-enable no-console */
}

backup().catch(err => {
  // eslint-disable-next-line no-console
  console.error('❌ Unexpected error during backup:', err)
  process.exit(1)
})
