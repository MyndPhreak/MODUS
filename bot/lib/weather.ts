// Open-Meteo weather helpers (free, no API key). Times come back in the
// location's own timezone via timezone=auto, so forecast days align to that
// location's calendar days.

export interface GeocodeResult {
  name: string;
  latitude: number;
  longitude: number;
  country_code: string;
  timezone: string;
  admin1?: string;
  country?: string;
}

export interface ForecastResponse {
  timezone: string;
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    weather_code: number;
    wind_speed_10m: number;
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
  };
}

// WMO weather interpretation codes → plain text.
export const WMO_DESCRIPTIONS: Record<number, string> = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Depositing rime fog",
  51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
  56: "Light freezing drizzle", 57: "Dense freezing drizzle",
  61: "Light rain", 63: "Moderate rain", 65: "Heavy rain",
  66: "Light freezing rain", 67: "Heavy freezing rain",
  71: "Light snow", 73: "Moderate snow", 75: "Heavy snow", 77: "Snow grains",
  80: "Light rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
  85: "Light snow showers", 86: "Heavy snow showers",
  95: "Thunderstorm", 96: "Thunderstorm with light hail", 99: "Thunderstorm with heavy hail",
};

export function describeWeatherCode(code: number): string {
  return WMO_DESCRIPTIONS[code] ?? `code ${code}`;
}

// Countries that use Fahrenheit / imperial for everyday weather.
const IMPERIAL_COUNTRIES = new Set(["US", "BS", "BZ", "KY", "LR", "PW", "FM", "MH"]);

export interface UnitChoice {
  imperial: boolean;
  temperatureUnit: "fahrenheit" | "celsius";
  windSpeedUnit: "mph" | "kmh";
}

export function selectUnits(countryCode: string): UnitChoice {
  const imperial = IMPERIAL_COUNTRIES.has((countryCode ?? "").toUpperCase());
  return {
    imperial,
    temperatureUnit: imperial ? "fahrenheit" : "celsius",
    windSpeedUnit: imperial ? "mph" : "kmh",
  };
}

export function cToF(c: number): number { return (c * 9) / 5 + 32; }
export function fToC(f: number): number { return ((f - 32) * 5) / 9; }

// Given a temperature already in the primary unit, render BOTH units, e.g. "74°F / 23°C".
export function formatTemp(value: number, imperial: boolean): string {
  const f = imperial ? value : cToF(value);
  const c = imperial ? fToC(value) : value;
  return `${Math.round(f)}°F / ${Math.round(c)}°C`;
}

export function buildGeocodeUrl(location: string): string {
  return `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`;
}

export function buildForecastUrl(lat: number, lon: number, units: UnitChoice): string {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: "auto",
    forecast_days: "7",
    temperature_unit: units.temperatureUnit,
    wind_speed_unit: units.windSpeedUnit,
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}
