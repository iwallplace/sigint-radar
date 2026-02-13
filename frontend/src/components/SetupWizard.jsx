import { useState, useEffect } from "react";
import { useI18n } from "../i18n";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

/* Fix default marker icon for bundlers */
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const REGION_OPTIONS = [
  { value: "eu", label: "Europe (EU)" },
  { value: "us", label: "Americas (US/CA)" },
  { value: "tr", label: "Turkey (TR)" },
  { value: "jp", label: "Japan (JP)" },
  { value: "au", label: "Australia (AU/NZ)" },
];

const STEPS = ["location", "region", "sdr", "language"];

function MapClick({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function SetupWizard({ sendMessage, rtlsdrConnected, bands }) {
  const { t, lang, setLang } = useI18n();
  const [step, setStep] = useState(0);

  // Location
  const [lat, setLat] = useState(41.0082);
  const [lon, setLon] = useState(28.9784);
  const [stationName, setStationName] = useState("");
  const [antennaHeight, setAntennaHeight] = useState(10);
  const [detecting, setDetecting] = useState(false);

  // Region
  const [region, setRegion] = useState("eu");
  const [detectedRegion, setDetectedRegion] = useState("");

  // SDR
  const [gain, setGain] = useState(40);
  const [ppm, setPpm] = useState(0);
  const [biasTee, setBiasTee] = useState(false);

  // Language
  const [language, setLanguage] = useState(lang);

  // Detect region when coordinates change
  useEffect(() => {
    const REGION_MAP = {
      TR: "tr",
      DE: "eu", FR: "eu", GB: "eu", IT: "eu", ES: "eu",
      NL: "eu", BE: "eu", AT: "eu", CH: "eu", PL: "eu",
      US: "us", CA: "us", MX: "us",
      JP: "jp",
      AU: "au", NZ: "au",
    };

    async function detect() {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
        );
        const data = await res.json();
        const cc = data?.address?.country_code?.toUpperCase();
        if (cc) {
          const r = REGION_MAP[cc] || "eu";
          setDetectedRegion(r);
          setRegion(r);
        }
      } catch {
        // ignore
      }
    }

    if (lat !== 0 && lon !== 0) detect();
  }, [lat, lon]);

  const detectFromIP = async () => {
    setDetecting(true);
    try {
      const res = await fetch("https://ipinfo.io/json");
      const data = await res.json();
      if (data.loc) {
        const [la, lo] = data.loc.split(",").map(Number);
        setLat(la);
        setLon(lo);
      }
    } catch {
      // ignore
    }
    setDetecting(false);
  };

  const handleMapClick = (la, lo) => {
    setLat(parseFloat(la.toFixed(6)));
    setLon(parseFloat(lo.toFixed(6)));
  };

  const handleLanguageChange = (newLang) => {
    setLanguage(newLang);
    setLang(newLang);
  };

  const handleStart = () => {
    sendMessage("save_setup", {
      station: {
        lat,
        lon,
        name: stationName,
        altitude_m: antennaHeight,
        location_source: "setup",
      },
      region,
      rtlsdr: {
        gain,
        ppm_correction: ppm,
        bias_tee: biasTee,
      },
      language,
    });
  };

  const canNext = () => {
    if (step === 0) return lat !== 0 || lon !== 0;
    return true;
  };

  const regionBands = (bands || []).filter(
    (b) => b.region === region || b.region === "universal",
  );

  return (
    <div className="h-screen bg-gray-950 text-green-400 font-mono flex items-center justify-center">
      <div className="w-full max-w-2xl bg-gray-900 border border-gray-700 rounded-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gray-800 px-6 py-4 border-b border-gray-700">
          <h1 className="text-xl font-bold tracking-widest text-center">
            {t("setup.title")}
          </h1>
          {/* Step indicators */}
          <div className="flex justify-center gap-2 mt-3">
            {STEPS.map((s, i) => (
              <div
                key={s}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${
                  i === step
                    ? "bg-green-900/50 text-green-400 border border-green-700"
                    : i < step
                      ? "text-green-600"
                      : "text-gray-600"
                }`}
              >
                <span className="font-bold">{i + 1}</span>
                <span>
                  {t(`setup.step_${s}`)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 min-h-[400px]">
          {/* Step 1: Location */}
          {step === 0 && (
            <div className="space-y-4">
              <div className="h-48 rounded overflow-hidden border border-gray-700">
                <MapContainer
                  center={[lat, lon]}
                  zoom={6}
                  style={{ height: "100%", width: "100%" }}
                  attributionControl={false}
                >
                  <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
                  <Marker position={[lat, lon]} />
                  <MapClick onMapClick={handleMapClick} />
                </MapContainer>
              </div>

              <p className="text-xs text-gray-500 text-center">
                {t("setup.click_map")}
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">
                    {t("setup.latitude")}
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={lat}
                    onChange={(e) => setLat(parseFloat(e.target.value) || 0)}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-green-400 focus:outline-none focus:border-green-600"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">
                    {t("setup.longitude")}
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={lon}
                    onChange={(e) => setLon(parseFloat(e.target.value) || 0)}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-green-400 focus:outline-none focus:border-green-600"
                  />
                </div>
              </div>

              <button
                onClick={detectFromIP}
                disabled={detecting}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                {detecting ? t("setup.detecting") : t("setup.detect_ip")}
              </button>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">
                    {t("setup.station_name")}
                  </label>
                  <input
                    type="text"
                    value={stationName}
                    onChange={(e) => setStationName(e.target.value)}
                    placeholder={t("setup.station_name_placeholder")}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-green-400 placeholder-gray-600 focus:outline-none focus:border-green-600"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">
                    {t("setup.antenna_height")}
                  </label>
                  <input
                    type="number"
                    value={antennaHeight}
                    onChange={(e) =>
                      setAntennaHeight(parseInt(e.target.value) || 0)
                    }
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-green-400 focus:outline-none focus:border-green-600"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Region */}
          {step === 1 && (
            <div className="space-y-4">
              {detectedRegion && (
                <div className="bg-gray-800 border border-gray-700 rounded p-3">
                  <span className="text-xs text-gray-500">
                    {t("setup.region_detected")}:
                  </span>
                  <span className="text-sm text-green-400 ml-2 font-bold">
                    {REGION_OPTIONS.find((r) => r.value === detectedRegion)
                      ?.label || detectedRegion}
                  </span>
                </div>
              )}

              <div>
                <label className="text-xs text-gray-500 block mb-2">
                  {t("setup.region_override")}
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {REGION_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setRegion(opt.value)}
                      className={`text-left px-4 py-2 rounded border transition-colors ${
                        region === opt.value
                          ? "border-green-600 bg-green-900/30 text-green-400"
                          : "border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-2">
                  {t("setup.region_bands")}
                </label>
                <div className="bg-gray-800 border border-gray-700 rounded p-3 max-h-36 overflow-y-auto">
                  {regionBands.length > 0 ? (
                    <div className="grid grid-cols-2 gap-1 text-xs">
                      {regionBands.map((b) => (
                        <div key={b.name} className="text-gray-400">
                          {b.description || b.name}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-600">
                      Loading bands...
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: RTL-SDR */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="bg-gray-800 border border-gray-700 rounded p-3 flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  {t("setup.sdr_status")}
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${rtlsdrConnected ? "bg-green-500" : "bg-yellow-500"}`}
                  />
                  <span
                    className={`text-sm ${rtlsdrConnected ? "text-green-400" : "text-yellow-400"}`}
                  >
                    {rtlsdrConnected
                      ? t("setup.sdr_connected")
                      : t("setup.sdr_not_connected")}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-2">
                  {t("setup.gain")}: {gain} dB
                </label>
                <input
                  type="range"
                  min="0"
                  max="50"
                  value={gain}
                  onChange={(e) => setGain(parseInt(e.target.value))}
                  className="w-full accent-green-500"
                />
                <div className="flex justify-between text-xs text-gray-600">
                  <span>0</span>
                  <span>25</span>
                  <span>50</span>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  {t("setup.ppm")}
                </label>
                <input
                  type="number"
                  value={ppm}
                  onChange={(e) => setPpm(parseInt(e.target.value) || 0)}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-green-400 focus:outline-none focus:border-green-600"
                />
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={biasTee}
                  onChange={(e) => setBiasTee(e.target.checked)}
                  className="accent-green-500 w-4 h-4"
                />
                <span className="text-sm">{t("setup.bias_tee")}</span>
              </label>
            </div>
          )}

          {/* Step 4: Language */}
          {step === 3 && (
            <div className="space-y-4">
              <label className="text-xs text-gray-500 block mb-2">
                {t("setup.select_language")}
              </label>
              <div className="grid grid-cols-1 gap-2">
                <button
                  onClick={() => handleLanguageChange("en")}
                  className={`text-left px-4 py-3 rounded border transition-colors ${
                    language === "en"
                      ? "border-green-600 bg-green-900/30 text-green-400"
                      : "border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600"
                  }`}
                >
                  English
                </button>
                <button
                  onClick={() => handleLanguageChange("tr")}
                  className={`text-left px-4 py-3 rounded border transition-colors ${
                    language === "tr"
                      ? "border-green-600 bg-green-900/30 text-green-400"
                      : "border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600"
                  }`}
                >
                  Turkce
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer navigation */}
        <div className="px-6 py-4 border-t border-gray-700 flex justify-between">
          <button
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0}
            className="px-4 py-2 text-sm bg-gray-800 border border-gray-700 rounded hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {t("setup.prev")}
          </button>

          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canNext()}
              className="px-6 py-2 text-sm bg-green-900/50 border border-green-700 rounded text-green-400 hover:bg-green-800/50 transition-colors disabled:opacity-30"
            >
              {t("setup.next")}
            </button>
          ) : (
            <button
              onClick={handleStart}
              className="px-6 py-2 text-sm bg-green-700 border border-green-600 rounded text-white font-bold hover:bg-green-600 transition-colors animate-pulse"
            >
              {t("setup.start")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
