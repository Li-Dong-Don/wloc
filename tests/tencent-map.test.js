const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const script = fs.readFileSync(path.join(__dirname, "../dist/tencent-map.js"), "utf8");

function run({ url, stored, argument }) {
  let result;
  const context = {
    $request: { url },
    $argument: argument,
    $persistentStore: {
      read(key) {
        assert.equal(key, "wloc_settings");
        return stored == null ? null : JSON.stringify(stored);
      },
    },
    $done(value) {
      result = value;
    },
    console: { log() {} },
  };
  vm.runInNewContext(script, context);
  return result;
}

test("rewrites Tencent reverse geocoder using saved WGS84 coordinates", () => {
  const result = run({
    url: "https://apis.map.qq.com/ws/geocoder/v1?location=25.261026%2C110.304232&key=test&get_poi=1",
    stored: { longitude: 110.30423258463541, latitude: 25.261026746961807 },
  });
  const rewritten = new URL(result.url);
  const [latitude, longitude] = rewritten.searchParams.get("location").split(",").map(Number);

  assert.equal(rewritten.searchParams.get("key"), "test");
  assert.equal(rewritten.searchParams.get("get_poi"), "1");
  assert.ok(Math.abs(latitude - 25.25826) < 0.001);
  assert.ok(Math.abs(longitude - 110.30891) < 0.001);
});

test("passes through when only untouched module defaults are present", () => {
  const result = run({
    url: "https://apis.map.qq.com/ws/geocoder/v1?location=25,110&key=test",
    argument: "longitude=113.94114&latitude=22.544577",
  });
  assert.equal(Object.keys(result).length, 0);
});

test("uses custom module arguments when no saved settings exist", () => {
  const result = run({
    url: "https://apis.map.qq.com/ws/geocoder/v1?location=25,110&key=test",
    argument: "longitude=2.3522&latitude=48.8566",
  });
  assert.equal(new URL(result.url).searchParams.get("location"), "48.856600,2.352200");
});

test("passes through unrelated Tencent endpoints", () => {
  const result = run({
    url: "https://apis.map.qq.com/ws/place/v1/search?boundary=nearby(25,110)&key=test",
    stored: { longitude: 110.3, latitude: 25.2 },
  });
  assert.equal(Object.keys(result).length, 0);
});
