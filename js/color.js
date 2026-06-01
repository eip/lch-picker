/* eslint-disable no-param-reassign, prefer-destructuring */

// Fast color space conversion
// Conversion logic from https://drafts.csswg.org/css-color-4/#color-conversion-code

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const SRGB_LINEAR_MIN = -0.000000386996904; // -0.000005 / 12.92
const SRGB_LINEAR_MAX = 1.0000113744453183; // ((1.000005 + 0.055) / 1.055) ** 2.4
const SRGB_GAMMA_THRESHOLD = 0.0031308;
const SRGB_GAMMA_EXP = 0.4166666666666667; // 1 / 2.4

function compandSrgb(linearValue) {
	return linearValue > SRGB_GAMMA_THRESHOLD ? 1.055 * linearValue ** SRGB_GAMMA_EXP - 0.055 : linearValue * 12.92;
}

// Convert OKLCH to sRGB
function oklch2sRGB(values) {
	// Convert from polar form OKLCH to OKLab
	const lBase = values[0];
	const chroma = values[1];
	const hueRad = values[2] * DEG2RAD;
	const a = chroma * Math.cos(hueRad);
	const b = chroma * Math.sin(hueRad);

	// Convert OKLab to XYZ (D65)
	const l = lBase + 0.3963377774 * a + 0.2158037573 * b;
	const m = lBase - 0.1055613458 * a - 0.0638541728 * b;
	const s = lBase - 0.0894841775 * a - 1.291485548 * b;

	const l3 = l * l * l;
	const m3 = m * m * m;
	const s3 = s * s * s;

	// Convert XYZ to linear-light sRGB
	const x = 1.2270138511 * l3 - 0.5577999807 * m3 + 0.281256149 * s3;
	const y = -0.0405801784 * l3 + 1.1122568696 * m3 - 0.0716766787 * s3;
	const z = -0.0763812845 * l3 - 0.4214819784 * m3 + 1.5861632204 * s3;
	let r = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
	let g = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
	let bCh = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;

	// Convert linear-light sRGB values in the range 0.0-1.0 to gamma corrected form
	// https://en.wikipedia.org/wiki/SRGB
	if (values.length < 4) {
		r = r < SRGB_LINEAR_MIN ? 0 : r > SRGB_LINEAR_MAX ? 1 : compandSrgb(r);
		g = g < SRGB_LINEAR_MIN ? 0 : g > SRGB_LINEAR_MAX ? 1 : compandSrgb(g);
		bCh = bCh < SRGB_LINEAR_MIN ? 0 : bCh > SRGB_LINEAR_MAX ? 1 : compandSrgb(bCh);
		values[0] = r;
		values[1] = g;
		values[2] = bCh;
	} else {
		let clipped = 0;

		if (r >= SRGB_LINEAR_MIN && r <= SRGB_LINEAR_MAX) r = compandSrgb(r);
		else {
			r = r > SRGB_LINEAR_MAX ? 1 : 0;
			clipped = 1;
		}

		if (g >= SRGB_LINEAR_MIN && g <= SRGB_LINEAR_MAX) g = compandSrgb(g);
		else {
			g = g > SRGB_LINEAR_MAX ? 1 : 0;
			clipped = 1;
		}

		if (bCh >= SRGB_LINEAR_MIN && bCh <= SRGB_LINEAR_MAX) bCh = compandSrgb(bCh);
		else {
			bCh = bCh > SRGB_LINEAR_MAX ? 1 : 0;
			clipped = 1;
		}

		values[0] = r;
		values[1] = g;
		values[2] = bCh;
		values[3] = clipped;
	}
	return values;
}

// Moves an OKLCH color into the sRGB gamut by holding the l and h steady,
// and adjusting the c via binary-search until the color is on the sRGB boundary.
function oklch2sRGBForce(values) {
	const l = values[0];
	const c = values[1];
	const h = values[2];
	oklch2sRGB(values);
	if (values.length < 4 || values[3] === 0) return values; // no clipped flag ys passed or color is not clipped

	let hiC = c;
	let loC = 0;
	const epsilon = 0.0005;
	while ((hiC - loC > epsilon || values[3] === 1) && hiC > epsilon) {
		const midC = (hiC + loC) / 2;
		values[0] = l;
		values[1] = midC;
		values[2] = h;
		oklch2sRGB(values);
		if (values[3] === 0) loC = midC;
		else hiC = midC;
	}
	values[3] = 1; // clipped flag
	return values;
}

// Convert sRGB to OKLCH
function sRGB2oklch(values) {
	// convert an array of sRGB values in the range 0.0 - 1.0
	// to linear light (un-companded) form.
	// https://en.wikipedia.org/wiki/SRGB
	let r = values[0] < 0.04045 ? values[0] / 12.92 : ((values[0] + 0.055) / 1.055) ** 2.4;
	const g = values[1] < 0.04045 ? values[1] / 12.92 : ((values[1] + 0.055) / 1.055) ** 2.4;
	let b = values[2] < 0.04045 ? values[2] / 12.92 : ((values[2] + 0.055) / 1.055) ** 2.4;

	// convert an array of linear-light sRGB values to CIE XYZ (D65)
	const x = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
	const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
	let z = 0.0193339 * r + 0.119192 * g + 0.9503041 * b;

	// Convert XYZ (D65) to OKLab
	const l = Math.cbrt(0.8189330101 * x + 0.3618667424 * y - 0.1288597137 * z);
	const m = Math.cbrt(0.0329845436 * x + 0.9293118715 * y + 0.0361456387 * z);
	const s = Math.cbrt(0.0482003018 * x + 0.2643662691 * y + 0.633851707 * z);

	values[0] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s; // L
	r = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s; // a
	b = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s; // b

	// Convert to polar form
	z = Math.atan2(b, r) * RAD2DEG; // Hue
	values[1] = Math.sqrt(r * r + b * b); // Chroma
	values[2] = z >= 0 ? z : z + 360; // Hue, in degrees [0 to 360)

	return values;
}

// Convert float sRGB values in the range 0.0-1.0 to integer values in the range 0-255
function sRGBfloat2int(rgb, buf) {
	buf[0] = rgb[0] * 255 + 0.5;
	buf[1] = rgb[1] * 255 + 0.5;
	buf[2] = rgb[2] * 255 + 0.5;
}

// Convert "#rrggbb" color to float sRGB
function hex2sRGB(hex) {
	const result = [0, 0, 0];
	if (!hex.match(/^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)) return result;
	// remove optional leading #
	if (hex.length === 4 || hex.length === 7) {
		hex = hex.substr(1);
	}
	// expand short-notation to full six-digit
	if (hex.length === 3) {
		hex = hex.split("");
		hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
	}
	const num = parseInt(hex, 16);
	result[0] = (num >> 16) / 255;
	result[1] = ((num >> 8) & 0xff) / 255;
	result[2] = (num & 0xff) / 255;
	return result;
}

if (typeof module === "object" && module.exports)
	module.exports = {
		oklch2sRGB,
		oklch2sRGBForce,
		sRGB2oklch,
		sRGBfloat2int,
		hex2sRGB,
	};
