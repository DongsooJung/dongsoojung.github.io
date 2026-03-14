import logging
import time
import json
from datetime import datetime, timezone

from api.upbit_client import UpbitClient
from strategies.composite_strategy import analyze
from db.supabase_client import SupabaseManager
from config import (
    TARGET_COINS, INVEST_AMOUNT, TRADING_INTERVAL,
    STOP_LOSS_PCT, TAKE_PROFIT_PCT, MAX_HOLD_HOURS, MAX_POSITIONS,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("trading_bot.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger("TradingBot")


class TradingBot:
    def __init__(self):
        self.client = UpbitClient()
        self.db = SupabaseManager()
        self.running = False

    def check_buy_signal(self, market):
        """Analyze market and return buy signal if conditions met."""
        df = self.client.get_ohlcv(market, interval="minute60", count=200)
        if df is None:
            return None
        result = analyze(df)
        if result["signal"] == "buy":
            logger.info(f"BUY signal for {market}: score={result['score']}")
            self.db.log_alert("buy_signal", f"{market} buy signal (score: {result['score']})", market)
        return result

    def check_sell_conditions(self, holding):
        """Check if any sell conditions are met for a holding."""
        market = holding["market"]
        profit_pct = holding["profit_pct"]

        # Stop loss
        if profit_pct <= STOP_LOSS_PCT:
            logger.warning(f"STOP LOSS triggered for {market}: {profit_pct}%")
            self.db.log_alert("stop_loss", f"{market} stop loss at {profit_pct}%", market)
            return {"signal": "sell", "reason": "stop_loss", "score": -100}

        # Take profit
        if profit_pct >= TAKE_PROFIT_PCT:
            logger.info(f"TAKE PROFIT triggered for {market}: {profit_pct}%")
            self.db.log_alert("take_profit", f"{market} take profit at {profit_pct}%", market)
            return {"signal": "sell", "reason": "take_profit", "score": 100}

        # Strategy-based sell
        df = self.client.get_ohlcv(market, interval="minute60", count=200)
        if df is not None:
            result = analyze(df)
            if result["signal"] == "sell":
                logger.info(f"Strategy SELL for {market}: score={result['score']}")
                return result

        return {"signal": "hold", "score": 0}

    def execute_buy(self, market, analysis):
        """Execute a buy order."""
        krw = self.client.get_balance("KRW")
        buy_amount = min(INVEST_AMOUNT, krw * 0.9995)  # fee margin

        if buy_amount < 5000:
            logger.warning(f"Insufficient KRW balance: {krw}")
            return None

        current_price = self.client.get_current_price(market)
        if not current_price:
            return None

        result = self.client.buy_market_order(market, buy_amount)
        if result:
            order_uuid = result.get("uuid", "")
            self.db.log_trade(
                market=market,
                side="buy",
                amount=buy_amount,
                price=current_price,
                volume=buy_amount / current_price,
                score=analysis["score"],
                details=analysis.get("details", {}),
                order_uuid=order_uuid,
            )
            self.db.log_alert("trade", f"Bought {market} for {buy_amount:,.0f} KRW", market)
            logger.info(f"Bought {market}: {buy_amount:,.0f} KRW at {current_price:,.0f}")
        return result

    def execute_sell(self, holding, analysis):
        """Execute a sell order."""
        market = holding["market"]
        volume = holding["volume"]

        result = self.client.sell_market_order(market, volume)
        if result:
            order_uuid = result.get("uuid", "")
            sell_amount = holding["current_price"] * volume
            self.db.log_trade(
                market=market,
                side="sell",
                amount=sell_amount,
                price=holding["current_price"],
                volume=volume,
                score=analysis.get("score", 0),
                details=analysis.get("details", analysis.get("reason", "")),
                order_uuid=order_uuid,
            )
            self.db.log_alert(
                "trade",
                f"Sold {market} for {sell_amount:,.0f} KRW (P/L: {holding['profit_pct']}%)",
                market,
            )
            logger.info(f"Sold {market}: {volume} units, P/L: {holding['profit_pct']}%")
        return result

    def save_snapshot(self):
        """Save current portfolio snapshot."""
        try:
            krw = self.client.get_balance("KRW")
            holdings = self.client.get_holding_coins()
            total_value = krw + sum(h["eval_amount"] for h in holdings)
            self.db.save_portfolio_snapshot(krw, holdings, total_value)
        except Exception as e:
            logger.error(f"Failed to save snapshot: {e}")

    def run_cycle(self):
        """Run one trading cycle."""
        logger.info("=" * 50)
        logger.info("Starting trading cycle")

        # Load dynamic settings from DB
        db_settings = self.db.get_settings()
        if db_settings and not db_settings.get("is_active", True):
            logger.info("Bot is paused via settings. Skipping cycle.")
            return

        target_coins = TARGET_COINS
        if db_settings and db_settings.get("target_coins"):
            target_coins = db_settings["target_coins"]

        # Check existing positions for sell signals
        holdings = self.client.get_holding_coins()
        holding_markets = {h["market"] for h in holdings}

        for holding in holdings:
            sell_analysis = self.check_sell_conditions(holding)
            if sell_analysis["signal"] == "sell":
                self.execute_sell(holding, sell_analysis)
                time.sleep(1)

        # Check for buy signals on target coins
        current_positions = len(self.client.get_holding_coins())
        if current_positions >= MAX_POSITIONS:
            logger.info(f"Max positions ({MAX_POSITIONS}) reached. Skipping buys.")
        else:
            for market in target_coins:
                if market in holding_markets:
                    continue
                if current_positions >= MAX_POSITIONS:
                    break

                analysis = self.check_buy_signal(market)
                if analysis and analysis["signal"] == "buy":
                    result = self.execute_buy(market, analysis)
                    if result:
                        current_positions += 1
                time.sleep(1)  # API rate limit

        # Save portfolio snapshot
        self.save_snapshot()
        logger.info("Trading cycle complete")

    def run(self):
        """Main bot loop."""
        self.running = True
        logger.info("Trading bot started")
        logger.info(f"Target coins: {TARGET_COINS}")
        logger.info(f"Invest amount: {INVEST_AMOUNT:,.0f} KRW")
        logger.info(f"Interval: {TRADING_INTERVAL}s")

        self.db.log_alert("system", "Trading bot started")

        while self.running:
            try:
                self.run_cycle()
            except Exception as e:
                logger.error(f"Error in trading cycle: {e}", exc_info=True)
                self.db.log_alert("error", f"Trading cycle error: {str(e)}")

            logger.info(f"Next cycle in {TRADING_INTERVAL}s")
            time.sleep(TRADING_INTERVAL)

    def stop(self):
        """Stop the bot."""
        self.running = False
        self.db.log_alert("system", "Trading bot stopped")
        logger.info("Trading bot stopped")


if __name__ == "__main__":
    bot = TradingBot()
    try:
        bot.run()
    except KeyboardInterrupt:
        bot.stop()
        logger.info("Bot stopped by user")
