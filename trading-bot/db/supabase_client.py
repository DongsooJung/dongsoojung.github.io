import json
import logging
from datetime import datetime, timezone
from supabase import create_client
from config import SUPABASE_URL, SUPABASE_KEY

logger = logging.getLogger(__name__)


class SupabaseManager:
    """Manage all Supabase operations for the trading bot."""

    def __init__(self):
        if not SUPABASE_URL or not SUPABASE_KEY:
            logger.warning("Supabase credentials not set. Running in offline mode.")
            self.client = None
            return
        self.client = create_client(SUPABASE_URL, SUPABASE_KEY)

    def _now(self):
        return datetime.now(timezone.utc).isoformat()

    # ── Trade Records ──

    def log_trade(self, market, side, amount, price, volume, score, details, order_uuid=None):
        """Log a trade (buy/sell) to the trades table."""
        if not self.client:
            return None
        try:
            data = {
                "market": market,
                "side": side,
                "amount": amount,
                "price": price,
                "volume": volume,
                "score": score,
                "details": json.dumps(details, ensure_ascii=False) if isinstance(details, dict) else details,
                "order_uuid": order_uuid,
                "created_at": self._now(),
            }
            result = self.client.table("trades").insert(data).execute()
            logger.info(f"Trade logged: {side} {market}")
            return result.data
        except Exception as e:
            logger.error(f"Failed to log trade: {e}")
            return None

    def get_trades(self, market=None, limit=50):
        """Get recent trades, optionally filtered by market."""
        if not self.client:
            return []
        try:
            query = self.client.table("trades").select("*").order("created_at", desc=True).limit(limit)
            if market:
                query = query.eq("market", market)
            result = query.execute()
            return result.data
        except Exception as e:
            logger.error(f"Failed to get trades: {e}")
            return []

    # ── Portfolio Snapshots ──

    def save_portfolio_snapshot(self, krw_balance, holdings, total_value):
        """Save a periodic portfolio snapshot."""
        if not self.client:
            return None
        try:
            data = {
                "krw_balance": krw_balance,
                "holdings": json.dumps(holdings, ensure_ascii=False),
                "total_value": total_value,
                "created_at": self._now(),
            }
            result = self.client.table("portfolio_snapshots").insert(data).execute()
            return result.data
        except Exception as e:
            logger.error(f"Failed to save snapshot: {e}")
            return None

    def get_portfolio_history(self, limit=100):
        """Get portfolio history for chart display."""
        if not self.client:
            return []
        try:
            result = (
                self.client.table("portfolio_snapshots")
                .select("*")
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
            )
            return result.data
        except Exception as e:
            logger.error(f"Failed to get portfolio history: {e}")
            return []

    # ── Bot Settings ──

    def get_settings(self):
        """Get bot settings from DB."""
        if not self.client:
            return None
        try:
            result = self.client.table("bot_settings").select("*").limit(1).execute()
            return result.data[0] if result.data else None
        except Exception as e:
            logger.error(f"Failed to get settings: {e}")
            return None

    def update_settings(self, settings_dict):
        """Update bot settings."""
        if not self.client:
            return None
        try:
            existing = self.get_settings()
            if existing:
                result = (
                    self.client.table("bot_settings")
                    .update(settings_dict)
                    .eq("id", existing["id"])
                    .execute()
                )
            else:
                result = self.client.table("bot_settings").insert(settings_dict).execute()
            return result.data
        except Exception as e:
            logger.error(f"Failed to update settings: {e}")
            return None

    # ── Alerts / Notifications ──

    def log_alert(self, alert_type, message, market=None):
        """Log an alert/notification."""
        if not self.client:
            return None
        try:
            data = {
                "alert_type": alert_type,
                "message": message,
                "market": market,
                "created_at": self._now(),
                "is_read": False,
            }
            result = self.client.table("alerts").insert(data).execute()
            return result.data
        except Exception as e:
            logger.error(f"Failed to log alert: {e}")
            return None

    def get_alerts(self, unread_only=False, limit=50):
        """Get alerts."""
        if not self.client:
            return []
        try:
            query = self.client.table("alerts").select("*").order("created_at", desc=True).limit(limit)
            if unread_only:
                query = query.eq("is_read", False)
            result = query.execute()
            return result.data
        except Exception as e:
            logger.error(f"Failed to get alerts: {e}")
            return []

    def mark_alert_read(self, alert_id):
        """Mark alert as read."""
        if not self.client:
            return None
        try:
            result = self.client.table("alerts").update({"is_read": True}).eq("id", alert_id).execute()
            return result.data
        except Exception as e:
            logger.error(f"Failed to mark alert read: {e}")
            return None

    # ── Performance Stats ──

    def get_performance_summary(self):
        """Calculate performance metrics from trades."""
        if not self.client:
            return {}
        try:
            trades = self.get_trades(limit=1000)
            if not trades:
                return {}

            buys = [t for t in trades if t["side"] == "buy"]
            sells = [t for t in trades if t["side"] == "sell"]
            total_invested = sum(t["amount"] for t in buys)
            total_returned = sum(t["amount"] for t in sells)
            profit = total_returned - total_invested

            return {
                "total_trades": len(trades),
                "buy_count": len(buys),
                "sell_count": len(sells),
                "total_invested": round(total_invested),
                "total_returned": round(total_returned),
                "profit": round(profit),
                "profit_pct": round((profit / total_invested * 100), 2) if total_invested > 0 else 0,
            }
        except Exception as e:
            logger.error(f"Failed to get performance: {e}")
            return {}
