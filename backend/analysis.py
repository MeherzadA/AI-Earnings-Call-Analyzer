import os
from pathlib import Path
from typing import Literal
from google import genai
from google.genai import errors, types
from dotenv import load_dotenv
from pydantic import BaseModel, Field, ValidationError
import httpx

load_dotenv(Path(__file__).with_name(".env"))


class AnalysisReport(BaseModel):
    sentiment: Literal["positive", "neutral", "negative"]
    sentiment_score: float = Field(ge=-1, le=1, allow_inf_nan=False)
    summary: str = Field(min_length=1)
    key_claims: list[str]
    red_flags: list[str]
    opportunities: list[str]

def analyze_transcript(ticker: str, year: int, quarter: int, transcript_text: str) -> dict:

    prompt = f"""
    You are a professional equity research analyst analyzing an earnings call transcript.

    Company: {ticker}
    Period: Q{quarter} {year}

    Your task is to analyze the transcript and produce a structured assessment of management tone,
    key statements, risks, and potential growth opportunities.

    Guidelines:
    - Base your analysis ONLY on statements explicitly present in the transcript.
    - Do NOT invent financial data, events, or claims.
    - Use neutral, professional language similar to an equity research note.
    - Think step-by-step internally before producing the final JSON output, but DO NOT include your reasoning in the response.
    - Note that earnings calls are often forward-looking and may contain projections, guidance, and management's perspectives on future performance. 
      Your sentiment score should be calculated critically based on the transcript and do a bit of thought before assigning a score. For example, if management is projecting strong future growth but the current quarter was weak, you might assign a positive sentiment but a moderate score (e.g. 0.5) to reflect the mixed signals. Be objective and consider the overall tone and content of the call when determining sentiment.

    Definitions:

    Sentiment:
    The overall tone of management regarding business performance and future outlook.

    Sentiment Score:
    A number between -1.0 and 1.0 where:
    - -1.0 = very negative outlook
    - 0.0 = neutral / balanced
    - 1.0 = very positive outlook

    Key Claims:
    Important statements management makes about:
    - revenue or earnings trends
    - margins or profitability
    - strategy or investments
    - market demand
    - future guidance
    - operational performance

    Red Flags:
    Signals of risk such as:
    - weakening demand
    - declining margins
    - cost pressures
    - lowered guidance
    - regulatory risks
    - operational challenges
    - vague or uncertain management responses

    Opportunities:
    Potential positive drivers such as:
    - strong demand
    - new product launches
    - market expansion
    - margin improvement
    - cost reductions
    - strategic partnerships
    - favorable industry trends

    Return a JSON object with EXACTLY the following schema:

    {{
        "sentiment": "positive" | "neutral" | "negative",
        "sentiment_score": number from -1.0 (very negative) to 1.0 (very positive),
        "summary": "2-3 sentence plain English summary of the call",
        "key_claims": ["list the most important claims, as many as warranted"],
        "red_flags": ["list all significant red flags, or empty array if none"],
        "opportunities": ["list all significant opportunities, or empty array if none"]
    }}

    Requirements:
    - Your response MUST be valid JSON.
    - Do NOT include markdown formatting.
    - Do NOT include explanations or commentary.
    - Return ONLY the JSON object.

    Transcript:
    {transcript_text}
    """
    
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("AI analysis is not configured on this server.")

    try:
        with genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(timeout=60000, retry_options=types.HttpRetryOptions(attempts=1)),
        ) as client:
            response = client.models.generate_content(
                model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json", response_schema=AnalysisReport,
                ),
            )
        return AnalysisReport.model_validate_json(response.text or "").model_dump()
    except errors.APIError as exc:
        if exc.code == 429:
            raise RuntimeError("The AI provider's quota is currently exhausted. Please try again later.") from exc
        raise RuntimeError("The AI provider is unavailable. Please try again later.") from exc
    except httpx.HTTPError as exc:
        raise RuntimeError("The AI provider did not respond in time. Please try again later.") from exc
    except ValidationError as exc:
        raise RuntimeError("The AI provider returned an incomplete report. Please try again.") from exc


if __name__ == "__main__":
    from transcript import fetch_transcript
    data = fetch_transcript("AAPL", 2024, 1)
    result = analyze_transcript("AAPL", 2024, 1, data["content"])
    import pprint
    pprint.pprint(result)
