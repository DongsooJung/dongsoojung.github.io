import pyupbit
import logging
import time
from config import UPBIT_ACCESS_KEY, UPBIT_SECRET_KEY

logger = logging.getLogger(__name__)


class UpbitClient:
    """Upbit API wrapper with error handling and retry logic."""

    def __init__(self):
        self.upbit = pyupbit.Upbit(UPBIT_ACCESS_KEY, UPBIT_SECRET_KEY)

    def get_balance(self, ticker="KRW"):
        """Get balance for a specific ticker."""
        try:
            if ticker == "KRW":
                return self.upbit.get_balance()
            return self.upbit.get_balance(ticker)
        except Exception as e:
            logger.error(f"Failed to get balance for {ticker}: {e}")
            return 0

    def get_current_price(self, market):
        """Get current price for a market."""
        try:
            return pyupbit.get_current_price(market)
        except Exception as e:
            logger.error(f"Failed to get price for {market}: {e}")
            return None

    def get_ohlcv(self, market, interval="minute60", count=200):
        """Get OHLCV data for technical analysis."""
        try:
            df = pyupbit.get_ohlcv(market, interval=interval, count=count)
            return df
        except Exception as e:
            logger.error(f"Failed to get OHLCV for {market}: {e}")
            return None

    def buy_market_order(self, market, amount):
        """Place a market buy order."""
        try:
            result = self.upbit.buy_market_order(market, amount)
            if result and "error" not in result:
                logger.info(f"BUY {market}: {amount} KRW -> {result}")
                return result
            logger.error(f"Buy order failed: {result}")
            return None
        except Exception as e:
            logger.error(f"Buy order error for {market}: {e}")
            return None

    def sell_market_order(self, market, volume):
        """Place a market sell order."""
        try:
            result = self.upbit.sell_market_order(market, volume)
            if result and "error" not in result:
                logger.info(f"SELL {market}: {volume} units -> {result}")
                return result
            logger.error(f"Sell order failed: {result}")
            return None
        except Exception as e:
            logger.error(f"Sell order error for {market}: {e}")
            return None

    def get_avg_buy_price(self, ticker):
        """Get average buy price for a coin."""
        try:
            return self.upbit.get_avg_buy_price(ticker)
        except Exception as e:
            logger.error(f"Failed to get avg buy price for {ticker}: {e}")
            return 0

    def get_balances(self):
        """Get all balances."""
        try:
            return self.upbit.get_balances()
        except Exception as e:
            logger.error(f"Failed to get balances: {e}")
            return []

    def get_order(self, uuid):
        """Get order details by UUID."""
        try:
            return self.upbit.get_order(uuid)
        except Exception as e:
            logger.error(f"Failed to get order {uuid}: {e}")
            return None

    def get_holding_coins(self):
        """Get list of currently holding coins with their info."""
        holdings = []
        try:
            balances = self.get_balances()
            for b in balances:
                if b["currency"] == "KRW":
                    continue
                if float(b["balance"]) * float(b.get("avg_buy_price", 0)) < 5000:
                    continue
                market = f"KRW-{b['currency']}"
                current_price = self.get_current_price(market)
                avg_price = float(b["avg_buy_price"])
                volume = float(b["balance"])
                profit_pct = ((current_price - avg_price) / avg_price * 100) if avg_price > 0 else 0

                holdings.append({
                    "market": market,
                    "currency": b["currency"],
                    "volume": volume,
                    "avg_buy_price": avg_price,
                    "current_price": current_price,
                    "profit_pct": round(profit_pct, 2),
                    "eval_amount": round(current_price * volume),
                })
                time.sleep(0.1)  # API rate limit
        except Exception as e:
            logger.error(f"Failed to get holding coins: {e}")
        return holdings
