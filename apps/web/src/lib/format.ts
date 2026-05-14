export type NumberFormatPreferences = {
  locale: string;
  currencyFractionDigits: number;
  largeCurrencyFractionDigits: number;
  largeCurrencyThreshold: number;
  numberFractionDigits: number;
  percentFractionDigits: number;
  largePercentFractionDigits: number;
  largePercentThreshold: number;
};

export const defaultNumberFormatPreferences: NumberFormatPreferences = {
  locale: "en-US",
  currencyFractionDigits: 2,
  largeCurrencyFractionDigits: 0,
  largeCurrencyThreshold: 1_000_000,
  numberFractionDigits: 0,
  percentFractionDigits: 2,
  largePercentFractionDigits: 0,
  largePercentThreshold: 1_000,
};

function formatter(
  options: Intl.NumberFormatOptions,
  preferences: NumberFormatPreferences = defaultNumberFormatPreferences,
) {
  return new Intl.NumberFormat(preferences.locale, {
    useGrouping: true,
    ...options,
  });
}

export function formatCurrencyAmount(
  value: number | null | undefined,
  currency: string,
  preferences: NumberFormatPreferences = defaultNumberFormatPreferences,
) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "-";
  }

  return `${formatCurrencyNumber(value, preferences)}\u00a0${currency}`;
}

export function formatCurrencyNumber(
  value: number | null | undefined,
  preferences: NumberFormatPreferences = defaultNumberFormatPreferences,
) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "-";
  }

  const fractionDigits =
    Math.abs(value) > preferences.largeCurrencyThreshold
      ? preferences.largeCurrencyFractionDigits
      : preferences.currencyFractionDigits;

  return formatter(
    {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    },
    preferences,
  ).format(value);
}

export function formatNumber(
  value: number | null | undefined,
  preferences: NumberFormatPreferences = defaultNumberFormatPreferences,
  fractionDigits = preferences.numberFractionDigits,
) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "-";
  }

  return formatter(
    {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    },
    preferences,
  ).format(value);
}

export function formatPercent(
  value: number | null | undefined,
  preferences: NumberFormatPreferences = defaultNumberFormatPreferences,
  options: { sign?: "auto" | "always" | "never"; suffix?: string } = {},
) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "-";
  }

  const sign = options.sign ?? "auto";
  const prefix = sign === "always" && value > 0 ? "+" : sign === "never" ? "" : value > 0 ? "+" : "";
  const absoluteValue = sign === "never" ? Math.abs(value) : value;
  const fractionDigits =
    Math.abs(value) > preferences.largePercentThreshold
      ? preferences.largePercentFractionDigits
      : preferences.percentFractionDigits;
  const formatted = formatter(
    {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    },
    preferences,
  ).format(absoluteValue);

  return `${prefix}${formatted}%${options.suffix ?? ""}`;
}
