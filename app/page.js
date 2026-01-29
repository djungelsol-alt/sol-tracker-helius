'use client';

import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart } from 'recharts';

// ============================================================================
// CONFIGURATION
// ============================================================================

const API_CONFIG = {
  dexscreener: {
    baseUrl: 'https://api.dexscreener.com',
  },
  geckoterminal: {
    baseUrl: 'https://api.geckoterminal.com/api/v2',
  }
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const formatNumber = (num, decimals = 2) => {
  if (num === null || num === undefined) return '-';
  if (num >= 1e9) return `$${(num / 1e9).toFixed(decimals)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(decimals)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(decimals)}K`;
  return `$${num.toFixed(decimals)}`;
};

const formatPrice = (price) => {
  if (!price) return '-';
  if (price < 0.00001) return `$${price.toExponential(4)}`;
  if (price < 0.01) return `$${price.toFixed(8)}`;
  if (price < 1) return `$${price.toFixed(6)}`;
  return `$${price.toFixed(4)}`;
};

const formatPercent = (pct) => {
  if (pct === null || pct === undefined) return '-';
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
};

// ============================================================================
// API SERVICES
// ============================================================================

const DexScreenerAPI = {
  async searchToken(query) {
    try {
      const response = await fetch(
        `${API_CONFIG.dexscreener.baseUrl}/latest/dex/search?q=${encodeURIComponent(query)}`
      );
      const data = await response.json();
      return data.pairs || [];
    } catch (error) {
      console.error('DexScreener search error:', error);
      return [];
    }
  },

  async getTokenPairs(chainId, tokenAddress) {
    try {
      const response = await fetch(
        `${API_CONFIG.dexscreener.baseUrl}/token-pairs/v1/${chainId}/${tokenAddress}`
      );
      const data = await response.json();
      return data || [];
    } catch (error) {
      console.error('DexScreener token pairs error:', error);
      return [];
    }
  },
};

const GeckoTerminalAPI = {
  async getOHLCV(network, poolAddress, timeframe = 'hour', aggregate = 1, limit = 100) {
    try {
      const response = await fetch(
        `${API_CONFIG.geckoterminal.baseUrl}/networks/${network}/pools/${poolAddress}/ohlcv/${timeframe}?aggregate=${aggregate}&limit=${limit}&currency=usd`
      );
      const data = await response.json();
      return data.data?.attributes?.ohlcv_list || [];
    } catch (error) {
      console.error('GeckoTerminal OHLCV error:', error);
      return [];
    }
  },
};

// ============================================================================
// TRADE ANALYSIS
// ============================================================================

const analyzeTradePerformance = async (trade) => {
  const { poolAddress, buyTimestamp, sellTimestamp, buyPrice } = trade;
  
  const ohlcvData = await GeckoTerminalAPI.getOHLCV('solana', poolAddress, 'hour', 1, 1000);
  
  if (!ohlcvData.length) {
    return { ...trade, analysis: null };
  }

  const buyTime = new Date(buyTimestamp).getTime();
  const sellTime = sellTimestamp ? new Date(sellTimestamp).getTime() : Date.now();
  
  const relevantCandles = ohlcvData.filter(candle => {
    const candleTime = candle[0] * 1000;
    return candleTime >= buyTime && candleTime <= sellTime;
  });

  if (!relevantCandles.length) {
    return { ...trade, analysis: null };
  }

  let minPrice = Infinity;
  let maxPrice = -Infinity;
  let minTimestamp = null;
  let maxTimestamp = null;

  relevantCandles.forEach(candle => {
    const [ts, open, high, low, close] = candle;
    if (low < minPrice) {
      minPrice = low;
      minTimestamp = ts * 1000;
    }
    if (high > maxPrice) {
      maxPrice = high;
      maxTimestamp = ts * 1000;
    }
  });

  const pnlPercent = trade.sellPrice ? ((trade.sellPrice - buyPrice) / buyPrice) * 100 : null;
  const maxGainPercent = ((maxPrice - buyPrice) / buyPrice) * 100;
  const maxDrawdownPercent = ((minPrice - buyPrice) / buyPrice) * 100;
  const capturedPercent = pnlPercent !== null && maxGainPercent > 0 ? (pnlPercent / maxGainPercent) * 100 : null;

  return {
    ...trade,
    analysis: {
      minPrice,
      maxPrice,
      minTimestamp,
      maxTimestamp,
      pnlPercent,
      maxGainPercent,
      maxDrawdownPercent,
      capturedPercent,
      candleCount: relevantCandles.length
    }
  };
};

// ============================================================================
// COMPONENTS
// ============================================================================

const TokenSearch = ({ onSelect }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    const pairs = await DexScreenerAPI.searchToken(query);
    const solanaPairs = pairs.filter(p => p.chainId === 'solana');
    setResults(solanaPairs.slice(0, 10));
    setLoading(false);
  };

  return (
    <div className="mb-5">
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search token name or paste address..."
          className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white mono text-sm outline-none focus:border-emerald-500/50 transition-all"
        />
        <button 
          onClick={handleSearch} 
          disabled={loading} 
          className="px-6 py-3 bg-gradient-to-r from-emerald-400 to-cyan-400 text-black font-semibold rounded-lg hover:shadow-lg hover:shadow-emerald-500/30 transition-all disabled:opacity-50"
        >
          {loading ? '...' : 'Search'}
        </button>
      </div>
      
      {results.length > 0 && (
        <div className="mt-2 bg-white/5 border border-white/10 rounded-lg overflow-hidden">
          {results.map((pair, idx) => (
            <div 
              key={idx} 
              className="px-4 py-3 border-b border-white/5 last:border-b-0 cursor-pointer hover:bg-emerald-500/10 transition-all flex justify-between items-center"
              onClick={() => {
                onSelect(pair);
                setResults([]);
                setQuery('');
              }}
            >
              <div className="flex flex-col gap-0.5">
                <span className="font-semibold text-white">{pair.baseToken.symbol}</span>
                <span className="text-xs text-gray-500">{pair.baseToken.name}</span>
              </div>
              <div className="flex gap-4 mono text-xs">
                <span className="text-emerald-400">{formatPrice(parseFloat(pair.priceUsd))}</span>
                <span className="text-gray-500">{formatNumber(pair.marketCap)}</span>
                <span className="text-gray-600 uppercase text-[10px]">{pair.dexId}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const TradeInputForm = ({ selectedToken, onAddTrade }) => {
  const [formData, setFormData] = useState({
    buyPrice: '',
    buyAmount: '',
    buyMarketCap: '',
    buyTimestamp: new Date().toISOString().slice(0, 16),
    sellPrice: '',
    sellAmount: '',
    sellTimestamp: '',
    notes: ''
  });

  useEffect(() => {
    if (selectedToken) {
      setFormData(prev => ({
        ...prev,
        buyPrice: selectedToken.priceUsd || '',
        buyMarketCap: selectedToken.marketCap || ''
      }));
    }
  }, [selectedToken]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedToken) return;

    const trade = {
      id: Date.now(),
      tokenAddress: selectedToken.baseToken.address,
      tokenSymbol: selectedToken.baseToken.symbol,
      tokenName: selectedToken.baseToken.name,
      poolAddress: selectedToken.pairAddress,
      dexId: selectedToken.dexId,
      chainId: selectedToken.chainId,
      buyPrice: parseFloat(formData.buyPrice),
      buyAmount: parseFloat(formData.buyAmount),
      buyMarketCap: parseFloat(formData.buyMarketCap),
      buyTimestamp: formData.buyTimestamp,
      sellPrice: formData.sellPrice ? parseFloat(formData.sellPrice) : null,
      sellAmount: formData.sellAmount ? parseFloat(formData.sellAmount) : null,
      sellTimestamp: formData.sellTimestamp || null,
      notes: formData.notes,
      status: formData.sellPrice ? 'closed' : 'open',
      createdAt: new Date().toISOString()
    };

    onAddTrade(trade);
    setFormData({
      buyPrice: '',
      buyAmount: '',
      buyMarketCap: '',
      buyTimestamp: new Date().toISOString().slice(0, 16),
      sellPrice: '',
      sellAmount: '',
      sellTimestamp: '',
      notes: ''
    });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white/5 border border-white/10 rounded-xl p-6">
      <div className="flex justify-between items-center mb-5">
        <h3 className="text-lg font-semibold text-white">Log Trade</h3>
        {selectedToken && (
          <div className="flex gap-2 items-center px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-full">
            <span className="font-semibold text-emerald-400">{selectedToken.baseToken.symbol}</span>
            <span className="mono text-sm text-gray-500">{formatPrice(parseFloat(selectedToken.priceUsd))}</span>
          </div>
        )}
      </div>
      
      <div className="mb-5">
        <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-3">Buy Details</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-gray-500">Buy Price (USD)</label>
            <input
              type="number"
              step="any"
              value={formData.buyPrice}
              onChange={(e) => setFormData({ ...formData, buyPrice: e.target.value })}
              required
              className="px-3 py-2.5 bg-black/30 border border-white/10 rounded-lg text-white mono text-sm outline-none focus:border-emerald-500/50"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-gray-500">Amount (USD)</label>
            <input
              type="number"
              step="any"
              value={formData.buyAmount}
              onChange={(e) => setFormData({ ...formData, buyAmount: e.target.value })}
              required
              className="px-3 py-2.5 bg-black/30 border border-white/10 rounded-lg text-white mono text-sm outline-none focus:border-emerald-500/50"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-gray-500">Market Cap at Buy</label>
            <input
              type="number"
              step="any"
              value={formData.buyMarketCap}
              onChange={(e) => setFormData({ ...formData, buyMarketCap: e.target.value })}
              className="px-3 py-2.5 bg-black/30 border border-white/10 rounded-lg text-white mono text-sm outline-none focus:border-emerald-500/50"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-gray-500">Buy Time</label>
            <input
              type="datetime-local"
              value={formData.buyTimestamp}
              onChange={(e) => setFormData({ ...formData, buyTimestamp: e.target.value })}
              required
              className="px-3 py-2.5 bg-black/30 border border-white/10 rounded-lg text-white mono text-sm outline-none focus:border-emerald-500/50"
            />
          </div>
        </div>
      </div>

      <div className="mb-5">
        <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-3">Sell Details (Optional)</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-gray-500">Sell Price (USD)</label>
            <input
              type="number"
              step="any"
              value={formData.sellPrice}
              onChange={(e) => setFormData({ ...formData, sellPrice: e.target.value })}
              className="px-3 py-2.5 bg-black/30 border border-white/10 rounded-lg text-white mono text-sm outline-none focus:border-emerald-500/50"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-gray-500">Sell Time</label>
            <input
              type="datetime-local"
              value={formData.sellTimestamp}
              onChange={(e) => setFormData({ ...formData, sellTimestamp: e.target.value })}
              className="px-3 py-2.5 bg-black/30 border border-white/10 rounded-lg text-white mono text-sm outline-none focus:border-emerald-500/50"
            />
          </div>
        </div>
      </div>

      <div className="mb-5">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-gray-500">Notes</label>
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Trade notes, thesis, etc..."
            className="px-3 py-2.5 bg-black/30 border border-white/10 rounded-lg text-white mono text-sm outline-none focus:border-emerald-500/50 min-h-[80px] resize-y"
          />
        </div>
      </div>

      <button 
        type="submit" 
        className="w-full py-4 bg-gradient-to-r from-emerald-400 to-cyan-400 text-black font-semibold rounded-lg hover:shadow-lg hover:shadow-emerald-500/30 transition-all disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed disabled:shadow-none"
        disabled={!selectedToken}
      >
        {selectedToken ? 'Add Trade' : 'Select a token first'}
      </button>
    </form>
  );
};

const TradeCard = ({ trade, onUpdate, onDelete }) => {
  const [expanded, setExpanded] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [currentPrice, setCurrentPrice] = useState(null);

  useEffect(() => {
    if (trade.status === 'open') {
      const fetchPrice = async () => {
        const pairs = await DexScreenerAPI.getTokenPairs('solana', trade.tokenAddress);
        if (pairs.length > 0) {
          setCurrentPrice(parseFloat(pairs[0].priceUsd));
        }
      };
      fetchPrice();
      const interval = setInterval(fetchPrice, 30000);
      return () => clearInterval(interval);
    }
  }, [trade]);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    const analyzed = await analyzeTradePerformance(trade);
    onUpdate(analyzed);
    setAnalyzing(false);
  };

  const pnl = trade.sellPrice 
    ? ((trade.sellPrice - trade.buyPrice) / trade.buyPrice) * 100
    : currentPrice 
      ? ((currentPrice - trade.buyPrice) / trade.buyPrice) * 100
      : null;

  return (
    <div className={`bg-white/5 border border-white/10 rounded-xl overflow-hidden transition-all hover:border-white/20 ${trade.status === 'open' ? 'border-l-2 border-l-emerald-400' : 'border-l-2 border-l-gray-600'}`}>
      <div 
        className="px-5 py-4 flex justify-between items-center cursor-pointer hover:bg-white/5 transition-all"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold text-white">{trade.tokenSymbol}</span>
          <span className={`text-xs px-2 py-1 rounded-full ${trade.status === 'open' ? 'text-emerald-400 bg-emerald-500/10' : 'text-gray-500 bg-white/5'}`}>
            {trade.status === 'open' ? '🟢 Open' : '⚫ Closed'}
          </span>
        </div>
        <div className="flex items-center gap-4">
          {pnl !== null && (
            <span className={`mono text-lg font-semibold ${pnl >= 0 ? 'text-emerald-400' : 'text-pink-500'}`}>
              {formatPercent(pnl)}
            </span>
          )}
          <span className="text-gray-600 text-sm">{expanded ? '▼' : '▶'}</span>
        </div>
      </div>

      {expanded && (
        <div className="px-5 pb-5 border-t border-white/5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-5">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-gray-600 uppercase tracking-wider">Buy Price</span>
              <span className="mono text-sm text-white">{formatPrice(trade.buyPrice)}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-gray-600 uppercase tracking-wider">Buy Amount</span>
              <span className="mono text-sm text-white">{formatNumber(trade.buyAmount)}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-gray-600 uppercase tracking-wider">Buy MCap</span>
              <span className="mono text-sm text-white">{formatNumber(trade.buyMarketCap)}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-gray-600 uppercase tracking-wider">Buy Time</span>
              <span className="mono text-sm text-white">{new Date(trade.buyTimestamp).toLocaleString()}</span>
            </div>
            
            {trade.sellPrice && (
              <>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-gray-600 uppercase tracking-wider">Sell Price</span>
                  <span className="mono text-sm text-white">{formatPrice(trade.sellPrice)}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-gray-600 uppercase tracking-wider">Sell Time</span>
                  <span className="mono text-sm text-white">{trade.sellTimestamp ? new Date(trade.sellTimestamp).toLocaleString() : '-'}</span>
                </div>
              </>
            )}

            {trade.status === 'open' && currentPrice && (
              <div className="flex flex-col gap-1 bg-emerald-500/10 p-2 rounded-lg">
                <span className="text-[10px] text-gray-600 uppercase tracking-wider">Current Price</span>
                <span className="mono text-sm text-white">{formatPrice(currentPrice)}</span>
              </div>
            )}
          </div>

          {trade.analysis && (
            <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-5 my-4">
              <h4 className="text-sm mb-4 text-cyan-400">📊 Performance Analysis</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                <div className="text-center">
                  <span className="text-[10px] text-gray-600 uppercase block mb-1">Max Price</span>
                  <span className="mono text-lg font-semibold text-emerald-400 block">{formatPrice(trade.analysis.maxPrice)}</span>
                  <span className="text-xs text-gray-500 mono">{formatPercent(trade.analysis.maxGainPercent)}</span>
                </div>
                <div className="text-center">
                  <span className="text-[10px] text-gray-600 uppercase block mb-1">Min Price</span>
                  <span className="mono text-lg font-semibold text-pink-500 block">{formatPrice(trade.analysis.minPrice)}</span>
                  <span className="text-xs text-gray-500 mono">{formatPercent(trade.analysis.maxDrawdownPercent)}</span>
                </div>
                {trade.analysis.pnlPercent !== null && (
                  <div className="text-center">
                    <span className="text-[10px] text-gray-600 uppercase block mb-1">Realized P&L</span>
                    <span className={`mono text-lg font-semibold block ${trade.analysis.pnlPercent >= 0 ? 'text-emerald-400' : 'text-pink-500'}`}>
                      {formatPercent(trade.analysis.pnlPercent)}
                    </span>
                  </div>
                )}
                {trade.analysis.capturedPercent !== null && (
                  <div className="text-center">
                    <span className="text-[10px] text-gray-600 uppercase block mb-1">% Max Captured</span>
                    <span className="mono text-lg font-semibold text-white block">{formatPercent(trade.analysis.capturedPercent)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {trade.notes && (
            <div className="bg-white/5 rounded-lg p-4 my-4">
              <h4 className="text-xs text-gray-500 mb-2">📝 Notes</h4>
              <p className="text-sm text-gray-300">{trade.notes}</p>
            </div>
          )}

          <div className="flex gap-2 mt-4">
            <button 
              onClick={handleAnalyze} 
              disabled={analyzing} 
              className="px-4 py-2 border border-white/10 rounded-lg text-gray-400 text-sm hover:bg-white/5 hover:text-cyan-400 hover:border-cyan-500/50 transition-all disabled:opacity-50"
            >
              {analyzing ? 'Analyzing...' : '📈 Analyze'}
            </button>
            <button 
              onClick={() => onDelete(trade.id)} 
              className="px-4 py-2 border border-white/10 rounded-lg text-gray-400 text-sm hover:bg-white/5 hover:text-pink-500 hover:border-pink-500/50 transition-all"
            >
              🗑️ Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const StatsDashboard = ({ trades }) => {
  const closedTrades = trades.filter(t => t.status === 'closed');
  const openTrades = trades.filter(t => t.status === 'open');
  
  const totalTrades = trades.length;
  const winners = closedTrades.filter(t => t.sellPrice > t.buyPrice).length;
  const winRate = closedTrades.length > 0 ? (winners / closedTrades.length) * 100 : 0;
  
  const totalInvested = trades.reduce((sum, t) => sum + (t.buyAmount || 0), 0);
  
  const avgPnl = closedTrades.length > 0
    ? closedTrades.reduce((sum, t) => sum + ((t.sellPrice - t.buyPrice) / t.buyPrice * 100), 0) / closedTrades.length
    : 0;

  const stats = [
    { label: 'Total Trades', value: totalTrades },
    { label: 'Open', value: openTrades.length },
    { label: 'Closed', value: closedTrades.length },
    { label: 'Win Rate', value: `${winRate.toFixed(1)}%`, highlight: winRate >= 50 },
    { label: 'Avg P&L', value: formatPercent(avgPnl), highlight: avgPnl >= 0 },
    { label: 'Invested', value: formatNumber(totalInvested) },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
      {stats.map((stat, i) => (
        <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-5 text-center">
          <span className={`mono text-2xl font-bold block mb-1 ${stat.highlight === true ? 'text-emerald-400' : stat.highlight === false ? 'text-pink-500' : 'text-white'}`}>
            {stat.value}
          </span>
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">{stat.label}</span>
        </div>
      ))}
    </div>
  );
};

// ============================================================================
// MAIN APP
// ============================================================================

export default function SolanaWalletTracker() {
  const [trades, setTrades] = useState([]);
  const [selectedToken, setSelectedToken] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');

  useEffect(() => {
    const saved = localStorage.getItem('solana-wallet-trades');
    if (saved) {
      try {
        setTrades(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load trades:', e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('solana-wallet-trades', JSON.stringify(trades));
  }, [trades]);

  const handleAddTrade = (trade) => {
    setTrades(prev => [trade, ...prev]);
    setSelectedToken(null);
  };

  const handleUpdateTrade = (updatedTrade) => {
    setTrades(prev => prev.map(t => t.id === updatedTrade.id ? updatedTrade : t));
  };

  const handleDeleteTrade = (tradeId) => {
    if (window.confirm('Delete this trade?')) {
      setTrades(prev => prev.filter(t => t.id !== tradeId));
    }
  };

  return (
    <div className="min-h-screen p-5">
      <header className="text-center py-8 border-b border-white/5 mb-8">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-emerald-400 via-cyan-400 to-fuchsia-500 bg-clip-text text-transparent mb-2">
          Solana Wallet Tracker
        </h1>
        <p className="text-gray-500 mono text-sm">Track trades • Analyze performance • Monitor post-sell</p>
      </header>

      <nav className="flex gap-2 justify-center mb-8">
        {['dashboard', 'new-trade', 'api-info'].map(tab => (
          <button
            key={tab}
            className={`px-6 py-3 rounded-lg font-medium transition-all ${
              activeTab === tab 
                ? 'bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 text-emerald-400' 
                : 'bg-white/5 border border-white/10 text-gray-500 hover:bg-white/10 hover:text-white'
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'dashboard' && '📊 Dashboard'}
            {tab === 'new-trade' && '➕ New Trade'}
            {tab === 'api-info' && '🔧 API Info'}
          </button>
        ))}
      </nav>

      <main className="max-w-6xl mx-auto">
        {activeTab === 'dashboard' && (
          <>
            <StatsDashboard trades={trades} />
            
            <div className="flex flex-col gap-4">
              {trades.length === 0 ? (
                <div className="text-center py-16 text-gray-500">
                  <div className="text-6xl mb-5">📝</div>
                  <h3 className="text-lg text-gray-400 mb-2">No trades logged yet</h3>
                  <p className="text-sm max-w-md mx-auto">Start tracking your Solana trades by adding your first trade.</p>
                </div>
              ) : (
                trades.map(trade => (
                  <TradeCard 
                    key={trade.id}
                    trade={trade}
                    onUpdate={handleUpdateTrade}
                    onDelete={handleDeleteTrade}
                  />
                ))
              )}
            </div>
          </>
        )}

        {activeTab === 'new-trade' && (
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <TokenSearch onSelect={setSelectedToken} />
              <TradeInputForm 
                selectedToken={selectedToken} 
                onAddTrade={handleAddTrade}
              />
            </div>
            <div>
              {selectedToken && (
                <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                  <h3 className="font-semibold text-white mb-4">Selected Token</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-[10px] text-gray-600 uppercase block mb-1">Symbol</span>
                      <span className="text-lg font-semibold text-white">{selectedToken.baseToken.symbol}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-600 uppercase block mb-1">Price</span>
                      <span className="mono text-emerald-400">{formatPrice(parseFloat(selectedToken.priceUsd))}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-600 uppercase block mb-1">Market Cap</span>
                      <span className="mono text-white">{formatNumber(selectedToken.marketCap)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-600 uppercase block mb-1">24h Volume</span>
                      <span className="mono text-white">{formatNumber(selectedToken.volume?.h24)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-600 uppercase block mb-1">Liquidity</span>
                      <span className="mono text-white">{formatNumber(selectedToken.liquidity?.usd)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-600 uppercase block mb-1">24h Change</span>
                      <span className={`mono ${selectedToken.priceChange?.h24 >= 0 ? 'text-emerald-400' : 'text-pink-500'}`}>
                        {formatPercent(selectedToken.priceChange?.h24)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <span className="text-[10px] text-gray-600 uppercase block mb-1">Token Address</span>
                    <span className="mono text-xs text-gray-400 break-all">{selectedToken.baseToken.address}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'api-info' && (
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <h3 className="font-semibold text-white mb-5">🔌 API Endpoints Used</h3>
            
            <div className="space-y-3">
              {[
                { label: 'DexScreener - Token Search', url: 'GET https://api.dexscreener.com/latest/dex/search?q={query}' },
                { label: 'DexScreener - Token Pairs', url: 'GET https://api.dexscreener.com/token-pairs/v1/{chainId}/{tokenAddress}' },
                { label: 'GeckoTerminal - OHLCV Data', url: 'GET https://api.geckoterminal.com/api/v2/networks/{network}/pools/{poolAddress}/ohlcv/{timeframe}' },
              ].map((endpoint, i) => (
                <div key={i} className="bg-black/30 rounded-lg p-4">
                  <span className="text-emerald-400 text-sm block mb-1">{endpoint.label}</span>
                  <span className="mono text-xs text-gray-500 break-all">{endpoint.url}</span>
                </div>
              ))}
            </div>

            <div className="mt-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <h4 className="text-emerald-400 font-medium mb-2">Rate Limits</h4>
              <p className="text-sm text-gray-400">DexScreener: 300 req/min • GeckoTerminal: 30 req/min (free tier)</p>
            </div>

            <div className="mt-4 p-4 bg-orange-500/10 border border-orange-500/20 rounded-lg">
              <h4 className="text-orange-400 font-medium mb-2">⚠️ For Automatic Wallet Tracking</h4>
              <p className="text-sm text-gray-400 mb-2">To auto-detect wallet buys/sells, you need:</p>
              <ul className="text-sm text-gray-400 list-disc list-inside space-y-1">
                <li><strong>Helius API</strong> - Transaction parsing & webhooks</li>
                <li><strong>Solana Tracker API</strong> - Wallet PnL & trade history</li>
                <li><strong>Moralis Solana API</strong> - Sniper detection</li>
              </ul>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
