export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('='.repeat(80))
    console.log('🚀 Next.js Server Starting')
    console.log('='.repeat(80))
    console.log(
        "\n" +
        "      _ _  __           _    \n" +
        "  ___| (_)/ _|___  __ _| (_) \n" +
        " / _ \\ | |  _/ _ \\/ _` | | | \n" +
        " \\___/_|_|_| \\___/\\__, |_|_| \n" +
        "                  |___/      \n" +
        "\n");
    console.log(Date())

    // Variabili d'ambiente comuni
    console.log('\n📦 Node Environment:')
    console.log(`  NODE_ENV: ${process.env.NODE_ENV}`)
    console.log(`  NEXT_RUNTIME: ${process.env.NEXT_RUNTIME}`)
    
    // Helper per mostrare secret mascherati
    const maskSecret = (value: string | undefined): string => {
      if (!value) return '✗ Not set'
      if (value.length <= 8) return '✓ Set (too short to display)'
      return `${value.substring(0, 4)}...${value.substring(value.length - 4)}`
    }
    
    // Variabili MongoDB
    console.log('\n🗄️  MongoDB:')
    console.log(`  MONGODB_URI: ${process.env.MONGODB_URI}`)
    console.log(`  MONGODB_DB: ${process.env.MONGODB_DB || 'Not set'}`)
    
    // Variabili NextAuth
    console.log('\n🔐 NextAuth:')
    console.log(`  NEXTAUTH_URL: ${process.env.NEXTAUTH_URL || 'Not set'}`)
    console.log(`  NEXTAUTH_SECRET: ${maskSecret(process.env.NEXTAUTH_SECRET)}`)
    
    // Variabili Olimanager
    console.log('\n🔗 Olimanager:')
    console.log(`  OLIMANAGER_URL: ${process.env.OLIMANAGER_URL || 'Not set'}`)
    console.log(`  OLIMANAGER_OAUTH_CLIENT_ID: ${process.env.OLIMANAGER_OAUTH_CLIENT_ID || 'Not set'}`)
    console.log(`  OLIMANAGER_OAUTH_CLIENT_SECRET: ${maskSecret(process.env.OLIMANAGER_OAUTH_CLIENT_SECRET)}`)
    console.log(`  OLI_GRAPHQL_ENDPOINT: ${process.env.OLI_GRAPHQL_ENDPOINT || 'Not set'}`)

    // Variabili directory e storage
    console.log('\n📁 Mounted Directories:')
    console.log(`  SCANS_SPOOL_DIR: ${process.env.SCANS_SPOOL_DIR || 'Not set'}`)
    console.log(`  SCANS_DATA_DIR: ${process.env.SCANS_DATA_DIR || 'Not set'}`)
    console.log(`  SHEETGENDATA_DIR: ${process.env.SHEETGENDATA_DIR || '/app/sheetgendata (default)'}`)
    console.log(`  SHEETGENSPOOL_DIR: ${process.env.SHEETGENSPOOL_DIR || '/app/sheetgenspool (default)'}`)
    console.log(`  LOG_DIR: ${process.env.LOG_DIR || 'Not set'}`)
    
    // Altre variabili
    console.log('\n⚙️  Other Variables:')
    console.log(`  ADMIN_EMAILS: ${process.env.ADMIN_EMAILS || 'Not set'}`)
    
    // Elenca tutte le variabili che iniziano con NEXT_PUBLIC_
    console.log('\n🌐 Public Variables (NEXT_PUBLIC_):')
    Object.keys(process.env)
      .filter(key => key.startsWith('NEXT_PUBLIC_'))
      .forEach(key => {
        console.log(`  ${key}: ${process.env[key]}`)
      })
    
    console.log('\n' + '='.repeat(80))
    console.log('✅ Server initialization complete')
    console.log('='.repeat(80) + '\n')
  }
}
