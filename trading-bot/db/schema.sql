-- Supabase SQL Schema for Upbit Trading Bot
-- Run this in Supabase SQL Editor to create all required tables

-- 1. Trades table
CREATE TABLE IF NOT EXISTS trades (
    id BIGSERIAL PRIMARY KEY,
    market VARCHAR(20) NOT NULL,
    side VARCHAR(4) NOT NULL CHECK (side IN ('buy', 'sell')),
    amount DECIMAL(20, 4) NOT NULL,
    price DECIMAL(20, 4) NOT NULL,
    volume DECIMAL(20, 8) NOT NULL,
    score INTEGER DEFAULT 0,
    details TEXT,
    order_uuid VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Portfolio snapshots
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    id BIGSERIAL PRIMARY KEY,
    krw_balance DECIMAL(20, 4) NOT NULL,
    holdings JSONB DEFAULT '[]',
    total_value DECIMAL(20, 4) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Bot settings
CREATE TABLE IF NOT EXISTS bot_settings (
    id BIGSERIAL PRIMARY KEY,
    target_coins TEXT[] DEFAULT ARRAY['KRW-BTC', 'KRW-ETH', 'KRW-XRP'],
    invest_amount DECIMAL(20, 4) DEFAULT 100000,
    trading_interval INTEGER DEFAULT 60,
    is_active BOOLEAN DEFAULT TRUE,
    stop_loss_pct DECIMAL(5, 2) DEFAULT -3.0,
    take_profit_pct DECIMAL(5, 2) DEFAULT 5.0,
    max_positions INTEGER DEFAULT 5,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Alerts
CREATE TABLE IF NOT EXISTS alerts (
    id BIGSERIAL PRIMARY KEY,
    alert_type VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    market VARCHAR(20),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_trades_market ON trades(market);
CREATE INDEX IF NOT EXISTS idx_trades_created_at ON trades(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portfolio_created_at ON portfolio_snapshots(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_unread ON alerts(is_read, created_at DESC);

-- Enable RLS (Row Level Security) - adjust policies as needed
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (for the bot)
CREATE POLICY "Service role full access" ON trades FOR ALL USING (true);
CREATE POLICY "Service role full access" ON portfolio_snapshots FOR ALL USING (true);
CREATE POLICY "Service role full access" ON bot_settings FOR ALL USING (true);
CREATE POLICY "Service role full access" ON alerts FOR ALL USING (true);
