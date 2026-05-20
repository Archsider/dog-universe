// Encoded-polyline decoder (Google polyline algorithm, precision 5).
//
// OSRM returns route geometries as an encoded string using this format
// (`geometries=polyline` in the request). The string compresses a list of
// lat/lng points with delta encoding + variable-length integers. Decoding
// is a fixed-cost algorithm (no allocations beyond the result array), safe
// to run on every SSE `eta` event (≤ ~30 / minute).
//
// Reference :
// https://developers.google.com/maps/documentation/utilities/polylinealgorithm
//
// Returns an empty array on any decoding error — callers should treat that
// as "no route polyline" rather than throwing.

export function decodePolyline(encoded: string, precision = 5): [number, number][] {
  if (!encoded || typeof encoded !== 'string') return [];
  const factor = Math.pow(10, precision);
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const len = encoded.length;

  while (index < len) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= len) return points;
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dLat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dLat;

    result = 0;
    shift = 0;
    do {
      if (index >= len) return points;
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dLng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += dLng;

    points.push([lat / factor, lng / factor]);
  }

  return points;
}
