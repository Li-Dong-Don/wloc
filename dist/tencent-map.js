/* tencent-map.js - Rewrite Tencent reverse-geocoder coordinates from WLOC settings. */
(function () {
  "use strict";

  var SETTINGS_KEY = "wloc_settings";
  var DEFAULT_LONGITUDE = 113.94114;
  var DEFAULT_LATITUDE = 22.544577;

  function readStoredSettings() {
    var raw = null;
    try {
      if (typeof $persistentStore !== "undefined") {
        raw = $persistentStore.read(SETTINGS_KEY);
      } else if (typeof $prefs !== "undefined") {
        raw = $prefs.valueForKey(SETTINGS_KEY);
      }
      if (!raw) return null;
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (error) {
      console.log("[tencent-map] Failed to read saved settings: " + error.message);
      return null;
    }
  }

  function parseArguments(raw) {
    var result = {};
    if (!raw) return result;
    if (Array.isArray(raw)) raw = raw.join("&");
    if (typeof raw === "object") return raw;

    String(raw).replace(/^\?/, "").split("&").forEach(function (part) {
      if (!part) return;
      var index = part.indexOf("=");
      var key = index === -1 ? part : part.slice(0, index);
      var value = index === -1 ? "" : part.slice(index + 1);
      try {
        key = decodeURIComponent(key.replace(/\+/g, " "));
        value = decodeURIComponent(value.replace(/\+/g, " "));
      } catch (error) {}
      result[key] = value;
    });
    return result;
  }

  function getTarget() {
    var stored = readStoredSettings();
    var args = parseArguments(typeof $argument === "undefined" ? "" : $argument);
    var longitude = Number(stored && stored.longitude != null ? stored.longitude : args.longitude);
    var latitude = Number(stored && stored.latitude != null ? stored.latitude : args.latitude);

    if (!stored && longitude === DEFAULT_LONGITUDE && latitude === DEFAULT_LATITUDE) return null;
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
    if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return null;
    return { longitude: longitude, latitude: latitude };
  }

  function outOfChina(longitude, latitude) {
    return longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271;
  }

  function transformLatitude(x, y) {
    var value = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    value += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
    value += (20 * Math.sin(y * Math.PI) + 40 * Math.sin(y / 3 * Math.PI)) * 2 / 3;
    value += (160 * Math.sin(y / 12 * Math.PI) + 320 * Math.sin(y * Math.PI / 30)) * 2 / 3;
    return value;
  }

  function transformLongitude(x, y) {
    var value = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    value += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
    value += (20 * Math.sin(x * Math.PI) + 40 * Math.sin(x / 3 * Math.PI)) * 2 / 3;
    value += (150 * Math.sin(x / 12 * Math.PI) + 300 * Math.sin(x / 30 * Math.PI)) * 2 / 3;
    return value;
  }

  function wgs84ToGcj02(latitude, longitude) {
    if (outOfChina(longitude, latitude)) return { latitude: latitude, longitude: longitude };
    var a = 6378245;
    var ee = 0.006693421622965943;
    var deltaLatitude = transformLatitude(longitude - 105, latitude - 35);
    var deltaLongitude = transformLongitude(longitude - 105, latitude - 35);
    var radLatitude = latitude / 180 * Math.PI;
    var magic = Math.sin(radLatitude);
    magic = 1 - ee * magic * magic;
    var sqrtMagic = Math.sqrt(magic);
    deltaLatitude = deltaLatitude * 180 / (a * (1 - ee) / (magic * sqrtMagic) * Math.PI);
    deltaLongitude = deltaLongitude * 180 / (a / sqrtMagic * Math.cos(radLatitude) * Math.PI);
    return { latitude: latitude + deltaLatitude, longitude: longitude + deltaLongitude };
  }

  function rewriteLocation(url, latitude, longitude) {
    if (!/^https?:\/\/apis\.map\.qq\.com\/ws\/geocoder\/v1(?:[/?]|$)/i.test(url)) return null;
    if (!/[?&]location=/i.test(url)) return null;
    var value = encodeURIComponent(latitude.toFixed(6) + "," + longitude.toFixed(6));
    return url.replace(/([?&]location=)[^&]*/i, "$1" + value);
  }

  var target = getTarget();
  if (!target) {
    console.log("[tencent-map] Pass-through: no target coordinates configured");
    $done({});
    return;
  }

  var gcj = wgs84ToGcj02(target.latitude, target.longitude);
  var rewritten = rewriteLocation($request.url || "", gcj.latitude, gcj.longitude);
  if (!rewritten) {
    console.log("[tencent-map] Pass-through: unsupported request");
    $done({});
    return;
  }

  console.log("[tencent-map] Rewrote reverse geocoder location to " + gcj.latitude.toFixed(6) + "," + gcj.longitude.toFixed(6));
  $done({ url: rewritten });
})();
