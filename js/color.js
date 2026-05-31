/* eslint-disable no-param-reassign, prefer-destructuring */

// Fast color space conversion
// Conversion logic from https://drafts.csswg.org/css-color-4/#color-conversion-code

// Convert OKLCH to sRGB
function oklch2sRGB(values) {
	// Convert from polar form OKLCH to OKLab
	let x = values[0];
	let y = values[1];
	let z = (values[2] * Math.PI) / 180;
	values[1] = y * Math.cos(z);
	values[2] = y * Math.sin(z);

	// Convert OKLab to XYZ (D65)
	const l = x + 0.3963377774 * values[1] + 0.2158037573 * values[2];
	const m = x - 0.1055613458 * values[1] - 0.0638541728 * values[2];
	const s = x - 0.0894841775 * values[1] - 1.291485548 * values[2];

	const l3 = l * l * l;
	const m3 = m * m * m;
	const s3 = s * s * s;

	values[0] = 1.2270138511 * l3 - 0.5577999807 * m3 + 0.281256149 * s3;
	values[1] = -0.0405801784 * l3 + 1.1122568696 * m3 - 0.0716766787 * s3;
	values[2] = -0.0763812845 * l3 - 0.4214819784 * m3 + 1.5861632204 * s3;

	// Convert XYZ to linear-light sRGB
	x = values[0];
	y = values[1];
	z = values[2];
	values[0] = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
	values[1] = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
	values[2] = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;

	// Convert linear-light sRGB values in the range 0.0-1.0 to gamma corrected form
	// https://en.wikipedia.org/wiki/SRGB
	const minVal = -0.000000386996904; // -0.000005 / 12.92;
	const maxVal = 1.0000113744453183; // ((1.000005 + 0.055) / 1.055) ** 2.4
	const pow = 0.4166666666666667; // 1/2.4
	if (values.length < 4) {
		for (let i = 0; i < 3; ++i) {
			if (values[i] < minVal) {
				values[i] = 0;
			} else if (values[i] > maxVal) {
				values[i] = 1;
			} else {
				values[i] =
					values[i] > 0.0031308
						? 1.055 * values[i] ** pow - 0.055
						: values[i] * 12.92;
			}
		}
	} else {
		values[3] = 0;
		for (let i = 0; i < 3; ++i) {
			if (values[i] >= minVal && values[i] <= maxVal) {
				// not clipped
				values[i] =
					values[i] > 0.0031308
						? 1.055 * values[i] ** pow - 0.055
						: values[i] * 12.92;
				continue; // eslint-disable-line no-continue
			}
			values[i] = values[i] > maxVal ? 1 : 0; // clipped (clamped to boundary)
			values[3] = 1;
		}
	}
	return values;
}

// Moves an OKLCH color into the sRGB gamut by holding the l and h steady,
// and adjusting the c via binary-search until the color is on the sRGB boundary.
function oklch2sRGBForce(values) {
	const lch = [...values];
	oklch2sRGB(values);
	if (values.length < 4 || values[3] === 0) return values; // no clipped flag ys passed or color is not clipped

	let hiC = lch[1];
	let loC = 0;
	const ε = 0.0005;
	while ((hiC - loC > ε || values[3] === 1) && hiC > ε) {
		lch[1] = (hiC + loC) / 2;
		values[0] = lch[0];
		values[1] = lch[1];
		values[2] = lch[2];
		oklch2sRGB(values);
		if (values[3] === 0) loC = lch[1];
		else hiC = lch[1];
	}
	values[3] = 1; // clipped flag
	return values;
}

// Convert sRGB to OKLCH
function sRGB2oklch(values) {
	// convert an array of sRGB values in the range 0.0 - 1.0
	// to linear light (un-companded) form.
	// https://en.wikipedia.org/wiki/SRGB
	const pow = 2.4;
	for (let i = 0; i < 3; ++i) {
		values[i] =
			values[i] < 0.04045
				? values[i] / 12.92
				: ((values[i] + 0.055) / 1.055) ** pow;
	}

	// convert an array of linear-light sRGB values to CIE XYZ (D65)
	let x = values[0];
	let y = values[1];
	let z = values[2];
	values[0] = 0.4124564 * x + 0.3575761 * y + 0.1804375 * z;
	values[1] = 0.2126729 * x + 0.7151522 * y + 0.072175 * z;
	values[2] = 0.0193339 * x + 0.119192 * y + 0.9503041 * z;

	// Convert XYZ (D65) to OKLab
	x = values[0];
	y = values[1];
	z = values[2];
	const l = Math.cbrt(0.8189330101 * x + 0.3618667424 * y - 0.1288597137 * z);
	const m = Math.cbrt(0.0329845436 * x + 0.9293118715 * y + 0.0361456387 * z);
	const s = Math.cbrt(0.0482003018 * x + 0.2643662691 * y + 0.633851707 * z);

	values[0] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s; // L
	values[1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s; // a
	values[2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s; // b

	// Convert to polar form
	z = (Math.atan2(values[2], values[1]) * 180) / Math.PI; // Hue
	values[1] = Math.sqrt(values[1] * values[1] + values[2] * values[2]); // Chroma
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
