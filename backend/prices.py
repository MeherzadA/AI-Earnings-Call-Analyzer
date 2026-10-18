import yfinance as yf
from datetime import datetime, timedelta
from transcript import fetch_transcript


def get_earnings_date(ticker: str, year: int, quarter: int) -> str | None:
    """
    Fetch the earnings date from the parquet dataset.
    
    Returns: Date string in format "YYYY-MM-DD" or None if not found
    """
    transcript = fetch_transcript(ticker, year, quarter)
    return transcript.get("report_date") if transcript else None


def get_next_trading_day(date_str: str) -> str:
    """
    Given a date string (YYYY-MM-DD), return the next trading day.
    Skips weekends. Handles US market holidays via yfinance.
    
    Returns: Date string in format "YYYY-MM-DD"
    """
    date = datetime.strptime(date_str, "%Y-%m-%d")
    
    # Start checking from the next day
    current = date + timedelta(days=1)
    
    # yfinance API uses weekday() where Monday=0, Sunday=6
    max_iterations = 10  # Safety limit to prevent infinite loops
    iterations = 0
    
    while iterations < max_iterations:
        # Check if it's a weekend
        if current.weekday() < 5:  # Monday=0 to Friday=4
            # Try to fetch data for this date
            # If yfinance returns empty for this date, it's likely a holiday
            try:
                data = yf.download("SPY", start=current, end=current + timedelta(days=1), progress=False)
                if not data.empty:
                    return current.strftime("%Y-%m-%d")
            except:
                pass
        
        current += timedelta(days=1)
        iterations += 1
    
    # Fallback: if we can't find a trading day, return the date + 1 day
    return (date + timedelta(days=1)).strftime("%Y-%m-%d")


def calculate_returns(ticker: str, earnings_date: str) -> dict:
    """
    Calculate 1-day and 5-day returns after earnings.
    
    1-day return: earnings_date close → next_trading_day close
    5-day return: earnings_date close → (5 trading days later) close
    
    Returns: {
        "return_1day": float (percentage, e.g., 2.34 for +2.34%)
        "return_5day": float (percentage, e.g., 1.87 for +1.87%)
        "earnings_date": str (the date used, YYYY-MM-DD)
        "return_1day_date": str (the date of 1-day return calculation)
        "return_5day_date": str (the date of 5-day return calculation)
    }
    """
    try:
        # Parse earnings date
        earnings_date_obj = datetime.strptime(earnings_date, "%Y-%m-%d")
        
        # Fetch stock data around the earnings date
        # Get data from earnings_date to 2 weeks after to ensure we have trading days
        start_date = (earnings_date_obj - timedelta(days=1)).strftime("%Y-%m-%d")
        end_date = (earnings_date_obj + timedelta(days=15)).strftime("%Y-%m-%d")
        
        data = yf.download(
            ticker.upper(), start=start_date, end=end_date, progress=False,
            auto_adjust=False, threads=False, timeout=10,
        )
        
        if data.empty:
            raise RuntimeError(f"No price data available for {ticker.upper()} around {earnings_date}")
        
        # Ensure the dataframe is sorted by date
        data = data.sort_index()

        # Flatten MultiIndex columns — yfinance returns ('Close', 'NVDA') style columns
        # We just want a simple 'Close' column with scalar values
        close_prices = data["Close"]
        if close_prices.ndim == 2:
            close_prices = close_prices.iloc[:, 0]
        close_prices = close_prices.dropna()

        # Get the close price on earnings date
        earnings_date_close = None
        if earnings_date in close_prices.index.strftime("%Y-%m-%d").values:
            earnings_date_close = float(close_prices.loc[earnings_date])
        else:
            # If exact date not found, find the most recent date before or on earnings_date
            valid_dates = close_prices.index[close_prices.index <= earnings_date_obj]
            if not valid_dates.empty:
                earnings_date_close = float(close_prices.loc[valid_dates[-1]])
        
        if earnings_date_close is None or earnings_date_close <= 0:
            raise RuntimeError(f"Could not find price data for {ticker.upper()} on or before {earnings_date}")
        
        # Get trading days after earnings
        trading_days = []
        for date_index in close_prices.index:
            if date_index > earnings_date_obj:
                trading_days.append(date_index)
        
        if not trading_days:
            raise RuntimeError("No trading days available after the call yet.")
        
        # 1-day return (next trading day)
        one_day_date = trading_days[0]
        one_day_close = float(close_prices.loc[one_day_date])
        return_1day = float(((one_day_close - earnings_date_close) / earnings_date_close) * 100)
        
        # 5-day return (5 trading days later)
        five_day_date = trading_days[4] if len(trading_days) >= 5 else None
        return_5day = (
            float(((float(close_prices.loc[five_day_date]) - earnings_date_close) / earnings_date_close) * 100)
            if five_day_date is not None else None
        )
        
        # Collect daily prices for charting (earnings date + 5 trading days after)
        daily_prices = [
            {
                "date": earnings_date,
                "price": float(round(earnings_date_close, 2)),
                "label": "Earnings"
            }
        ]
        
        for i, trade_day in enumerate(trading_days[:5]):
            close_price = float(close_prices.loc[trade_day])
            daily_prices.append({
                "date": trade_day.strftime("%Y-%m-%d"),
                "price": float(round(close_price, 2)),
                "label": f"Day {i+1}"
            })
        
        return {
            "return_1day": round(return_1day, 2),
            "return_5day": round(return_5day, 2) if return_5day is not None else None,
            "earnings_date": earnings_date,
            "return_1day_date": one_day_date.strftime("%Y-%m-%d"),
            "return_5day_date": five_day_date.strftime("%Y-%m-%d") if five_day_date is not None else None,
            "daily_prices": daily_prices
        }
    
    except Exception as e:
        # Return None values if we can't calculate returns (missing data, delisted stock, etc.)
        # This allows the analysis to proceed without blocking on price data
        print(f"Price data unavailable for {ticker.upper()} ({type(e).__name__})")
        return {
            "return_1day": None,
            "return_5day": None,
            "earnings_date": earnings_date,
            "return_1day_date": None,
            "return_5day_date": None,
            "daily_prices": [],
            "error": "Price data is unavailable for this call."
        }


def get_stock_returns(ticker: str, year: int, quarter: int, earnings_date: str | None = None) -> dict:

    """
    Main function: fetch earnings date and calculate returns.
    
    Returns: {
        "return_1day": float or None
        "return_5day": float or None
        "earnings_date": str
        "error": str (if any)
    }
    """
    try:
        earnings_date = earnings_date or get_earnings_date(ticker, year, quarter)
        
        if not earnings_date:
            return {
                "return_1day": None,
                "return_5day": None,
                "error": f"Could not find earnings date for {ticker.upper()} Q{quarter} {year}"
            }
        
        returns = calculate_returns(ticker, earnings_date)
        return returns
    
    except Exception as e:
        return {
            "return_1day": None,
            "return_5day": None,
            "error": "Price data is unavailable for this call."
        }
