import './globals.css'

export const metadata = {
  title: 'Solana Wallet Tracker',
  description: 'Track Solana wallet trades with price performance analysis',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
