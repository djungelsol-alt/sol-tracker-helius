import './globals.css'

export const metadata = {
  title: 'Sol Tracker - Wallet Analyzer',
  description: 'Analyze your Solana wallet trades with Helius API',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
