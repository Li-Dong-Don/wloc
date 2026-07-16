/*
 * Rewrite Tencent Maps reverse-geocoding requests to the location saved by WLOC.
 * Stored WLOC coordinates are WGS-84; Tencent Maps expects GCJ-02 in mainland China.
 */

const SETTINGS_KEY = "wloc_settings";
const requestUrl = typeof $request !== "undefined" ? $request.url || "" : "";

function readSettings() {
  let value = null;

  try {
    if (typeof $prefs !== "undefined") {
      value = $prefs.valueForKey(SETTINGS_KEY);
    } else if (typeof $persistentStore !== "undefined") {
      value = $persistentStore.read(SETTINGS_KEY);
    }

    for (let i = 0; i < 2 && typeof value === "string"; i += 1) {
      value = JSON.parse(value);
    }
  } catch (error) {
    console.log(`[wloc-tencent] Failed to read settings: ${error.message || error}`);
    return null;
  }

  return value && typeof value === "object" ? value : null;
}

function outOfChina(longitude, latitude) {
  return longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271;
}

function transformLatitude(longitude, latitude) {
  let result = -100 + 2 * longitude + 3 * latitude + 0.2 * latitude * latitude;
  result += 0.1 * longitude * latitude + 0.2 * Math.sqrt(Math.abs(longitude));
  result += ((20 * Math.sin(6 * longitude * Math.PI) + 20 * Math.sin(2 * longitude * Math.PI)) * 2) / 3;
  result += ((20 * Math.sin(latitude * Math.PI) + 40 * Math.sin((latitude / 3) * Math.PI)) * 2) / 3;
  result += ((160 * Math.sin((latitude / 12) * Math.PI) + 320 * Math.sin((latitude * Math.PI) / 30)) * 2) / 3;
  return result;
}

function transformLongitude(longitude, latitude) {
  let result = 300 + longitude + 2 * latitude + 0.1 * longitude * longitude;
  result += 0.1 * longitude * latitude + 0.1 * Math.sqrt(Math.abs(longitude));
  result += ((20 * Math.sin(6 * longitude * Math.PI) + 20 * Math.sin(2 * longitude * Math.PI)) * 2) / 3;
  result += ((20 * Math.sin(longitude * Math.PI) + 40 * Math.sin((longitude / 3) * Math.PI)) * 2) / 3;
  result += ((150 * Math.sin((longitude / 12) * Math.PI) + 300 * Math.sin((longitude / 30) * Math.PI)) * 2) / 3;
  return result;
}

function wgs84ToGcj02(longitude, latitude) {
  if (outOfChina(longitude, latitude)) return { longitude, latitude };

  const earthRadius = 6378245;
  const eccentricity = 0.006693421622965943;
  let latitudeDelta = transformLatitude(longitude - 105, latitude - 35);
  let longitudeDelta = transformLongitude(longitude - 105, latitude - 35);
  const radianLatitude = (latitude / 180) * Math.PI;
  let magic = Math.sin(radianLatitude);
  magic = 1 - eccentricity * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  latitudeDelta = (latitudeDelta * 180) / (((earthRadius * (1 - eccentricity)) / (magic * sqrtMagic)) * Math.PI);
  longitudeDelta = (longitudeDelta * 180) / ((earthRadius / sqrtMagic) * Math.cos(radianLatitude) * Math.PI);

  return {
    longitude: longitude + longitudeDelta,
    latitude: latitude + latitudeDelta,
  };
}

function replaceLocation(url, latitude, longitude) {
  const encodedLocation = encodeURIComponent(`${latitude},${longitude}`);
  return url.replace(/([?&]location=)[^&]*/i, (match, prefix) => `${prefix}${encodedLocation}`);
}

function finish(result) {
  if (typeof $done === "function") $done(result);
}

try {
  const settings = readSettings();
  const hasSavedCoordinates = Boolean(
    settings &&
      settings.longitude !== null &&
      settings.longitude !== undefined &&
      settings.longitude !== "" &&
      settings.latitude !== null &&
      settings.latitude !== undefined &&
      settings.latitude !== "",
  );
  const longitude = Number(settings && settings.longitude);
  const latitude = Number(settings && settings.latitude);
  const isTencentGeocoder = /^https?:\/\/apis\.map\.qq\.com\/ws\/geocoder\/v1(?:[/?]|$)/i.test(requestUrl);
  const hasLocation = /[?&]location=/i.test(requestUrl);

  if (
    !isTencentGeocoder ||
    !hasLocation ||
    !hasSavedCoordinates ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude)
  ) {
    console.log("[wloc-tencent] Pass through: no saved coordinates or unsupported request");
    finish({});
  } else {
    const converted = wgs84ToGcj02(longitude, latitude);
    const url = replaceLocation(requestUrl, converted.latitude, converted.longitude);
    console.log(
      `[wloc-tencent] Rewrote geocoder location: WGS84 ${latitude},${longitude} -> GCJ02 ${converted.latitude},${converted.longitude}`,
    );
    finish({ url });
  }
} catch (error) {
  console.log(`[wloc-tencent] Rewrite failed: ${error.message || error}`);
  finish({});
}
