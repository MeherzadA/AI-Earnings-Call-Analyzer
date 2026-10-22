# How reports are checked

After Gemini writes a report, the app checks that:

- Quotes match the transcript.
- Numbers and units match the quoted text.
- The response follows the expected format.

Findings that fail are removed. These checks catch some mistakes, but the AI can still miss context or draw conclusions the transcript doesn't support.

An early AI review flagged unsupported interpretations in 6 of 18 statements across three sample reports. Those six were removed from the displayed examples. This used older prompts and isn't an accuracy score for the current app.

**No independent human review has been done.** The original statements and review decisions are kept in the [review data](../frontend/public/evaluation/).
