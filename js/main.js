/* global oklch2sRGB, oklch2sRGBForce, sRGB2oklch, sRGBfloat2int, hex2sRGB */

const state = {
	// debug: true,
	colorSpace: {
		dimension: {
			l: { name: "lightness", index: 0, min: 0, max: 1, step: 0.001 },
			c: { name: "chroma", index: 1, min: 0, max: 0.37, step: 0.0005 },
			h: { name: "hue", index: 2, min: 0, max: 360, step: 0.5 },
		},
	},
	axes: "hlc",
	from: "#ec80a1",
	to: "#08b1e6",
	steps: 5,
};

const docStyle = getComputedStyle(document.body);
const canvasSize = parseFloat(docStyle.getPropertyValue("--canvas-size"));
const handleSize = parseFloat(
	docStyle.getPropertyValue("--gradient-handle-size"),
);
const swatchSize = (handleSize * 0.65) | 0;
const gradientSize = canvasSize + handleSize;
const colorSpace = select("#color-space");
const colorSpaceCtx = colorSpace.getContext("2d");
const slider = select("#slider");
const handleNameLabel = select("#handle-name");
const lightnessValueLabel = select("#lightness-value");
const chromaValueLabel = select("#chroma-value");
const hueValueLabel = select("#hue-value");
const debugInfo = select("#debug-info");
const [minSteps, maxSteps] = [3, 12];

const isFirefox = navigator.userAgent.toLowerCase().includes("firefox");

const clippedPixel = new Uint8Array(new ArrayBuffer(4));
clippedPixel.set([255, 0, 0, 0]);
const coloredPixel = new Uint8Array(new ArrayBuffer(4));
coloredPixel.set([0, 0, 0, 255]);
const floatColorClipped = [0.0, 0.0, 0.0, 0];
let imgData;
let locationTimer = null;

function colorStringToHex(value) {
	const color = String(value || "").trim();
	if (!color || !CSS.supports("color", color)) return null;
	const probe = document.createElement("span");
	probe.style.color = color;
	probe.style.display = "none";
	document.body.appendChild(probe);
	const parsed = getComputedStyle(probe).color;
	probe.remove();
	const match = parsed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
	if (!match) return null;
	return `#${hex(+match[1])}${hex(+match[2])}${hex(+match[3])}`;

	function hex(num) {
		const clamped = num < 0 ? 0 : num > 255 ? 255 : num;
		const result = clamped.toString(16);
		return result.length === 1 ? `0${result}` : result;
	}
}

function applyColorToHandle(color) {
	const handleKey = is(Array, state[state.activeHandle])
		? state.activeHandle
		: "from";
	const hex = colorStringToHex(color);
	if (!hex) return false;

	const oklch = sRGB2oklch(hex2sRGB(hex));
	state[handleKey] = [oklch[state.dimX.index], oklch[state.dimY.index]];
	state.zval = oklch[state.dimZ.index];
	slider.value = state.zval.toFixed(Math.round(-Math.log10(state.dimZ.step)));
	positionHandles();
	updateColors();
	if (!state.busy) {
		window.requestAnimationFrame(renderColorSpace);
		state.busy = true;
	}
	return true;
}

function updateStatusLine() {
	const handleKey = is(Array, state[state.activeHandle])
		? state.activeHandle
		: "from";
	if (!is(Array, state[handleKey])) return;

	const oklch = [0, 0, 0];
	oklch[state.dimX.index] = state[handleKey][0];
	oklch[state.dimY.index] = state[handleKey][1];
	oklch[state.dimZ.index] = state.zval;

	handleNameLabel.innerText = `[${handleKey}]`;
	lightnessValueLabel.innerText = oklch[0].toFixed(3);
	chromaValueLabel.innerText = oklch[1].toFixed(4);
	hueValueLabel.innerText = oklch[2].toFixed(1);
}

function is(type, value) {
	return (
		![undefined, null].includes(value) &&
		(typeof type === "string" ? value.constructor.name : value.constructor) ===
			type
	);
}

function _capitalize(str) {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

function select(selector, first) {
	if (first === undefined) first = selector.startsWith("#"); // eslint-disable-line no-param-reassign
	return first
		? document.querySelectorAll(selector)[0]
		: [...document.querySelectorAll(selector)];
}

function isActive(element) {
	return element.classList.contains("active");
}

function activate(element) {
	element.classList.add("active");
}

function deactivate(element) {
	element.classList.remove("active");
}

function show(element) {
	element.classList.remove("hidden");
}

function hide(element) {
	element.classList.add("hidden");
}

function switchView(tab) {
	if (isActive(tab)) return;
	select("*[data-owner]").forEach(hide);
	select(".tab[data-view]").forEach(deactivate);
	activate(tab);
	select(`*[data-owner=${tab.dataset.view}]`).forEach(show);
	if (tab.dataset.view === "visualized") colorMap();
}

function switchAxes(tab) {
	if (isActive(tab)) return;
	select(".tab[data-axes]").forEach(deactivate);
	activate(tab);
	updateAxes(tab.dataset.axes);
}

function makeDraggable(element) {
	const elementPos = { x: 0, y: 0 };
	const cursorPos = { x: 0, y: 0 };
	const { key } = element.dataset;
	state[key] = state[key] || {};
	element.tabIndex = 0;
	element.addEventListener("mousedown", startDrag);
	element.addEventListener("focus", () => {
		state.activeHandle = key;
		updateStatusLine();
	});
	element.addEventListener("blur", () => {
		state.activeHandle = null;
		updateStatusLine();
	});
	element.addEventListener("keydown", doKeyMove);

	function startDrag(e) {
		state.activeHandle = key;
		element.focus();
		e.preventDefault();
		elementPos.x = element.offsetLeft;
		elementPos.y = element.offsetTop;
		cursorPos.x = e.clientX;
		cursorPos.y = e.clientY;
		document.addEventListener("mouseup", endDrad);
		document.addEventListener("mousemove", doDrag);
	}

	function limitPos(value) {
		return value < 0 ? 0 : value <= canvasSize ? value : canvasSize;
	}

	function doDrag(e) {
		e.preventDefault();
		elementPos.x += e.clientX - cursorPos.x;
		elementPos.y += e.clientY - cursorPos.y;
		cursorPos.x = e.clientX;
		cursorPos.y = e.clientY;

		const x = limitPos(elementPos.x);
		const y = limitPos(elementPos.y);
		state[key][0] = posUnscale(x, state.dimX);
		state[key][1] = posUnscale(y, state.dimY, true);
		element.style.left = `${x}px`;
		element.style.top = `${y}px`;
		updateColors();
	}

	function limitValue(value, { min, max }) {
		return value < min ? min : value > max ? max : value;
	}

	function roundToStep(value, dim, step) {
		const clamped = limitValue(value, dim);
		const snapped = dim.min + Math.round((clamped - dim.min) / step) * step;
		const precision = Math.ceil(-Math.log10(step));
		return limitValue(Number(snapped.toFixed(precision)), dim);
	}

	function doKeyMove(e) {
		if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.code))
			return;

		e.preventDefault();

		const stepFactor = e.shiftKey ? 10 : 1;
		const stepX = state.dimX.step * stepFactor;
		const stepY = state.dimY.step * stepFactor;
		let nextX = state[key][0];
		let nextY = state[key][1];

		if (e.code === "ArrowLeft") nextX -= stepX;
		if (e.code === "ArrowRight") nextX += stepX;
		if (e.code === "ArrowUp") nextY += stepY;
		if (e.code === "ArrowDown") nextY -= stepY;

		state[key][0] = roundToStep(nextX, state.dimX, stepX);
		state[key][1] = roundToStep(nextY, state.dimY, stepY);
		element.style.left = `${posScale(state[key][0], state.dimX)}px`;
		element.style.top = `${posScale(state[key][1], state.dimY, 0, true)}px`;
		updateColors();
	}

	function endDrad() {
		document.removeEventListener("mousemove", doDrag);
		document.removeEventListener("mouseup", endDrad);
	}
}

function renderColorSpace() {
	const zv = state.zval;

	if (state.scale) {
		doRender();
	} else {
		// adjust the scale until rendering time is less than 100 ms
		state.scale = 0;
		while (state.scale < 4) {
			state.scale++;
			colorSpace.width = colorSpace.height = canvasSize / state.scale; // eslint-disable-line no-multi-assign
			imgData = colorSpaceCtx.createImageData(
				colorSpace.width,
				colorSpace.height,
			);
			const start = performance.now();
			doRender();
			if (performance.now() - start < 100) break;
		}
	}
	if (zv !== state.zval) {
		window.requestAnimationFrame(renderColorSpace);
	} else {
		state.busy = false;
	}

	function doRender() {
		const { index: ix, min: xmin, max: xmax } = state.dimX;
		const { index: iy, min: ymin, max: ymax } = state.dimY;
		const { index: iz } = state.dimZ;

		let startTime = 0;
		if (state.debug) startTime = performance.now();
		const { width, height } = colorSpace;
		for (let x = 0; x < width; x++) {
			const xv = xmin + (x * (xmax - xmin)) / width;
			for (let y = 0; y < height; y++) {
				const yv = ymin + (y * (ymax - ymin)) / height;
				const idx = (x + (height - y - 1) * width) * 4;
				floatColorClipped[ix] = xv;
				floatColorClipped[iy] = yv;
				floatColorClipped[iz] = zv;
				let pixel = clippedPixel;
				oklch2sRGB(floatColorClipped);
				if (floatColorClipped[3] !== 1) {
					pixel = coloredPixel;
					sRGBfloat2int(floatColorClipped, pixel);
				}
				imgData.data.set(pixel, idx);
			}
		}
		if (state.debug) state.renderTime = performance.now() - startTime;
		colorSpaceCtx.putImageData(imgData, 0, 0);
		updateColors();
	}
}

function posScale(val, { min, max }, offset = 0, flip = false) {
	return (
		(flip
			? canvasSize - ((val - min) * canvasSize) / (max - min)
			: ((val - min) * canvasSize) / (max - min)) + offset
	);
}

function posUnscale(val, { min, max }, flip = false) {
	return ((flip ? canvasSize - val : val) * (max - min)) / canvasSize + min;
}

function getColor([x, y]) {
	floatColorClipped[state.dimX.index] = x;
	floatColorClipped[state.dimY.index] = y;
	floatColorClipped[state.dimZ.index] = state.zval;
	oklch2sRGBForce(floatColorClipped);
	sRGBfloat2int(floatColorClipped, coloredPixel);
	return {
		value: `#${hex(coloredPixel[0])}${hex(coloredPixel[1])}${hex(coloredPixel[2])}`,
		clipped: !!floatColorClipped[3],
	};

	function hex(num) {
		const result = num.toString(16);
		return result.length === 1 ? `0${result}` : result;
	}
}

function positionHandles() {
	const [handleFrom, handleTo] = select(".gradient .handle");
	handleFrom.style.left = `${posScale(state.from[0], state.dimX)}px`;
	handleFrom.style.top = `${posScale(state.from[1], state.dimY, 0, true)}px`;
	handleTo.style.left = `${posScale(state.to[0], state.dimX)}px`;
	handleTo.style.top = `${posScale(state.to[1], state.dimY, 0, true)}px`;
}

function updateColors() {
	if (!state.colors) state.colors = [];
	state.colors.length = state.steps;
	state.colors[0] = getColor(state.from);
	state.colors[state.steps - 1] = getColor(state.to);
	select(".gradient .handle").forEach((e) => {
		const color = state.colors[e.dataset.key === "from" ? 0 : state.steps - 1];
		e.style.backgroundColor = color.value;
		e.classList[color.clipped ? "add" : "remove"]("clipped");
	});
	const line = select(".gradient svg[data-key=line] line", 1);
	const offset = handleSize / 2;
	line.setAttributeNS(null, "x1", posScale(state.from[0], state.dimX, offset));
	line.setAttributeNS(
		null,
		"y1",
		posScale(state.from[1], state.dimY, offset, true),
	);
	line.setAttributeNS(null, "x2", posScale(state.to[0], state.dimX, offset));
	line.setAttributeNS(
		null,
		"y2",
		posScale(state.to[1], state.dimY, offset, true),
	);
	const spots = select(".gradient svg[data-key=swatches] circle");
	if (spots.length > state.steps - 2) {
		for (let i = state.steps - 2; i < spots.length; ++i) spots[i].remove();
		spots.length = state.steps - 2;
	}
	if (spots.length < state.steps - 2) {
		const swatchSvg = select(".gradient svg[data-key=swatches]", 1);
		for (let i = spots.length; i < state.steps - 2; ++i) {
			const swatch = document.createElementNS(swatchSvg.namespaceURI, "circle");
			swatch.setAttributeNS(null, "r", swatchSize / 2);
			swatchSvg.appendChild(swatch);
			spots.push(swatch);
		}
	}
	const swatches = select(".swatches div");
	const labels = select(".swatches label");
	if (swatches.length > state.steps) {
		for (let i = state.steps; i < swatches.length; ++i) {
			swatches[i].remove();
			labels[i].remove();
		}
		swatches.length = labels.length = state.steps; // eslint-disable-line no-multi-assign
	}
	if (swatches.length < state.steps) {
		const parent = select(".swatches", 1);
		for (let i = swatches.length; i < state.steps; ++i) {
			const swatch = document.createElement("div");
			parent.appendChild(swatch);
			swatches.push(swatch);
			const label = document.createElement("label");
			parent.appendChild(label);
			labels.push(label);
		}
	}
	for (let i = 0; i < state.steps; ++i) {
		if (i >= 1 && i < state.steps - 1) {
			const x =
				state.from[0] + ((state.to[0] - state.from[0]) * i) / (state.steps - 1);
			const y =
				state.from[1] + ((state.to[1] - state.from[1]) * i) / (state.steps - 1);
			state.colors[i] = getColor([x, y]);
			spots[i - 1].setAttributeNS(null, "cx", posScale(x, state.dimX, offset));
			spots[i - 1].setAttributeNS(
				null,
				"cy",
				posScale(y, state.dimY, offset, true),
			);
			spots[i - 1].style.fill = state.colors[i].value;
			spots[i - 1].classList[state.colors[i].clipped ? "add" : "remove"](
				"clipped",
			);
		}
		swatches[i].style.backgroundColor = state.colors[i].value;
		labels[i].innerText = state.colors[i].value;
		labels[i].classList[state.colors[i].clipped ? "add" : "remove"]("clipped");
	}
	if (locationTimer) clearTimeout(locationTimer);
	locationTimer = setTimeout(() => {
		locationTimer = null;
		updateLocation();
	}, 300);
	updateStatusLine();
}

function updateAxes(axes) {
	if (state.axes === axes && is(Array, state.from) && is(Array, state.to))
		return;
	const prevZ = state.zval;
	state.dimX = state.colorSpace.dimension[axes[0]];
	state.dimY = state.colorSpace.dimension[axes[1]];
	state.dimZ = state.colorSpace.dimension[axes[2]];
	const [ix, iy, iz] = [...axes].map((a) => state.axes.indexOf(a));
	if (is(String, state.from)) {
		const lch = sRGB2oklch(hex2sRGB(state.from));
		state.from = [lch[state.dimX.index], lch[state.dimY.index]];
		state.zval = lch[state.dimZ.index];
	} else {
		const prevFrom = [...state.from, prevZ];
		state.from = [prevFrom[ix], prevFrom[iy]];
		state.zval = prevFrom[iz];
	}
	if (is(String, state.to)) {
		const lch = sRGB2oklch(hex2sRGB(state.to));
		state.to = [lch[state.dimX.index], lch[state.dimY.index]];
	} else {
		const prevTo = [...state.to, prevZ];
		state.to = [prevTo[ix], prevTo[iy]];
	}
	state.axes = axes;

	slider.min = state.dimZ.min;
	slider.max = state.dimZ.max;
	slider.step = state.dimZ.step / 1000;
	slider.value = state.zval.toFixed(Math.round(-Math.log10(slider.step)));
	slider.dispatchEvent(new InputEvent("input"));
	slider.step = state.dimZ.step;
	positionHandles();
	updateColors();
}

function updateStateFromLocation() {
	const { hash } = window.location;
	if (!hash) return;
	const [axes, steps, from, to] = hash.slice(1).split("/");
	if (select(".tab[data-axes]").some((e) => e.dataset.axes === axes))
		state.axes = axes;
	const numSteps = parseInt(steps, 10);
	if (numSteps >= minSteps && numSteps <= maxSteps) state.steps = numSteps;
	const colorRe = /^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
	if (colorRe.test(from)) state.from = from;
	if (colorRe.test(to)) state.to = to;
}

function updateLocation() {
	window.location.hash = `#${state.axes}/${state.steps}/${state.colors[0].value.slice(1)}/${state.colors[state.colors.length - 1].value.slice(1)}`;
}

function colorMap() {
	select(".widget .map path").forEach((p, i) => {
		p.style.fill = state.colors[i % state.colors.length].value;
	});
}

function init() {
	updateStateFromLocation();
	select(".gradient svg").forEach((e) => {
		e.setAttributeNS(null, "width", gradientSize);
		e.setAttributeNS(null, "height", gradientSize);
	});
	const tab = select(`.tab[data-axes=${state.axes}]`, 1);
	if (!isActive(tab)) switchAxes(tab);
	else updateAxes(state.axes);
}

window.addEventListener("load", init);

document.addEventListener("keydown", (e) => {
	if (+slider.step !== state.dimZ.step) return;
	if (!["AltLeft", "AltRight", "ShiftLeft", "ShiftRight"].includes(e.code))
		return;
	slider.step = e.code.startsWith("Alt")
		? state.dimZ.step / 10
		: state.dimZ.step * 10;
});

document.addEventListener("keyup", (e) => {
	if (+slider.step === state.dimZ.step) return;
	if (!["AltLeft", "AltRight", "ShiftLeft", "ShiftRight"].includes(e.code))
		return;
	slider.step = state.dimZ.step;
});

slider.addEventListener("click", () => {
	// Safari workaround
	if (document.activeElement === slider) return;
	slider.focus();
});

slider.addEventListener("keydown", (e) => {
	// Firefox workaround
	if (
		!(
			isFirefox &&
			e.altKey &&
			["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp"].includes(e.code)
		)
	)
		return;
	if (["ArrowLeft", "ArrowDown"].includes(e.code)) slider.stepDown();
	else slider.stepUp();
	slider.dispatchEvent(new InputEvent("input"));
});

slider.addEventListener("input", () => {
	state.zval = parseFloat(slider.value);
	updateStatusLine();
	if (state.debug && state.renderTime)
		debugInfo.innerText = `rendered in ${state.renderTime.toFixed(1)} ms`;
	if (!state.busy) {
		window.requestAnimationFrame(renderColorSpace);
		state.busy = true;
	}
});

select(".tab[data-view]").forEach((el) => {
	el.addEventListener("click", () => switchView(el));
});

select(".tab[data-axes]").forEach((el) => {
	el.addEventListener("click", () => switchAxes(el));
});

select(".gradient .handle").forEach(makeDraggable);

document.addEventListener("paste", (e) => {
	const target = e.target;
	if (
		target instanceof HTMLInputElement ||
		target instanceof HTMLTextAreaElement ||
		target?.isContentEditable
	)
		return;
	const pasted = e.clipboardData?.getData("text");
	if (!pasted) return;
	if (applyColorToHandle(pasted)) e.preventDefault();
});

select(".button.copy", 1).addEventListener("click", () => {
	const focused = document.activeElement;
	const clipboard = select("#clipboard");
	show(clipboard);
	clipboard.value = state.colors.map((c) => c.value).join(", ");
	clipboard.select();
	document.execCommand("copy");
	if (focused?.focus) focused.focus();
	hide(clipboard);
});

select(".button.minus", 1).addEventListener("click", () => {
	state.steps--;
	if (state.steps < minSteps) state.steps = minSteps;
	updateColors();
});

select(".button.plus", 1).addEventListener("click", () => {
	state.steps++;
	if (state.steps > maxSteps) state.steps = maxSteps;
	updateColors();
});

select(".button.reset", 1).addEventListener("click", () => {
	[window.location.href] = window.location.href.split("#");
});
