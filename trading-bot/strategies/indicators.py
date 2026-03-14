import pandas as pd
import numpy as np
import ta


def calculate_rsi(df, period=14):
    """Calculate RSI (Relative Strength Index)."""
    rsi = ta.momentum.RSIIndicator(df["close"], window=period)
    return rsi.rsi()


def calculate_macd(df, fast=12, slow=26, signal=9):
    """Calculate MACD, Signal line, and Histogram."""
    macd = ta.trend.MACD(df["close"], window_slow=slow, window_fast=fast, window_sign=signal)
    return {
        "macd": macd.macd(),
        "signal": macd.macd_signal(),
        "histogram": macd.macd_diff(),
    }


def calculate_bollinger_bands(df, period=20, std=2):
    """Calculate Bollinger Bands."""
    bb = ta.volatility.BollingerBands(df["close"], window=period, window_dev=std)
    return {
        "upper": bb.bollinger_hband(),
        "middle": bb.bollinger_mavg(),
        "lower": bb.bollinger_lband(),
        "pband": bb.bollinger_pband(),  # 0~1 position within bands
    }


def calculate_moving_averages(df, short=5, long=20):
    """Calculate short and long moving averages."""
    return {
        "ma_short": df["close"].rolling(window=short).mean(),
        "ma_long": df["close"].rolling(window=long).mean(),
    }


def calculate_volume_ratio(df, period=20):
    """Calculate volume ratio (current volume / average volume)."""
    avg_volume = df["volume"].rolling(window=period).mean()
    return df["volume"] / avg_volume


def calculate_atr(df, period=14):
    """Calculate Average True Range for volatility."""
    atr = ta.volatility.AverageTrueRange(df["high"], df["low"], df["close"], window=period)
    return atr.average_true_range()
