const CATEGORY_MAP = {
  aircraft:        { color: "#3b82f6", icon: "\u2708", label: "Aircraft" },
  satellite:       { color: "#06b6d4", icon: "\ud83d\udef0", label: "Satellite" },
  weather_station: { color: "#22c55e", icon: "\u25cf", label: "Weather" },
  ism_sensor:      { color: "#22c55e", icon: "\u25cf", label: "ISM" },
  radio:           { color: "#eab308", icon: "\u25cf", label: "Radio" },
  pager:           { color: "#f97316", icon: "\u25cf", label: "Pager" },
  fm_broadcast:    { color: "#ffffff", icon: "\u25cf", label: "FM" },
  tetra:           { color: "#a855f7", icon: "\u25cf", label: "TETRA" },
  pmr:             { color: "#eab308", icon: "\u25cf", label: "PMR" },
  marine:          { color: "#0ea5e9", icon: "\u25cf", label: "Marine" },
  unknown:         { color: "#ef4444", icon: "\u25cf", label: "Unknown" },
  scada:           { color: "#ef4444", icon: "\u25cf", label: "SCADA" },
};

export function getCategoryStyle(category) {
  return CATEGORY_MAP[category] || CATEGORY_MAP.unknown;
}

export function getSignalColor(category) {
  return (CATEGORY_MAP[category] || CATEGORY_MAP.unknown).color;
}

export default CATEGORY_MAP;
