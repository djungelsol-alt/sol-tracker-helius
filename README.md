# Sol Tracker - Wallet Analyzer

Analyze your Solana wallet trades to see what you missed, roundtripped, or nailed.

## Features

- 🔍 **Automatic Trade Detection** - Fetches all your swap transactions via Helius API
- 📊 **Performance Analysis** - Shows realized/unrealized P&L for each token
- 📈 **Max Price Tracking** - See the highest price after you bought (what you could have sold at)
- 🔄 **Roundtrip Detection** - Identifies tokens that pumped then dumped while you held
- 💸 **Missed Gains Calculator** - Shows how much you left on the table after selling
- 🎯 **Trade History** - Full history of buys/sells for each token

## Setup

### 1. Get a Helius API Key (Free)

1. Go to [helius.dev](https://helius.dev)
2. Sign up for a free account
3. Copy your API key from the dashboard

### 2. Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/sol-tracker-helius)

Or deploy manually:

```bash
npm install
npm run dev
```

### 3. Use the App

1. Enter your Helius API key (saved to browser)
2. Paste any Solana wallet address
3. Click "Analyze" and wait for results

## APIs Used

| API | Purpose | Rate Limit |
|-----|---------|------------|
| [Helius](https://helius.dev) | Wallet swap transactions | Varies by plan |
| [DexScreener](https://dexscreener.com) | Token prices & info | 300/min |
| [GeckoTerminal](https://geckoterminal.com) | OHLCV price history | 30/min |

## What It Shows

For each token you traded:

- **Avg Buy/Sell Price** - Your entry and exit prices
- **Realized P&L** - Profit/loss on sold tokens
- **Unrealized P&L** - Current value of held tokens vs cost
- **Max Price After Buy** - Highest the token went (what you missed)
- **Max Price After Sell** - How high it went after you sold
- **Roundtrip Alert** - Warning if you held through a pump and dump

## Tech Stack

- Next.js 14
- Tailwind CSS
- Helius Enhanced Transactions API
- DexScreener API
- GeckoTerminal API

## License

MIT
