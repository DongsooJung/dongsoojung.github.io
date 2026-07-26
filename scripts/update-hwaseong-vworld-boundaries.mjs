import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const apiKey = process.env.VWORLD_API_KEY;
const domain = process.env.VWORLD_DOMAIN || "https://www.stargateedu.co.kr";

if (!apiKey) {
  throw new Error("VWORLD_API_KEY 환경변수가 필요합니다.");
}

const here = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(
  here,
  "../hwaseong-real-estate/data/hwaseong-legal-dong.geojson",
);

const params = new URLSearchParams({
  service: "data",
  request: "GetFeature",
  data: "LT_C_ADEMD_INFO",
  key: apiKey,
  domain,
  format: "json",
  size: "100",
  page: "1",
  geometry: "true",
  attribute: "true",
  attrFilter: "full_nm:like:경기도 화성",
});

const response = await fetch(`https://api.vworld.kr/req/data?${params}`);
if (!response.ok) {
  throw new Error(`VWorld API 요청 실패: HTTP ${response.status}`);
}

const payload = await response.json();
if (payload?.response?.status !== "OK") {
  throw new Error(
    `VWorld API 오류: ${payload?.response?.error?.text || "알 수 없는 오류"}`,
  );
}

const features =
  payload.response.result?.featureCollection?.features?.map((feature) => {
    const fullName = feature.properties.full_nm;
    const [province, city, district, legalDong] = fullName.split(" ");
    return {
      type: "Feature",
      id: feature.properties.emd_cd,
      properties: {
        code: feature.properties.emd_cd,
        name: feature.properties.emd_kor_nm,
        district,
        city,
        province,
        fullName,
        source: "VWorld LT_C_ADEMD_INFO",
      },
      geometry: simplifyGeometry(feature.geometry, 0.000035),
    };
  }) || [];

features.sort((a, b) =>
  `${a.properties.district}${a.properties.name}`.localeCompare(
    `${b.properties.district}${b.properties.name}`,
    "ko",
  ),
);

const featureCollection = {
  type: "FeatureCollection",
  name: "화성시 법정동 경계",
  source: {
    provider: "VWorld 공간정보 오픈플랫폼",
    dataset: "LT_C_ADEMD_INFO",
    fetchedAt: new Date().toISOString(),
    domain,
  },
  features,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(featureCollection)}\n`, "utf8");

console.log(
  `${features.length}개 법정동 경계를 저장했습니다: ${outputPath}`,
);

function simplifyGeometry(geometry, tolerance) {
  if (!geometry) return geometry;
  const simplifyRing = (ring) => {
    if (ring.length <= 5) return ring;
    const closed = samePoint(ring[0], ring.at(-1));
    const points = closed ? ring.slice(0, -1) : ring;
    const simplified = simplifyDouglasPeucker(points, tolerance);
    if (simplified.length < 3) return ring;
    if (closed) simplified.push([...simplified[0]]);
    return simplified;
  };

  if (geometry.type === "Polygon") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map(simplifyRing),
    };
  }

  if (geometry.type === "MultiPolygon") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((polygon) =>
        polygon.map(simplifyRing),
      ),
    };
  }

  return geometry;
}

function simplifyDouglasPeucker(points, tolerance) {
  if (points.length <= 2) return points;
  const sqTolerance = tolerance * tolerance;
  const first = points[0];
  const last = points.at(-1);
  let maxSqDistance = sqTolerance;
  let index = -1;

  for (let i = 1; i < points.length - 1; i += 1) {
    const sqDistance = getSqSegmentDistance(points[i], first, last);
    if (sqDistance > maxSqDistance) {
      index = i;
      maxSqDistance = sqDistance;
    }
  }

  if (index === -1) return [first, last];
  const left = simplifyDouglasPeucker(points.slice(0, index + 1), tolerance);
  const right = simplifyDouglasPeucker(points.slice(index), tolerance);
  return left.slice(0, -1).concat(right);
}

function getSqSegmentDistance(point, start, end) {
  let x = start[0];
  let y = start[1];
  let dx = end[0] - x;
  let dy = end[1] - y;

  if (dx !== 0 || dy !== 0) {
    const t =
      ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = end[0];
      y = end[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }

  dx = point[0] - x;
  dy = point[1] - y;
  return dx * dx + dy * dy;
}

function samePoint(a, b) {
  return a?.[0] === b?.[0] && a?.[1] === b?.[1];
}
