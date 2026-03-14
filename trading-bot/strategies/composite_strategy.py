import logging
from strategies.indicators import (
    calculate_rsi,
    calculate_macd,
    calculate_bollinger_bands,
    calculate_moving_averages,
    calculate_volume_ratio,
)
from config import (
    RSI_PERIOD, RSI_OVERSOLD, RSI_OVERBOUGHT,
    MACD_FAST, MACD_SLOW, MACD_SIGNAL,
    BB_PERIOD, BB_STD, MA_SHORT, MA_LONG,
)

logger = logging.getLogger(__name__)

# Signal weights
WEIGHTS = {
    "rsi": 25,
    "macd": 25,
    "bollinger": 25,
    "ma_cross": 15,
    "volume": 10,
}

BUY_THRESHOLD = 60   # score >= 60 -> buy signal
SELL_THRESHOLD = -60  # score <= -60 -> sell signal


def analyze(df):
    """
    Analyze market data using composite strategy.
    Returns: dict with signal ('buy', 'sell', 'hold'), score, and details.
    """
    if df is None or len(df) < 50:
        return {"signal": "hold", "score": 0, "details": "Insufficient data"}

    score = 0
    details = {}

    # 1. RSI
    rsi = calculate_rsi(df, RSI_PERIOD)
    current_rsi = rsi.iloc[-1]
    if current_rsi <= RSI_OVERSOLD:
        rsi_score = WEIGHTS["rsi"]
        details["rsi"] = f"Oversold ({current_rsi:.1f})"
    elif current_rsi >= RSI_OVERBOUGHT:
        rsi_score = -WEIGHTS["rsi"]
        details["rsi"] = f"Overbought ({current_rsi:.1f})"
    else:
        # Linear scale: 30~50 -> positive, 50~70 -> negative
        rsi_score = int(WEIGHTS["rsi"] * (50 - current_rsi) / 20)
        details["rsi"] = f"Neutral ({current_rsi:.1f})"
    score += rsi_score

    # 2. MACD
    macd = calculate_macd(df, MACD_FAST, MACD_SLOW, MACD_SIGNAL)
    macd_val = macd["macd"].iloc[-1]
    signal_val = macd["signal"].iloc[-1]
    hist_val = macd["histogram"].iloc[-1]
    hist_prev = macd["histogram"].iloc[-2]

    if macd_val > signal_val and hist_val > 0:
        if hist_val > hist_prev:  # histogram increasing
            macd_score = WEIGHTS["macd"]
            details["macd"] = "Strong bullish"
        else:
            macd_score = WEIGHTS["macd"] // 2
            details["macd"] = "Bullish (weakening)"
    elif macd_val < signal_val and hist_val < 0:
        if hist_val < hist_prev:  # histogram decreasing
            macd_score = -WEIGHTS["macd"]
            details["macd"] = "Strong bearish"
        else:
            macd_score = -WEIGHTS["macd"] // 2
            details["macd"] = "Bearish (weakening)"
    else:
        macd_score = 0
        details["macd"] = "Neutral"
    score += macd_score

    # 3. Bollinger Bands
    bb = calculate_bollinger_bands(df, BB_PERIOD, BB_STD)
    current_price = df["close"].iloc[-1]
    pband = bb["pband"].iloc[-1]  # 0~1 position

    if pband <= 0.0:
        bb_score = WEIGHTS["bollinger"]
        details["bollinger"] = f"Below lower band (pband={pband:.2f})"
    elif pband >= 1.0:
        bb_score = -WEIGHTS["bollinger"]
        details["bollinger"] = f"Above upper band (pband={pband:.2f})"
    elif pband <= 0.2:
        bb_score = WEIGHTS["bollinger"] // 2
        details["bollinger"] = f"Near lower band (pband={pband:.2f})"
    elif pband >= 0.8:
        bb_score = -WEIGHTS["bollinger"] // 2
        details["bollinger"] = f"Near upper band (pband={pband:.2f})"
    else:
        bb_score = 0
        details["bollinger"] = f"Mid-range (pband={pband:.2f})"
    score += bb_score

    # 4. Moving Average Crossover
    ma = calculate_moving_averages(df, MA_SHORT, MA_LONG)
    ma_short = ma["ma_short"].iloc[-1]
    ma_long = ma["ma_long"].iloc[-1]
    ma_short_prev = ma["ma_short"].iloc[-2]
    ma_long_prev = ma["ma_long"].iloc[-2]

    if ma_short > ma_long and ma_short_prev <= ma_long_prev:
        ma_score = WEIGHTS["ma_cross"]
        details["ma_cross"] = "Golden cross"
    elif ma_short < ma_long and ma_short_prev >= ma_long_prev:
        ma_score = -WEIGHTS["ma_cross"]
        details["ma_cross"] = "Death cross"
    elif ma_short > ma_long:
        ma_score = WEIGHTS["ma_cross"] // 2
        details["ma_cross"] = "Uptrend"
    else:
        ma_score = -WEIGHTS["ma_cross"] // 2
        details["ma_cross"] = "Downtrend"
    score += ma_score

    # 5. Volume
    vol_ratio = calculate_volume_ratio(df)
    current_vol_ratio = vol_ratio.iloc[-1]
    if current_vol_ratio >= 2.0:
        vol_score = WEIGHTS["volume"] if score > 0 else -WEIGHTS["volume"]
        details["volume"] = f"High volume ({current_vol_ratio:.1f}x) amplifying trend"
    elif current_vol_ratio >= 1.5:
        vol_score = (WEIGHTS["volume"] // 2) if score > 0 else -(WEIGHTS["volume"] // 2)
        details["volume"] = f"Above avg volume ({current_vol_ratio:.1f}x)"
    else:
        vol_score = 0
        details["volume"] = f"Normal volume ({current_vol_ratio:.1f}x)"
    score += vol_score

    # Determine signal
    if score >= BUY_THRESHOLD:
        signal = "buy"
    elif score <= SELL_THRESHOLD:
        signal = "sell"
    else:
        signal = "hold"

    result = {
        "signal": signal,
        "score": score,
        "details": details,
        "indicators": {
            "rsi": round(current_rsi, 2),
            "macd": round(macd_val, 4),
            "macd_signal": round(signal_val, 4),
            "bb_pband": round(pband, 4),
            "ma_short": round(ma_short, 2),
            "ma_long": round(ma_long, 2),
            "volume_ratio": round(current_vol_ratio, 2),
        },
    }

    logger.info(f"Analysis: signal={signal}, score={score}, details={details}")
    return result
