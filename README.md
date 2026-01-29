# Solana Wallet Tracker

A web application to track Solana wallet trades with price performance analysis.

![Solana Wallet Tracker](https://img.shields.io/badge/Solana-Wallet%20Tracker-00ff88?style=for-the-badge)

## Features

- 🔍 **Token Search** - Search any Solana token via DexScreener API
- 📊 **Trade Logging** - Log buy/sell trades with price, amount, and market cap
- 📈 **Performance Analysis** - Automatically calculate min/max prices during holding period
- 🎯 **Post-Sell Tracking** - Monitor if you missed gains or avoided losses
- 💾 **Local Storage** - Trades persist in your browser

## APIs Used

| API | Purpose | Rate Limit |
|-----|---------|------------|
| [DexScreener](https://docs.dexscreener.com/api/reference) | Token data, pairs, search | 300/min |
| [GeckoTerminal](https://apiguide.geckoterminal.com/) | OHLCV historical prices | 30/min |

## Quick Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/solana-wallet-tracker)

## Manual Deployment

### Prerequisites

- [Node.js](https://nodejs.org/) 18+ installed
- [Git](https://git-scm.com/) installed
- [GitHub](https://github.com/) account
- [Vercel](https://vercel.com/) account (free)

### Step 1: Clone and Setup

```bash
# Clone the repo (or download and extract)
git clone https://github.com/YOUR_USERNAME/solana-wallet-tracker.git
cd solana-wallet-tracker

# Install dependencies
npm install

# Run locally
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see it running.

### Step 2: Push to GitHub

```bash
# Initialize git (if not already)
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit"

# Add your GitHub repo as remote
git remote add origin https://github.com/YOUR_USERNAME/solana-wallet-tracker.git

# Push to GitHub
git push -u origin main
```

### Step 3: Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **"Add New Project"**
3. Import your `solana-wallet-tracker` repository
4. Click **"Deploy"**
5. Wait ~1 minute for deployment
6. Your app is live at `https://your-project.vercel.app`!

## Project Structure

```
solana-wallet-tracker/
├── app/
│   ├── globals.css      # Global styles
│   ├── layout.js        # Root layout
│   └── page.js          # Main app component
├── package.json         # Dependencies
├── next.config.js       # Next.js config
├── tailwind.config.js   # Tailwind CSS config
└── README.md           # This file
```

## Environment Variables

This app uses public APIs that don't require API keys. For automatic wallet tracking, you would need:

```env
# Optional - for automatic wallet tracking
HELIUS_API_KEY=your_helius_api_key
```

## Extending the App

### Adding Automatic Wallet Tracking

To automatically detect wallet trades, integrate with:

1. **Helius API** ([helius.dev](https://helius.dev))
   - Enhanced transaction parsing
   - Webhooks for real-time trade detection
   
2. **Solana Tracker API** ([solanatracker.io](https://solanatracker.io))
   - Wallet PnL tracking
   - Trade history

### Example Helius Integration

```javascript
// Add to your API calls
const getWalletSwaps = async (walletAddress) => {
  const response = await fetch(
    `https://api-mainnet.helius-rpc.com/v0/addresses/${walletAddress}/transactions?api-key=${process.env.HELIUS_API_KEY}&type=SWAP`
  );
  return response.json();
};
```

## Tech Stack

- **Framework**: [Next.js 14](https://nextjs.org/) (App Router)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Charts**: [Recharts](https://recharts.org/)
- **Deployment**: [Vercel](https://vercel.com/)

## License

MIT License - feel free to use this for your own projects!

## Contributing

Pull requests welcome! For major changes, please open an issue first.

---

Built with ❤️ for the Solana community
