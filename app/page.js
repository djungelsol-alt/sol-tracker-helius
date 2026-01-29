'use client';

import React, { useState, useEffect } from 'react';

// ============================================================================
// CONSTANTS
// ============================================================================

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
const STABLES = [USDC_MINT, USDT_MINT];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const formatNumber = (num, decimals = 2) => {
  if (num === null || num === undefined || isNaN(num)) return '-';
  if (num >= 1e9) return `$${(num / 1e9).toFixed(decimals)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(decimals)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(decimals)}K`;
  return `$${num.toFixed(decimals)}`;
};

const formatPrice = (price) => {
  if (!price || isNaN(price)) return '-';
  if (price < 0.00000001) return `$${price.toExponential(2)}`;
  if (price < 0.0001) return `$${price.toFixed(10)}`;
  if (price < 0.01) return `$${price.toFixed(8)}`;
  if (price < 1) return `$${price.toFixed(6)}`;
  if (price < 100) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(2)}`;
};

const formatPercent = (pct) => {
  if (pct === null || pct === undefined || isNaN(pct)) return '-';
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
};

const shortenAddress = (addr) => {
  if (!addr) return '';
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
};

const timeAgo = (timestamp) => {
  const seconds = Math.floor((Date.now() / 1000) - timestamp);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};

// ============================================================================
// API SERVICES
// ============================================================================

const HeliusAPI = {
  async getSwapTransactions(walletAddress, apiKey, limit = 100) {
    try {
      const url = `https://api-mainnet.helius-rpc.com/v0/addresses/${walletAddress}/transactions?api-key=${apiKey}&type=SWAP&limit=${limit}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Helius API error: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Helius API error:', error);
      throw error;
    }
  }
};

const DexScreenerAPI = {
  async getTokenPrice(tokenAddress) {
    try {
      const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
      const data = await response.json();
      if (data.pairs && data.pairs.length > 0) {
        const solanaPairs = data.pairs.filter(p => p.chainId === 'solana');
        if (solanaPairs.length > 0) {
          return {
            price: parseFloat(solanaPairs[0].priceUsd),
            symbol: solanaPairs[0].baseToken.symbol,
            name: solanaPairs[0].baseToken.name,
            marketCap: solanaPairs[0].marketCap,
            priceChange24h: solanaPairs[0].priceChange?.h24,
            pairAddress: solanaPairs[0].pairAddress
          };
        }
      }
      return null;
    } catch (error) {
      console.error('DexScreener error:', error);
      return null;
    }
  },

  async getTokenPriceHistory(pairAddress) {
    try {
      // Get OHLCV from GeckoTerminal
      const response = await fetch(
        `https://api.geckoterminal.com/api/v2/networks/solana/pools/${pairAddress}/ohlcv/hour?aggregate=1&limit=168`
      );
      const data = await response.json();
      return data.data?.attributes?.ohlcv_list || [];
    } catch (error) {
      console.error('GeckoTerminal OHLCV error:', error);
      return [];
    }
  }
};

// ============================================================================
// TRADE PROCESSING
// ============================================================================

const processSwapTransaction = (tx, walletAddress) => {
  if (!tx.events?.swap) return null;
  
  const swap = tx.events.swap;
  const timestamp = tx.timestamp;
  const signature = tx.signature;
  
  // Determine what was bought and sold
  let tokenIn = null;
  let tokenOut = null;
  let amountIn = 0;
  let amountOut = 0;
  
  // Check native SOL transfers
  if (swap.nativeInput) {
    tokenIn = { mint: SOL_MINT, symbol: 'SOL', decimals: 9 };
    amountIn = swap.nativeInput.amount / 1e9;
  }
  if (swap.nativeOutput) {
    tokenOut = { mint: SOL_MINT, symbol: 'SOL', decimals: 9 };
    amountOut = swap.nativeOutput.amount / 1e9;
  }
  
  // Check token inputs
  if (swap.tokenInputs && swap.tokenInputs.length > 0) {
    const input = swap.tokenInputs[0];
    tokenIn = { 
      mint: input.mint, 
      decimals: input.rawTokenAmount?.decimals || 9 
    };
    amountIn = parseFloat(input.rawTokenAmount?.tokenAmount || 0) / Math.pow(10, tokenIn.decimals);
  }
  
  // Check token outputs
  if (swap.tokenOutputs && swap.tokenOutputs.length > 0) {
    const output = swap.tokenOutputs[0];
    tokenOut = { 
      mint: output.mint, 
      decimals: output.rawTokenAmount?.decimals || 9 
    };
    amountOut = parseFloat(output.rawTokenAmount?.tokenAmount || 0) / Math.pow(10, tokenOut.decimals);
  }
  
  if (!tokenIn || !tokenOut) return null;
  
  // Determine if this is a BUY or SELL of a memecoin/token
  // BUY = SOL/USDC in, token out
  // SELL = token in, SOL/USDC out
  const isStableIn = tokenIn.mint === SOL_MINT || STABLES.includes(tokenIn.mint);
  const isStableOut = tokenOut.mint === SOL_MINT || STABLES.includes(tokenOut.mint);
  
  let type, token, stableAmount, tokenAmount;
  
  if (isStableIn && !isStableOut) {
    // BUY: spent SOL/stable to get token
    type = 'BUY';
    token = tokenOut;
    stableAmount = amountIn;
    tokenAmount = amountOut;
  } else if (!isStableIn && isStableOut) {
    // SELL: sold token to get SOL/stable
    type = 'SELL';
    token = tokenIn;
    stableAmount = amountOut;
    tokenAmount = amountIn;
  } else {
    // Token to token swap, skip for now
    return null;
  }
  
  // Calculate price per token
  const pricePerToken = tokenAmount > 0 ? stableAmount / tokenAmount : 0;
  
  return {
    signature,
    timestamp,
    type,
    tokenMint: token.mint,
    tokenAmount,
    stableAmount,
    pricePerToken,
    stableMint: isStableIn ? tokenIn.mint : tokenOut.mint
  };
};

const groupTradesByToken = (trades) => {
  const grouped = {};
  
  trades.forEach(trade => {
    if (!grouped[trade.tokenMint]) {
      grouped[trade.tokenMint] = {
        mint: trade.tokenMint,
        buys: [],
        sells: [],
        symbol: null,
        name: null,
        currentPrice: null,
        pairAddress: null
      };
    }
    
    if (trade.type === 'BUY') {
      grouped[trade.tokenMint].buys.push(trade);
    } else {
      grouped[trade.tokenMint].sells.push(trade);
    }
  });
  
  return grouped;
};

const analyzeToken = async (tokenData) => {
  // Get current price and info from DexScreener
  const priceInfo = await DexScreenerAPI.getTokenPrice(tokenData.mint);
  
  if (priceInfo) {
    tokenData.symbol = priceInfo.symbol;
    tokenData.name = priceInfo.name;
    tokenData.currentPrice = priceInfo.price;
    tokenData.marketCap = priceInfo.marketCap;
    tokenData.pairAddress = priceInfo.pairAddress;
    tokenData.priceChange24h = priceInfo.priceChange24h;
  }
  
  // Calculate totals
  const totalBuyAmount = tokenData.buys.reduce((sum, b) => sum + b.stableAmount, 0);
  const totalBuyTokens = tokenData.buys.reduce((sum, b) => sum + b.tokenAmount, 0);
  const avgBuyPrice = totalBuyTokens > 0 ? totalBuyAmount / totalBuyTokens : 0;
  
  const totalSellAmount = tokenData.sells.reduce((sum, s) => sum + s.stableAmount, 0);
  const totalSellTokens = tokenData.sells.reduce((sum, s) => sum + s.tokenAmount, 0);
  const avgSellPrice = totalSellTokens > 0 ? totalSellAmount / totalSellTokens : 0;
  
  // Calculate realized PnL
  const realizedPnL = totalSellAmount - (totalSellTokens * avgBuyPrice);
  const realizedPnLPercent = totalSellTokens > 0 && avgBuyPrice > 0 
    ? ((avgSellPrice - avgBuyPrice) / avgBuyPrice) * 100 
    : 0;
  
  // Calculate unrealized (if still holding)
  const tokensHeld = totalBuyTokens - totalSellTokens;
  const unrealizedValue = tokensHeld * (tokenData.currentPrice || 0);
  const costBasis = tokensHeld * avgBuyPrice;
  const unrealizedPnL = unrealizedValue - costBasis;
  const unrealizedPnLPercent = costBasis > 0 ? ((unrealizedValue - costBasis) / costBasis) * 100 : 0;
  
  // Get price history for analysis
  let maxPriceAfterBuy = tokenData.currentPrice || 0;
  let minPriceAfterBuy = tokenData.currentPrice || Infinity;
  let maxPriceAfterSell = tokenData.currentPrice || 0;
  
  if (tokenData.pairAddress) {
    const ohlcv = await DexScreenerAPI.getTokenPriceHistory(tokenData.pairAddress);
    
    if (ohlcv.length > 0) {
      const firstBuyTime = tokenData.buys.length > 0 
        ? Math.min(...tokenData.buys.map(b => b.timestamp)) 
        : 0;
      const lastSellTime = tokenData.sells.length > 0 
        ? Math.max(...tokenData.sells.map(s => s.timestamp)) 
        : 0;
      
      ohlcv.forEach(candle => {
        const [ts, open, high, low, close] = candle;
        
        // Track max/min after first buy
        if (ts > firstBuyTime) {
          if (high > maxPriceAfterBuy) maxPriceAfterBuy = high;
          if (low < minPriceAfterBuy) minPriceAfterBuy = low;
        }
        
        // Track max after last sell
        if (lastSellTime > 0 && ts > lastSellTime) {
          if (high > maxPriceAfterSell) maxPriceAfterSell = high;
        }
      });
    }
  }
  
  // Calculate what was missed
  const maxGainPossible = avgBuyPrice > 0 ? ((maxPriceAfterBuy - avgBuyPrice) / avgBuyPrice) * 100 : 0;
  const maxDrawdown = avgBuyPrice > 0 ? ((minPriceAfterBuy - avgBuyPrice) / avgBuyPrice) * 100 : 0;
  
  // If sold, calculate missed gains
  let missedGains = 0;
  let missedGainsPercent = 0;
  if (tokenData.sells.length > 0 && avgSellPrice > 0) {
    missedGains = (maxPriceAfterSell - avgSellPrice) * totalSellTokens;
    missedGainsPercent = ((maxPriceAfterSell - avgSellPrice) / avgSellPrice) * 100;
  }
  
  // Check for roundtrip (bought, went up, came back down)
  const isRoundtrip = tokensHeld > 0 && 
    maxPriceAfterBuy > avgBuyPrice * 1.5 && 
    tokenData.currentPrice < avgBuyPrice;
  
  return {
    ...tokenData,
    totalBuyAmount,
    totalBuyTokens,
    avgBuyPrice,
    totalSellAmount,
    totalSellTokens,
    avgSellPrice,
    realizedPnL,
    realizedPnLPercent,
    tokensHeld,
    unrealizedValue,
    unrealizedPnL,
    unrealizedPnLPercent,
    maxPriceAfterBuy,
    minPriceAfterBuy: minPriceAfterBuy === Infinity ? 0 : minPriceAfterBuy,
    maxPriceAfterSell,
    maxGainPossible,
    maxDrawdown,
    missedGains,
    missedGainsPercent,
    isRoundtrip,
    status: tokensHeld > 0.001 ? 'HOLDING' : 'CLOSED'
  };
};

// ============================================================================
// COMPONENTS
// ============================================================================

const ApiKeyInput = ({ apiKey, setApiKey }) => (
  <div className="mb-6 p-4 bg-orange-500/10 border border-orange-500/30 rounded-xl">
    <div className="flex items-center gap-2 mb-2">
      <span className="text-orange-400">🔑</span>
      <h3 className="text-orange-400 font-medium">Helius API Key Required</h3>
    </div>
    <p className="text-sm text-gray-400 mb-3">
      Get a free API key at <a href="https://helius.dev" target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline">helius.dev</a>
    </p>
    <input
      type="password"
      value={apiKey}
      onChange={(e) => setApiKey(e.target.value)}
      placeholder="Enter your Helius API key..."
      className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-lg text-white mono text-sm outline-none focus:border-orange-500/50"
    />
  </div>
);

const WalletInput = ({ wallet, setWallet, onAnalyze, loading }) => (
  <div className="flex gap-2 mb-6">
    <input
      type="text"
      value={wallet}
      onChange={(e) => setWallet(e.target.value)}
      placeholder="Enter Solana wallet address..."
      className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white mono text-sm outline-none focus:border-emerald-500/50"
    />
    <button
      onClick={onAnalyze}
      disabled={loading || !wallet}
      className="px-8 py-3 bg-gradient-to-r from-emerald-400 to-cyan-400 text-black font-semibold rounded-lg hover:shadow-lg hover:shadow-emerald-500/30 transition-all disabled:opacity-50"
    >
      {loading ? '⏳ Analyzing...' : '🔍 Analyze'}
    </button>
  </div>
);

const StatsOverview = ({ tokens }) => {
  const totalInvested = tokens.reduce((sum, t) => sum + t.totalBuyAmount, 0);
  const totalRealized = tokens.reduce((sum, t) => sum + t.realizedPnL, 0);
  const totalUnrealized = tokens.reduce((sum, t) => sum + t.unrealizedPnL, 0);
  const totalMissed = tokens.reduce((sum, t) => sum + (t.missedGains > 0 ? t.missedGains : 0), 0);
  
  const winners = tokens.filter(t => t.realizedPnL > 0 || t.unrealizedPnL > 0).length;
  const winRate = tokens.length > 0 ? (winners / tokens.length) * 100 : 0;
  
  const roundtrips = tokens.filter(t => t.isRoundtrip).length;
  
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
      {[
        { label: 'Tokens Traded', value: tokens.length },
        { label: 'Total Invested', value: formatNumber(totalInvested) },
        { label: 'Realized P&L', value: formatNumber(totalRealized), color: totalRealized >= 0 ? 'text-emerald-400' : 'text-pink-500' },
        { label: 'Unrealized P&L', value: formatNumber(totalUnrealized), color: totalUnrealized >= 0 ? 'text-emerald-400' : 'text-pink-500' },
        { label: 'Missed Gains', value: formatNumber(totalMissed), color: 'text-orange-400' },
        { label: 'Roundtrips', value: roundtrips, color: 'text-pink-500' },
      ].map((stat, i) => (
        <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
          <span className={`mono text-xl font-bold block mb-1 ${stat.color || 'text-white'}`}>{stat.value}</span>
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">{stat.label}</span>
        </div>
      ))}
    </div>
  );
};

const TokenCard = ({ token }) => {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <div className={`bg-white/5 border rounded-xl overflow-hidden transition-all hover:border-white/20 ${
      token.isRoundtrip ? 'border-pink-500/50 border-l-2 border-l-pink-500' :
      token.status === 'HOLDING' ? 'border-emerald-500/30 border-l-2 border-l-emerald-400' :
      'border-white/10 border-l-2 border-l-gray-600'
    }`}>
      {/* Header */}
      <div 
        className="px-5 py-4 flex justify-between items-center cursor-pointer hover:bg-white/5"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div>
            <span className="text-lg font-semibold text-white">{token.symbol || shortenAddress(token.mint)}</span>
            {token.name && <span className="text-xs text-gray-500 ml-2">{token.name}</span>}
          </div>
          <span className={`text-xs px-2 py-1 rounded-full ${
            token.isRoundtrip ? 'text-pink-400 bg-pink-500/10' :
            token.status === 'HOLDING' ? 'text-emerald-400 bg-emerald-500/10' : 
            'text-gray-500 bg-white/5'
          }`}>
            {token.isRoundtrip ? '🔄 Roundtrip' : token.status === 'HOLDING' ? '🟢 Holding' : '⚫ Closed'}
          </span>
        </div>
        
        <div className="flex items-center gap-6">
          {/* Total P&L */}
          <div className="text-right">
            <span className={`mono text-lg font-semibold ${
              (token.realizedPnL + token.unrealizedPnL) >= 0 ? 'text-emerald-400' : 'text-pink-500'
            }`}>
              {formatNumber(token.realizedPnL + token.unrealizedPnL)}
            </span>
            <span className="text-xs text-gray-500 block">
              {formatPercent(token.status === 'HOLDING' ? token.unrealizedPnLPercent : token.realizedPnLPercent)}
            </span>
          </div>
          
          {/* Missed gains indicator */}
          {token.missedGainsPercent > 10 && (
            <div className="text-right">
              <span className="mono text-sm text-orange-400">+{formatPercent(token.missedGainsPercent)}</span>
              <span className="text-[10px] text-gray-600 block">missed</span>
            </div>
          )}
          
          <span className="text-gray-600">{expanded ? '▼' : '▶'}</span>
        </div>
      </div>
      
      {/* Expanded Details */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-white/5">
          {/* Price Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-4">
            <div>
              <span className="text-[10px] text-gray-600 uppercase block mb-1">Avg Buy Price</span>
              <span className="mono text-sm text-white">{formatPrice(token.avgBuyPrice)}</span>
            </div>
            <div>
              <span className="text-[10px] text-gray-600 uppercase block mb-1">Current Price</span>
              <span className="mono text-sm text-white">{formatPrice(token.currentPrice)}</span>
            </div>
            <div>
              <span className="text-[10px] text-gray-600 uppercase block mb-1">Highest After Buy</span>
              <span className="mono text-sm text-emerald-400">{formatPrice(token.maxPriceAfterBuy)}</span>
              <span className="text-[10px] text-gray-500 ml-1">{formatPercent(token.maxGainPossible)}</span>
            </div>
            <div>
              <span className="text-[10px] text-gray-600 uppercase block mb-1">Lowest After Buy</span>
              <span className="mono text-sm text-pink-500">{formatPrice(token.minPriceAfterBuy)}</span>
              <span className="text-[10px] text-gray-500 ml-1">{formatPercent(token.maxDrawdown)}</span>
            </div>
          </div>
          
          {/* Trade Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-4 border-t border-white/5">
            <div>
              <span className="text-[10px] text-gray-600 uppercase block mb-1">Total Invested</span>
              <span className="mono text-sm text-white">{formatNumber(token.totalBuyAmount)}</span>
            </div>
            <div>
              <span className="text-[10px] text-gray-600 uppercase block mb-1">Tokens Bought</span>
              <span className="mono text-sm text-white">{token.totalBuyTokens.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-[10px] text-gray-600 uppercase block mb-1">Total Sold</span>
              <span className="mono text-sm text-white">{formatNumber(token.totalSellAmount)}</span>
            </div>
            <div>
              <span className="text-[10px] text-gray-600 uppercase block mb-1">Tokens Held</span>
              <span className="mono text-sm text-white">{token.tokensHeld.toLocaleString()}</span>
            </div>
          </div>
          
          {/* Sell Analysis */}
          {token.sells.length > 0 && (
            <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-4 my-4">
              <h4 className="text-sm text-cyan-400 mb-3">📊 Sell Analysis</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <span className="text-[10px] text-gray-600 uppercase block mb-1">Avg Sell Price</span>
                  <span className="mono text-lg font-semibold text-white">{formatPrice(token.avgSellPrice)}</span>
                </div>
                <div className="text-center">
                  <span className="text-[10px] text-gray-600 uppercase block mb-1">Realized P&L</span>
                  <span className={`mono text-lg font-semibold ${token.realizedPnL >= 0 ? 'text-emerald-400' : 'text-pink-500'}`}>
                    {formatNumber(token.realizedPnL)}
                  </span>
                </div>
                <div className="text-center">
                  <span className="text-[10px] text-gray-600 uppercase block mb-1">Max After Sell</span>
                  <span className="mono text-lg font-semibold text-orange-400">{formatPrice(token.maxPriceAfterSell)}</span>
                </div>
                <div className="text-center">
                  <span className="text-[10px] text-gray-600 uppercase block mb-1">Missed Gains</span>
                  <span className="mono text-lg font-semibold text-orange-400">
                    {token.missedGainsPercent > 0 ? `+${formatPercent(token.missedGainsPercent)}` : '-'}
                  </span>
                </div>
              </div>
            </div>
          )}
          
          {/* Roundtrip Warning */}
          {token.isRoundtrip && (
            <div className="bg-pink-500/10 border border-pink-500/20 rounded-lg p-4 my-4">
              <h4 className="text-sm text-pink-400 mb-2">🔄 Roundtrip Alert</h4>
              <p className="text-sm text-gray-400">
                This token went up <span className="text-emerald-400 font-semibold">{formatPercent(token.maxGainPossible)}</span> after your buy, 
                but is now <span className="text-pink-400 font-semibold">{formatPercent(token.unrealizedPnLPercent)}</span> from your entry.
                You could have taken profits at {formatPrice(token.maxPriceAfterBuy)}.
              </p>
            </div>
          )}
          
          {/* Trade History */}
          <div className="mt-4">
            <h4 className="text-sm text-gray-500 mb-2">Trade History</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {[...token.buys, ...token.sells]
                .sort((a, b) => b.timestamp - a.timestamp)
                .map((trade, i) => (
                  <div key={i} className="flex justify-between items-center text-sm px-3 py-2 bg-black/30 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className={trade.type === 'BUY' ? 'text-emerald-400' : 'text-pink-400'}>
                        {trade.type === 'BUY' ? '🟢' : '🔴'} {trade.type}
                      </span>
                      <span className="text-gray-500 mono">{timeAgo(trade.timestamp)}</span>
                    </div>
                    <div className="text-right">
                      <span className="mono text-white">{trade.tokenAmount.toLocaleString()} @ {formatPrice(trade.pricePerToken)}</span>
                      <span className="text-gray-500 ml-2">{formatNumber(trade.stableAmount)}</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
          
          {/* Links */}
          <div className="flex gap-2 mt-4">
            <a 
              href={`https://dexscreener.com/solana/${token.mint}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 border border-white/10 rounded-lg text-gray-400 text-sm hover:bg-white/5 hover:text-cyan-400 transition-all"
            >
              📈 DexScreener
            </a>
            <a 
              href={`https://solscan.io/token/${token.mint}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 border border-white/10 rounded-lg text-gray-400 text-sm hover:bg-white/5 hover:text-cyan-400 transition-all"
            >
              🔍 Solscan
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// MAIN APP
// ============================================================================

export default function WalletAnalyzer() {
  const [apiKey, setApiKey] = useState('');
  const [wallet, setWallet] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [sortBy, setSortBy] = useState('pnl');
  
  // Load saved API key
  useEffect(() => {
    const saved = localStorage.getItem('helius-api-key');
    if (saved) setApiKey(saved);
  }, []);
  
  // Save API key
  useEffect(() => {
    if (apiKey) localStorage.setItem('helius-api-key', apiKey);
  }, [apiKey]);
  
  const analyzeWallet = async () => {
    if (!apiKey || !wallet) return;
    
    setLoading(true);
    setError(null);
    setTokens([]);
    setProgress('Fetching transactions from Helius...');
    
    try {
      // Fetch swap transactions
      const transactions = await HeliusAPI.getSwapTransactions(wallet, apiKey, 100);
      setProgress(`Found ${transactions.length} swap transactions. Processing...`);
      
      // Process transactions
      const trades = transactions
        .map(tx => processSwapTransaction(tx, wallet))
        .filter(t => t !== null);
      
      setProgress(`Processed ${trades.length} trades. Grouping by token...`);
      
      // Group by token
      const grouped = groupTradesByToken(trades);
      const tokenList = Object.values(grouped);
      
      setProgress(`Found ${tokenList.length} unique tokens. Fetching price data...`);
      
      // Analyze each token (with rate limiting)
      const analyzed = [];
      for (let i = 0; i < tokenList.length; i++) {
        setProgress(`Analyzing ${i + 1}/${tokenList.length}: ${tokenList[i].mint.slice(0, 8)}...`);
        const result = await analyzeToken(tokenList[i]);
        analyzed.push(result);
        // Small delay to avoid rate limits
        await new Promise(r => setTimeout(r, 200));
      }
      
      setTokens(analyzed);
      setProgress('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  // Sort tokens
  const sortedTokens = [...tokens].sort((a, b) => {
    switch (sortBy) {
      case 'pnl':
        return (b.realizedPnL + b.unrealizedPnL) - (a.realizedPnL + a.unrealizedPnL);
      case 'missed':
        return b.missedGainsPercent - a.missedGainsPercent;
      case 'invested':
        return b.totalBuyAmount - a.totalBuyAmount;
      case 'recent':
        const aTime = Math.max(...a.buys.map(b => b.timestamp), ...a.sells.map(s => s.timestamp));
        const bTime = Math.max(...b.buys.map(b => b.timestamp), ...b.sells.map(s => s.timestamp));
        return bTime - aTime;
      default:
        return 0;
    }
  });
  
  return (
    <div className="min-h-screen p-5">
      <header className="text-center py-8 border-b border-white/5 mb-8">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-emerald-400 via-cyan-400 to-fuchsia-500 bg-clip-text text-transparent mb-2">
          Sol Tracker
        </h1>
        <p className="text-gray-500 mono text-sm">Wallet Trade Analyzer • Powered by Helius & DexScreener</p>
      </header>
      
      <main className="max-w-6xl mx-auto">
        {/* API Key Input */}
        {!apiKey && <ApiKeyInput apiKey={apiKey} setApiKey={setApiKey} />}
        
        {apiKey && (
          <div className="mb-4 flex justify-between items-center">
            <span className="text-sm text-gray-500">🔑 API Key: {apiKey.slice(0, 8)}...</span>
            <button 
              onClick={() => setApiKey('')}
              className="text-xs text-gray-500 hover:text-pink-400"
            >
              Change Key
            </button>
          </div>
        )}
        
        {/* Wallet Input */}
        <WalletInput 
          wallet={wallet} 
          setWallet={setWallet} 
          onAnalyze={analyzeWallet}
          loading={loading}
        />
        
        {/* Progress */}
        {progress && (
          <div className="mb-6 p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-xl">
            <p className="text-cyan-400 text-sm mono">{progress}</p>
          </div>
        )}
        
        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-pink-500/10 border border-pink-500/30 rounded-xl">
            <p className="text-pink-400 text-sm">❌ {error}</p>
          </div>
        )}
        
        {/* Results */}
        {tokens.length > 0 && (
          <>
            <StatsOverview tokens={tokens} />
            
            {/* Sort Controls */}
            <div className="flex gap-2 mb-4 flex-wrap">
              <span className="text-gray-500 text-sm py-2">Sort by:</span>
              {[
                { key: 'pnl', label: 'P&L' },
                { key: 'missed', label: 'Missed Gains' },
                { key: 'invested', label: 'Invested' },
                { key: 'recent', label: 'Recent' },
              ].map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setSortBy(opt.key)}
                  className={`px-4 py-2 rounded-lg text-sm transition-all ${
                    sortBy === opt.key 
                      ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400'
                      : 'bg-white/5 border border-white/10 text-gray-500 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            
            {/* Token List */}
            <div className="space-y-4">
              {sortedTokens.map(token => (
                <TokenCard key={token.mint} token={token} />
              ))}
            </div>
          </>
        )}
        
        {/* Empty State */}
        {!loading && tokens.length === 0 && wallet && !error && (
          <div className="text-center py-16 text-gray-500">
            <div className="text-6xl mb-5">🔍</div>
            <h3 className="text-lg text-gray-400 mb-2">Enter a wallet to analyze</h3>
            <p className="text-sm">We&apos;ll fetch your swap history and show you what you missed.</p>
          </div>
        )}
      </main>
      
      <footer className="text-center py-8 mt-12 border-t border-white/5">
        <p className="text-gray-600 text-sm">Powered by Helius API, DexScreener & GeckoTerminal</p>
      </footer>
    </div>
  );
}
