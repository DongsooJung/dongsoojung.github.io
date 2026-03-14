import os
from dotenv import load_dotenv

load_dotenv()

# Upbit API
UPBIT_ACCESS_KEY = os.getenv("UPBIT_ACCESS_KEY")
UPBIT_SECRET_KEY = os.getenv("UPBIT_SECRET_KEY")

# Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# Trading
TARGET_COINS = os.getenv("TARGET_COINS", "KRW-BTC,KRW-ETH,KRW-XRP").split(",")
INVEST_AMOUNT = float(os.getenv("INVEST_AMOUNT", "100000"))
TRADING_INTERVAL = int(os.getenv("TRADING_INTERVAL", "60"))  # seconds

# Strategy Parameters
RSI_PERIOD = 14
RSI_OVERSOLD = 30
RSI_OVERBOUGHT = 70
MACD_FAST = 12
MACD_SLOW = 26
MACD_SIGNAL = 9
BB_PERIOD = 20
BB_STD = 2
MA_SHORT = 5
MA_LONG = 20

# Risk Management
STOP_LOSS_PCT = -3.0      # -3% stop loss
TAKE_PROFIT_PCT = 5.0     # +5% take profit
MAX_HOLD_HOURS = 72       # max hold 72 hours
MAX_POSITIONS = 5         # max simultaneous positions
