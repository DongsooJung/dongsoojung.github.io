import sys
import os
import json
import threading

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from flask import Flask, render_template, jsonify, request
from api.upbit_client import UpbitClient
from db.supabase_client import SupabaseManager
from bot import TradingBot

app = Flask(__name__)
client = UpbitClient()
db = SupabaseManager()
bot_instance = None
bot_thread = None


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/status")
def bot_status():
    """Get current bot status and portfolio."""
    try:
        krw = client.get_balance("KRW")
        holdings = client.get_holding_coins()
        total_value = krw + sum(h["eval_amount"] for h in holdings)
        settings = db.get_settings()

        return jsonify({
            "status": "running" if (bot_instance and bot_instance.running) else "stopped",
            "krw_balance": round(krw),
            "holdings": holdings,
            "total_value": round(total_value),
            "settings": settings,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/trades")
def get_trades():
    """Get recent trades."""
    market = request.args.get("market")
    limit = int(request.args.get("limit", 50))
    trades = db.get_trades(market=market, limit=limit)
    return jsonify(trades)


@app.route("/api/performance")
def get_performance():
    """Get performance summary."""
    perf = db.get_performance_summary()
    return jsonify(perf)


@app.route("/api/portfolio-history")
def get_portfolio_history():
    """Get portfolio value history."""
    history = db.get_portfolio_history()
    return jsonify(history)


@app.route("/api/alerts")
def get_alerts():
    """Get recent alerts."""
    unread = request.args.get("unread", "false").lower() == "true"
    alerts = db.get_alerts(unread_only=unread)
    return jsonify(alerts)


@app.route("/api/alerts/<int:alert_id>/read", methods=["POST"])
def mark_alert_read(alert_id):
    """Mark an alert as read."""
    db.mark_alert_read(alert_id)
    return jsonify({"ok": True})


@app.route("/api/settings", methods=["GET"])
def get_settings():
    """Get bot settings."""
    settings = db.get_settings()
    return jsonify(settings or {})


@app.route("/api/settings", methods=["POST"])
def update_settings():
    """Update bot settings."""
    data = request.get_json()
    result = db.update_settings(data)
    return jsonify({"ok": True, "data": result})


@app.route("/api/bot/start", methods=["POST"])
def start_bot():
    """Start the trading bot."""
    global bot_instance, bot_thread
    if bot_instance and bot_instance.running:
        return jsonify({"error": "Bot is already running"}), 400

    bot_instance = TradingBot()
    bot_thread = threading.Thread(target=bot_instance.run, daemon=True)
    bot_thread.start()
    return jsonify({"ok": True, "status": "started"})


@app.route("/api/bot/stop", methods=["POST"])
def stop_bot():
    """Stop the trading bot."""
    global bot_instance
    if not bot_instance or not bot_instance.running:
        return jsonify({"error": "Bot is not running"}), 400

    bot_instance.stop()
    return jsonify({"ok": True, "status": "stopped"})


@app.route("/api/analyze/<market>")
def analyze_market(market):
    """Run analysis on a specific market."""
    from strategies.composite_strategy import analyze
    df = client.get_ohlcv(market, interval="minute60", count=200)
    if df is None:
        return jsonify({"error": "Failed to get market data"}), 500
    result = analyze(df)
    return jsonify(result)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
