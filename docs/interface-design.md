# Interface design

Earnings Analyzer is a tool for reading a call, checking its statements and comparing periods. Its interface should make those tasks clear without a marketing voice.

## Type and labels

- Use IBM Plex Sans for interface text and headings. Use IBM Plex Mono for prices and financial values. Georgia is reserved for direct quotations.
- Use regular and medium weights for most text. Avoid tightly tracked, heavy display headings and condensed brand lettering.
- Name the content: “Findings”, “Risks and concerns”, “Share price”, “Forecast vs. reported”, “News coverage”, “Transcript excerpt”.
- Use sentence case. Do not add an uppercase label above a heading that repeats the same information.
- State actions directly: “Full transcript”, “View source”, “View price history”. Reserve external-link arrows for links that actually leave the app.
- Do not use slogans such as “The quarter, distilled”, “What moved the business”, “Start here. Follow the evidence”, or invented “desk” and “replay” labels.

## Layout

- Keep section headings smaller than the company name. Use alignment and spacing to separate sections, with restrained color accents for context.
- Show the call date and fiscal period together. Keep forecast and reported periods explicit; preserve the prominent BEFORE and AFTER comparison labels.
- Use real company and publisher marks. Do not add decorative tab icons, generated illustrations, icon tiles or numerical badges without a purpose.
- Avoid gradient banners, floating cards, pill-shaped category labels and animated entrances on every section. Keep normal hover/focus feedback and meaningful audio activity.
- Keep body text readable at 16px, with smaller supporting metadata used sparingly. Keep the source controls and actual data visible.
- Preserve AI attribution, source limitations and missing-data explanations. Visual cleanup must not imply additional verification or invent data.
- The landing page can use a dark market-screen treatment: faint grid, cyan accents and a short chart entrance. Keep report-reading pages light. The landing page must stay open instead of automatically navigating to a random report; its preview and returns come from existing reports and are labelled historical.

## Research used for this revision

These are references for design decisions, not claims that one font or layout can objectively eliminate an “AI-generated” appearance.

- [TradingView earnings calendar](https://www.tradingview.com/earnings-calendar/?countries=us): inspected the live interface for direct labels, data hierarchy and restrained section headings.
- [IBM Design Language: typeface](https://www.ibm.com/design/language/typography/typeface/): Plex family and its sans/mono variants.
- [GOV.UK Design System: headings](https://design-system.service.gov.uk/styles/headings/): consistent heading hierarchy and sentence case.
- [NN/g: applying writing guidelines to web pages](https://www.nngroup.com/articles/applying-writing-guidelines-web-pages/): concise, scannable, objective interface writing.
- [Anthropic: improving frontend design through Skills](https://claude.com/resources/articles/improving-frontend-design-through-skills): generic model defaults and the need for deliberate, context-specific choices. This app does not adopt its more decorative examples.
