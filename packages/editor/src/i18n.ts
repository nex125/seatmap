export type SeatmapEditorTranslateValues = Record<string, string | number>;

export type SeatmapEditorTranslate = (
  key: string,
  values?: SeatmapEditorTranslateValues,
) => string;

function interpolate(template: string, values?: SeatmapEditorTranslateValues): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, token) => {
    const value = values[token];
    return value === undefined ? match : String(value);
  });
}

export function translateEditorText(
  translate: SeatmapEditorTranslate | undefined,
  key: string,
  fallback: string,
  values?: SeatmapEditorTranslateValues,
): string {
  if (translate) {
    try {
      const translated = translate(key, values);
      if (translated && translated !== key) {
        return translated;
      }
    } catch {
      // Fall through to fallback text.
    }
  }

  return interpolate(fallback, values);
}
