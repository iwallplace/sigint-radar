const TX_POWER = {
  fm_broadcast: 60,
  tetra: 40,
  gsm_bts: 43,
  pmr446: 10,
  pmr: 10,
  radio: 10,
  ism_433: 0,
  ism_868: 7,
  lora: 14,
  adsb: 20,
  aircraft: 20,
  radiosonde: 20,
  pocsag: 30,
  pager: 30,
  marine_vhf: 25,
  marine: 25,
  weather_station: 0,
  ism_sensor: 0,
  satellite: 20,
  unknown: 10,
};

export function estimateDistanceKm(freqMhz, rxDbm, category = "unknown") {
  const txDbm = TX_POWER[category] ?? 10;
  if (freqMhz <= 0) return 0.1;
  try {
    const fspl = txDbm - rxDbm - 20 * Math.log10(freqMhz) - 32.44;
    const distance = Math.pow(10, fspl / 20);
    return Math.max(0.1, Math.min(distance, 800));
  } catch {
    return 0.1;
  }
}
