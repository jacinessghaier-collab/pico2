import { i as __toESM } from "../_runtime.mjs";
import { t as LOCK } from "./lock-DSiqy2QN.mjs";
import { n as stageAt } from "./stages-C8e_oXZy.mjs";
import { C as require_jsx_runtime, S as Vector3, _ as ShaderMaterial, a as BufferAttribute, b as SpriteMaterial, c as CapsuleGeometry, d as Group, f as LatheGeometry, g as SRGBColorSpace, h as PointsMaterial, l as Color, m as Points, n as useFrame, o as BufferGeometry, p as Mesh, r as useThree, s as CanvasTexture, t as Canvas, u as Float32BufferAttribute, v as SphereGeometry, w as require_react, x as Vector2, y as Sprite } from "../_libs/@react-three/fiber+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/KushimScene-Ds07A30z.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var glassVert = `
varying vec3 vN;
varying vec3 vW;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vW = world.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;
var glassFrag = `
uniform vec3 uColor;
uniform vec3 uCore;
uniform float uBoost;
varying vec3 vN;
varying vec3 vW;
void main() {
  vec3 viewDir = normalize(cameraPosition - vW);
  float fres = pow(1.0 - abs(dot(normalize(vN), viewDir)), 2.35);
  float spine = exp(-abs(vW.x) * 14.0) * smoothstep(0.35, 1.15, vW.y) * smoothstep(1.75, 1.35, vW.y);
  vec3 chest = vW - vec3(0.0, 1.34, 0.06);
  float star = exp(-dot(chest, chest) * 18.0);
  float alpha = fres * 0.95 * uBoost + 0.07 * uBoost + spine * 0.55 + star * 0.7;
  if (alpha < 0.015) discard;
  gl_FragColor = vec4(mix(uColor, uCore, fres), alpha);
}
`;
var nerveVert = `
attribute vec3 aDir;
attribute float aSide;
attribute float aAlong;
attribute float aRank;
attribute float aWidth;
uniform float uDensity;
varying float vAlong;
varying float vRank;
varying float vVisible;
void main() {
  vAlong = aAlong;
  vRank = aRank;
  vVisible = aRank <= uDensity ? 1.0 : 0.0;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 viewDir = normalize((modelViewMatrix * vec4(aDir, 0.0)).xyz);
  vec2 side = normalize(vec2(-viewDir.y, viewDir.x));
  if (length(viewDir.xy) < 0.001) side = vec2(1.0, 0.0);
  mv.xy += side * aSide * aWidth * 18.0;
  gl_Position = projectionMatrix * mv;
}
`;
var nerveFrag = `
uniform vec3 uColor;
uniform vec3 uCore;
uniform float uTime;
uniform float uSpeed;
varying float vAlong;
varying float vRank;
varying float vVisible;
void main() {
  if (vVisible < 0.5) discard;
  float wave = fract(vAlong * 2.4 - uTime * uSpeed);
  float head = smoothstep(0.0, 0.02, wave) * smoothstep(0.2, 0.03, wave);
  float alpha = 0.55 + head * 1.0;
  gl_FragColor = vec4(mix(uColor, uCore, head), alpha);
}
`;
function emptyRibbon() {
	return {
		positions: [],
		dirs: [],
		sides: [],
		alongs: [],
		ranks: [],
		widths: []
	};
}
function addRibbon(target, pts, rank, width) {
	let total = 0;
	const acc = [0];
	for (let i = 1; i < pts.length; i++) {
		total += pts[i].distanceTo(pts[i - 1]);
		acc.push(total);
	}
	if (total < 1e-4) return;
	for (let i = 0; i < pts.length - 1; i++) {
		const a = pts[i];
		const b = pts[i + 1];
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const dz = b.z - a.z;
		const t0 = acc[i] / total;
		const t1 = acc[i + 1] / total;
		const corners = [
			[
				a,
				-1,
				t0
			],
			[
				a,
				1,
				t0
			],
			[
				b,
				-1,
				t1
			],
			[
				a,
				1,
				t0
			],
			[
				b,
				1,
				t1
			],
			[
				b,
				-1,
				t1
			]
		];
		for (const [p, side, t] of corners) {
			target.positions.push(p.x, p.y, p.z);
			target.dirs.push(dx, dy, dz);
			target.sides.push(side);
			target.alongs.push(t);
			target.ranks.push(rank);
			target.widths.push(width);
		}
	}
}
function commitRibbon(parent, ribbon, material) {
	if (ribbon.positions.length === 0) return;
	const geo = new BufferGeometry();
	geo.setAttribute("position", new Float32BufferAttribute(ribbon.positions, 3));
	geo.setAttribute("aDir", new Float32BufferAttribute(ribbon.dirs, 3));
	geo.setAttribute("aSide", new Float32BufferAttribute(ribbon.sides, 1));
	geo.setAttribute("aAlong", new Float32BufferAttribute(ribbon.alongs, 1));
	geo.setAttribute("aRank", new Float32BufferAttribute(ribbon.ranks, 1));
	geo.setAttribute("aWidth", new Float32BufferAttribute(ribbon.widths, 1));
	const mesh = new Mesh(geo, material);
	mesh.frustumCulled = false;
	mesh.renderOrder = 2;
	parent.add(mesh);
}
function glassMaterial(boost) {
	return new ShaderMaterial({
		transparent: true,
		depthWrite: false,
		blending: 2,
		side: 2,
		uniforms: {
			uColor: { value: new Color(LOCK.strom) },
			uCore: { value: new Color(LOCK.kern) },
			uBoost: { value: boost }
		},
		vertexShader: glassVert,
		fragmentShader: glassFrag
	});
}
function nerveMaterial(color, speed) {
	return new ShaderMaterial({
		transparent: true,
		depthWrite: false,
		blending: 2,
		side: 2,
		uniforms: {
			uColor: { value: new Color(color) },
			uCore: { value: new Color(color === LOCK.signal ? "#ffd0d4" : LOCK.kern) },
			uTime: { value: 0 },
			uSpeed: { value: speed },
			uDensity: { value: 1 }
		},
		vertexShader: nerveVert,
		fragmentShader: nerveFrag
	});
}
function solid(parent, geo, material) {
	geo.computeVertexNormals();
	const mesh = new Mesh(geo, material);
	mesh.renderOrder = 1;
	parent.add(mesh);
	return mesh;
}
function capsule(radius, length) {
	const cyl = Math.max(.012, length - radius * 2);
	return new CapsuleGeometry(radius, cyl, 4, 8);
}
function glowSprite(inner, outer, spikes) {
	const canvas = document.createElement("canvas");
	canvas.width = 128;
	canvas.height = 128;
	const ctx = canvas.getContext("2d");
	if (!ctx) return new CanvasTexture(canvas);
	const grd = ctx.createRadialGradient(64, 64, 0, 64, 64, 62);
	grd.addColorStop(0, inner);
	grd.addColorStop(.25, outer);
	grd.addColorStop(1, "rgba(0,0,0,0)");
	ctx.fillStyle = grd;
	ctx.fillRect(0, 0, 128, 128);
	ctx.strokeStyle = inner;
	ctx.globalAlpha = .85;
	ctx.lineWidth = 1.5;
	for (let i = 0; i < spikes; i++) {
		const angle = i / spikes * Math.PI * 2;
		ctx.beginPath();
		ctx.moveTo(64, 64);
		ctx.lineTo(64 + Math.cos(angle) * 60, 64 + Math.sin(angle) * 60);
		ctx.stroke();
	}
	const tex = new CanvasTexture(canvas);
	tex.colorSpace = SRGBColorSpace;
	return tex;
}
function alongBone(ribbon, length, offsets) {
	for (const off of offsets) {
		const pts = [];
		for (let i = 0; i <= 7; i++) {
			const u = i / 7;
			const wobble = Math.sin(u * 10 + off.seed) * .005;
			pts.push(new Vector3(off.x + wobble, -u * length, off.z + wobble * .6));
		}
		addRibbon(ribbon, pts, off.rank, off.width);
	}
}
function addFingers(wrist, side, material) {
	const fingers = [];
	const specs = [
		{
			x: -.03 * side,
			z: .02,
			len: .052,
			rot: .5 * side
		},
		{
			x: -.012 * side,
			z: .016,
			len: .074,
			rot: .08 * side
		},
		{
			x: .004 * side,
			z: .018,
			len: .082,
			rot: 0
		},
		{
			x: .018 * side,
			z: .014,
			len: .076,
			rot: -.08 * side
		},
		{
			x: .03 * side,
			z: .008,
			len: .062,
			rot: -.16 * side
		}
	];
	for (const spec of specs) {
		const finger = new Group();
		finger.position.set(spec.x, -.02, spec.z);
		finger.rotation.z = spec.rot;
		const seg = solid(finger, capsule(.008, spec.len), material);
		seg.position.y = -spec.len * .45;
		wrist.add(finger);
		fingers.push(finger);
	}
	return fingers;
}
function createKushim() {
	const P = LOCK.proportions;
	const root = new Group();
	const glass = glassMaterial(1);
	const bright = glassMaterial(1.8);
	const nerve = nerveMaterial(LOCK.strom, .34);
	const signal = nerveMaterial(LOCK.signal, .2);
	const disposables = [
		glass,
		bright,
		nerve,
		signal
	];
	const chest = new Group();
	chest.position.y = P.chestY;
	root.add(chest);
	const torsoPts = [
		new Vector2(.055, -.3),
		new Vector2(.12, -.24),
		new Vector2(.15, -.12),
		new Vector2(.125, 0),
		new Vector2(.15, .12),
		new Vector2(.175, .22),
		new Vector2(.15, .3),
		new Vector2(.075, .38),
		new Vector2(.048, .46)
	];
	solid(chest, new LatheGeometry(torsoPts, 28), glass).scale.set(1.05, 1, .72);
	const head = new Group();
	head.position.y = P.headLocalY;
	chest.add(head);
	solid(head, new SphereGeometry(P.headRadius, 24, 16), glass).scale.set(1, 1.16, 1.02);
	const jaw = solid(head, new SphereGeometry(P.headRadius * .72, 16, 12), glass);
	jaw.position.set(0, -.055, .02);
	jaw.scale.set(.92, .62, .85);
	const nose = solid(head, capsule(.012, .05), bright);
	nose.position.set(0, -.005, P.headRadius * .92);
	nose.rotation.x = .4;
	const lips = solid(head, capsule(.008, .045), glass);
	lips.position.set(0, -.045, P.headRadius * .86);
	lips.rotation.z = Math.PI / 2;
	for (const side of [-1, 1]) {
		const ear = solid(head, new SphereGeometry(.028, 10, 8), glass);
		ear.position.set(side * .1, -.01, 0);
		ear.scale.set(.45, 1, .7);
		const brow = solid(head, capsule(.006, .04), bright);
		brow.position.set(side * .032, .03, P.headRadius * .86);
		brow.rotation.z = side * .4;
		brow.rotation.y = side * -.3;
	}
	const starTex = glowSprite("#ffffff", LOCK.strom, 10);
	const star = new Sprite(new SpriteMaterial({
		map: starTex,
		blending: 2,
		depthWrite: false,
		transparent: true
	}));
	star.position.set(0, .14, .1);
	star.scale.set(.36, .36, 1);
	star.renderOrder = 3;
	chest.add(star);
	disposables.push(starTex, star.material);
	const eyeTex = glowSprite("#ffffff", LOCK.kern, 0);
	const eyeMat = new SpriteMaterial({
		map: eyeTex,
		blending: 2,
		depthWrite: false,
		transparent: true
	});
	disposables.push(eyeTex, eyeMat);
	for (const side of [-1, 1]) {
		const eye = new Sprite(eyeMat);
		eye.position.set(side * .032, .012, P.headRadius * .92);
		eye.scale.set(.028, .028, 1);
		eye.renderOrder = 4;
		head.add(eye);
	}
	const browTex = glowSprite("#ffffff", LOCK.kern, 4);
	const forehead = new Sprite(new SpriteMaterial({
		map: browTex,
		blending: 2,
		depthWrite: false,
		transparent: true
	}));
	forehead.position.set(0, .055, P.headRadius * .9);
	forehead.scale.set(.05, .05, 1);
	forehead.renderOrder = 4;
	head.add(forehead);
	disposables.push(browTex, forehead.material);
	const torsoNerves = emptyRibbon();
	const spine = [];
	for (let i = 0; i <= 12; i++) {
		const u = i / 12;
		spine.push(new Vector3(0, -.26 + u * .78, -.02 + Math.sin(u * Math.PI) * .015));
	}
	addRibbon(torsoNerves, spine, .05, .01);
	for (const side of [-1, 1]) {
		const chain = [];
		for (let i = 0; i <= 10; i++) {
			const u = i / 10;
			chain.push(new Vector3(side * .028, -.24 + u * .7, -.03));
		}
		addRibbon(torsoNerves, chain, .2, .0035);
		for (let rib = 0; rib < 8; rib++) {
			const t = rib / 7;
			const y = -.02 + t * .28;
			const reach = .09 + Math.sin(t * Math.PI) * .075;
			const pts = [];
			for (let s = 0; s <= 8; s++) {
				const u = s / 8;
				pts.push(new Vector3(side * reach * Math.sin(u * Math.PI * .9), y - u * .035, -.03 + u * .12));
			}
			addRibbon(torsoNerves, pts, .15 + rib * .02, .0032);
		}
		const clavicle = [];
		for (let s = 0; s <= 6; s++) {
			const u = s / 6;
			clavicle.push(new Vector3(side * (.02 + u * .18), .3 - u * .02, .07 - u * .04));
		}
		addRibbon(torsoNerves, clavicle, .1, .004);
		addRibbon(torsoNerves, [
			new Vector3(side * .06, .22, -.08),
			new Vector3(side * .16, .26, -.07),
			new Vector3(side * .12, .1, -.07),
			new Vector3(side * .06, .22, -.08)
		], .55, .0028);
	}
	const sternum = [];
	for (let i = 0; i <= 6; i++) sternum.push(new Vector3(0, .02 + i * .045, .09));
	addRibbon(torsoNerves, sternum, .08, .0045);
	commitRibbon(chest, torsoNerves, nerve);
	function makeArm(side) {
		const shoulder = new Group();
		shoulder.position.set(side * P.shoulderX, P.shoulderLocalY, 0);
		chest.add(shoulder);
		solid(shoulder, new SphereGeometry(.048, 14, 10), bright).scale.set(1.05, 1, .9);
		const upperMesh = solid(shoulder, capsule(.046, P.upperArm), glass);
		upperMesh.position.y = -P.upperArm / 2;
		const upperN = emptyRibbon();
		alongBone(upperN, P.upperArm, [
			{
				x: .01 * side,
				z: .012,
				rank: .12,
				width: .0036,
				seed: side
			},
			{
				x: -.012 * side,
				z: -.006,
				rank: .4,
				width: .0026,
				seed: side * 2
			},
			{
				x: 0,
				z: .02,
				rank: .7,
				width: .0022,
				seed: side * 3
			}
		]);
		commitRibbon(shoulder, upperN, nerve);
		const elbow = new Group();
		elbow.position.y = -P.upperArm;
		shoulder.add(elbow);
		solid(elbow, new SphereGeometry(.032, 12, 8), bright);
		const foreMesh = solid(elbow, capsule(.036, P.foreArm), glass);
		foreMesh.position.y = -P.foreArm / 2;
		const foreN = emptyRibbon();
		alongBone(foreN, P.foreArm, [{
			x: .008 * side,
			z: .01,
			rank: .18,
			width: .003,
			seed: 4
		}, {
			x: -.008 * side,
			z: -.004,
			rank: .5,
			width: .0024,
			seed: 5
		}]);
		commitRibbon(elbow, foreN, nerve);
		const wrist = new Group();
		wrist.position.y = -P.foreArm;
		elbow.add(wrist);
		solid(wrist, new SphereGeometry(.022, 10, 8), bright);
		const palm = solid(wrist, new SphereGeometry(.034, 12, 8), glass);
		palm.position.set(0, -.03, .01);
		palm.scale.set(.85, 1.15, .42);
		const fingers = addFingers(wrist, side, glass);
		const handN = emptyRibbon();
		for (let f = 0; f < 5; f++) {
			const x = (-.028 + f * .014) * side;
			addRibbon(handN, [new Vector3(0, 0, .01), new Vector3(x, -.085 - (f === 2 ? .01 : 0), .02)], .25 + f * .08, .0022);
		}
		commitRibbon(wrist, handN, nerve);
		return {
			shoulder,
			elbow,
			wrist,
			fingers
		};
	}
	const left = makeArm(1);
	const right = makeArm(-1);
	const signalNerves = emptyRibbon();
	for (let i = 0; i < 5; i++) {
		const angle = i / 5 * Math.PI * 2;
		const pts = [];
		for (let s = 0; s <= 5; s++) {
			const u = s / 5;
			pts.push(new Vector3(Math.cos(angle) * .02 * u, -.04 - u * .08, Math.sin(angle) * .02 * u + .02));
		}
		addRibbon(signalNerves, pts, .02, .003);
	}
	commitRibbon(right.shoulder, signalNerves, signal);
	const coreMat = new ShaderMaterial({
		transparent: true,
		depthWrite: false,
		blending: 2,
		uniforms: {
			uColor: { value: new Color(LOCK.signal) },
			uCore: { value: new Color("#ffd5d8") },
			uBoost: { value: 2.4 }
		},
		vertexShader: glassVert,
		fragmentShader: glassFrag
	});
	disposables.push(coreMat);
	const core = solid(right.shoulder, new SphereGeometry(.045, 16, 12), coreMat);
	core.position.set(-.01, -.05, .03);
	core.renderOrder = 4;
	const ringCount = 96;
	const ringAngles = new Float32Array(ringCount);
	const ringJitter = new Float32Array(ringCount);
	const ringPos = /* @__PURE__ */ new Float32Array(288);
	for (let i = 0; i < ringCount; i++) {
		ringAngles[i] = i / ringCount * Math.PI * 2;
		ringJitter[i] = .75 + i * 37 % 10 / 25;
	}
	const ringGeo = new BufferGeometry();
	ringGeo.setAttribute("position", new BufferAttribute(ringPos, 3));
	const ringMat = new PointsMaterial({
		color: LOCK.signal,
		size: .028,
		transparent: true,
		depthWrite: false,
		blending: 2,
		opacity: .8,
		sizeAttenuation: true
	});
	const ring = new Points(ringGeo, ringMat);
	ring.position.set(0, -.04, .02);
	ring.frustumCulled = false;
	ring.renderOrder = 5;
	right.shoulder.add(ring);
	disposables.push(ringGeo, ringMat);
	function makeLeg(side) {
		const hip = new Group();
		hip.position.set(side * .11, P.hipY, 0);
		root.add(hip);
		solid(hip, new SphereGeometry(.055, 14, 10), bright);
		const thighMesh = solid(hip, capsule(.068, P.thigh), glass);
		thighMesh.position.y = -P.thigh / 2;
		const hipN = emptyRibbon();
		alongBone(hipN, P.thigh, [{
			x: .01 * side,
			z: .015,
			rank: .1,
			width: .0034,
			seed: side * 6
		}, {
			x: -.016 * side,
			z: -.01,
			rank: .45,
			width: .0024,
			seed: 7
		}]);
		const crest = [];
		for (let s = 0; s <= 6; s++) {
			const u = s / 6;
			crest.push(new Vector3(side * (.02 + u * .1), .02 + Math.sin(u * Math.PI) * .02, -.02 + u * .04));
		}
		addRibbon(hipN, crest, .3, .003);
		commitRibbon(hip, hipN, nerve);
		const knee = new Group();
		knee.position.y = -P.thigh;
		hip.add(knee);
		const cap = solid(knee, new SphereGeometry(.04, 12, 8), bright);
		cap.position.z = .02;
		const shinMesh = solid(knee, capsule(.046, P.shin), glass);
		shinMesh.position.y = -P.shin / 2;
		const shinN = emptyRibbon();
		alongBone(shinN, P.shin, [{
			x: .008 * side,
			z: .01,
			rank: .16,
			width: .0028,
			seed: 8
		}, {
			x: -.006 * side,
			z: -.008,
			rank: .6,
			width: .0022,
			seed: 9
		}]);
		commitRibbon(knee, shinN, nerve);
		const ankle = new Group();
		ankle.position.y = -P.shin;
		knee.add(ankle);
		solid(ankle, new SphereGeometry(.026, 10, 8), bright);
		const foot = new Group();
		ankle.add(foot);
		const footMesh = solid(foot, capsule(.028, .16), glass);
		footMesh.rotation.x = Math.PI / 2;
		footMesh.position.set(0, -.028, .05);
		for (let t = 0; t < 5; t++) {
			const toe = solid(foot, capsule(.008, .028), glass);
			toe.rotation.x = Math.PI / 2;
			toe.position.set((t - 2) * .014 * side, -.02, .145);
		}
		const footN = emptyRibbon();
		for (let t = 0; t < 5; t++) addRibbon(footN, [new Vector3(0, -.01, .02), new Vector3((t - 2) * .014 * side, -.02, .16)], .35 + t * .08, .002);
		commitRibbon(foot, footN, nerve);
	}
	makeLeg(1);
	makeLeg(-1);
	const pelvis = emptyRibbon();
	const ringPts = [];
	for (let i = 0; i <= 16; i++) {
		const a = i / 16 * Math.PI * 2;
		ringPts.push(new Vector3(Math.cos(a) * .13, P.hipY + .02, Math.sin(a) * .08));
	}
	addRibbon(pelvis, ringPts, .12, .0036);
	commitRibbon(root, pelvis, nerve);
	root.traverse((obj) => {
		const mesh = obj;
		if (mesh.geometry) disposables.push(mesh.geometry);
	});
	return {
		root,
		chest,
		head,
		shoulderL: left.shoulder,
		elbowL: left.elbow,
		wristL: left.wrist,
		shoulderR: right.shoulder,
		elbowR: right.elbow,
		wristR: right.wrist,
		fingersL: left.fingers,
		fingersR: right.fingers,
		glass,
		nerve,
		signal,
		ring,
		ringAngles,
		ringJitter,
		core,
		dispose: () => {
			const seen = /* @__PURE__ */ new Set();
			for (const item of disposables) {
				if (seen.has(item)) continue;
				seen.add(item);
				item.dispose();
			}
		}
	};
}
function poseTargets(gesture) {
	const idle = {
		shoulderL: {
			x: .02,
			y: .02,
			z: .1
		},
		elbowL: {
			x: -.16,
			y: .02,
			z: 0
		},
		wristL: {
			x: -.25,
			y: 0,
			z: .5
		},
		shoulderR: {
			x: .02,
			y: -.02,
			z: -.1
		},
		elbowR: {
			x: -.16,
			y: -.02,
			z: 0
		},
		wristR: {
			x: -.25,
			y: 0,
			z: -.5
		},
		head: {
			x: 0,
			y: 0,
			z: 0
		}
	};
	if (gesture === "explain") {
		idle.shoulderL = {
			x: -1.05,
			y: .25,
			z: .28
		};
		idle.elbowL = {
			x: -1.25,
			y: .1,
			z: 0
		};
		idle.wristL = {
			x: .35,
			y: .2,
			z: .2
		};
		idle.head = {
			x: .04,
			y: .08,
			z: 0
		};
	} else if (gesture === "think") {
		idle.head = {
			x: .14,
			y: -.06,
			z: .04
		};
		idle.shoulderL = {
			x: -.2,
			y: .1,
			z: .22
		};
		idle.elbowL = {
			x: -.85,
			y: .1,
			z: 0
		};
	} else if (gesture === "empathize") {
		idle.shoulderL.z = .28;
		idle.shoulderR.z = -.28;
		idle.head = {
			x: .08,
			y: 0,
			z: .05
		};
	} else if (gesture === "listen") idle.head = {
		x: .06,
		y: .02,
		z: .07
	};
	else if (gesture === "acknowledge") idle.head = {
		x: .05,
		y: 0,
		z: 0
	};
	return idle;
}
function damp(current, target, dt, speed) {
	const k = 1 - Math.exp(-dt * speed);
	return current + (target - current) * k;
}
function dampAxis(obj, target, dt, speed) {
	obj.rotation.x = damp(obj.rotation.x, target.x, dt, speed);
	obj.rotation.y = damp(obj.rotation.y, target.y, dt, speed);
	obj.rotation.z = damp(obj.rotation.z, target.z, dt, speed);
}
function tickKushim(rig, pose, dt, elapsed) {
	const stage = stageAt(pose.hour);
	const targets = poseTargets(pose.gesture);
	const speed = pose.gesture === "empathize" ? 2.4 : 4.2;
	dampAxis(rig.shoulderL, targets.shoulderL, dt, speed);
	dampAxis(rig.elbowL, targets.elbowL, dt, speed);
	dampAxis(rig.wristL, targets.wristL, dt, speed);
	dampAxis(rig.shoulderR, targets.shoulderR, dt, speed);
	dampAxis(rig.elbowR, targets.elbowR, dt, speed);
	dampAxis(rig.wristR, targets.wristR, dt, speed);
	let nod = 0;
	if (!pose.reducedMotion && (pose.gesture === "acknowledge" || pose.gesture === "speak" && pose.speaking)) nod = Math.sin(elapsed * 3.2) * .04;
	if (!pose.reducedMotion && pose.typing && stage.backchannel) {
		if (Math.sin(elapsed * 1.7) > .92) nod += .05;
	}
	const yaw = stage.yawToVoice ? pose.attention * .16 : 0;
	dampAxis(rig.head, {
		x: targets.head.x + nod,
		y: targets.head.y + yaw,
		z: targets.head.z
	}, dt, 5);
	const calm = pose.gesture === "empathize";
	const hz = pose.speaking ? 1.35 : calm ? .55 : .85;
	const breath = pose.reducedMotion ? 0 : Math.sin(elapsed * hz * Math.PI * 2);
	const lift = breath * .012;
	rig.chest.scale.set(1 + breath * .008, 1 + lift, 1 + breath * .01);
	rig.chest.position.y = LOCK.proportions.chestY + breath * .008;
	const curlBase = pose.gesture === "think" ? .45 : pose.gesture === "explain" ? .05 : .18;
	const life = !pose.reducedMotion && stage.fingerLife ? .05 : 0;
	rig.fingersL.forEach((finger, index) => {
		const wave = Math.sin(elapsed * .8 + index) * life;
		finger.rotation.x = damp(finger.rotation.x, -(curlBase + wave), dt, 4);
	});
	rig.fingersR.forEach((finger, index) => {
		const wave = Math.sin(elapsed * .8 + index + 1) * life;
		finger.rotation.x = damp(finger.rotation.x, -(curlBase + wave), dt, 4);
	});
	rig.nerve.uniforms.uTime.value = elapsed;
	rig.signal.uniforms.uTime.value = elapsed;
	rig.nerve.uniforms.uDensity.value = stage.filament;
	rig.signal.uniforms.uDensity.value = 1;
	const positions = rig.ring.geometry.getAttribute("position");
	const array = positions.array;
	let radius = .055;
	let opacity = .2;
	if (!pose.reducedMotion) {
		const cycle = elapsed % 6.2 / 6.2;
		if (cycle < .45) {
			const u = cycle / .45;
			radius = .05 + u * .2;
			opacity = .95 * (1 - u);
		}
	}
	if (pose.shoulderTopic && stage.shoulderListen) opacity = Math.min(1, opacity + .35);
	for (let i = 0; i < rig.ringAngles.length; i++) {
		const angle = rig.ringAngles[i];
		const jitter = rig.ringJitter[i];
		array[i * 3] = Math.cos(angle) * radius * jitter;
		array[i * 3 + 1] = Math.sin(angle) * radius * jitter * .92;
		array[i * 3 + 2] = (jitter - .9) * .04;
	}
	positions.needsUpdate = true;
	const mat = rig.ring.material;
	mat.opacity = opacity;
	const pulse = pose.reducedMotion ? 1 : 1 + Math.sin(elapsed * 3.4) * .08;
	rig.core.scale.setScalar(pulse * (pose.shoulderTopic && stage.shoulderListen ? 1.15 : 1));
}
function Framing() {
	const { camera, size } = useThree();
	(0, import_react.useEffect)(() => {
		const cam = camera;
		const fov = 26;
		cam.fov = fov;
		const aspect = size.width / Math.max(1, size.height);
		const vertical = fov * Math.PI / 180;
		const distV = 1.12 / Math.tan(vertical / 2) * 1.08;
		const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect);
		const distH = .72 / Math.tan(horizontal / 2) * 1.18;
		const center = .92;
		cam.position.set(0, 1, Math.max(distV, distH));
		cam.lookAt(0, center, 0);
		cam.updateProjectionMatrix();
	}, [camera, size]);
	return null;
}
function Avatar({ poseRef }) {
	const rig = (0, import_react.useMemo)(() => createKushim(), []);
	const { scene } = useThree();
	const elapsed = (0, import_react.useRef)(0);
	(0, import_react.useEffect)(() => {
		scene.add(rig.root);
		return () => {
			scene.remove(rig.root);
			rig.dispose();
		};
	}, [scene, rig]);
	useFrame((_, delta) => {
		const dt = Math.min(delta, .05);
		elapsed.current += dt;
		const pose = poseRef.current;
		if (!pose) return;
		tickKushim(rig, pose, dt, elapsed.current);
	});
	return null;
}
function KushimScene({ poseRef }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Canvas, {
		className: "h-full w-full",
		dpr: [1, 1.6],
		gl: {
			antialias: true,
			alpha: false,
			powerPreference: "high-performance"
		},
		camera: {
			fov: 26,
			near: .08,
			far: 40,
			position: [
				0,
				1,
				6
			]
		},
		onCreated: ({ gl }) => {
			gl.setClearColor(LOCK.void, 1);
			gl.toneMapping = 0;
		},
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Framing, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Avatar, { poseRef })]
	});
}
//#endregion
export { KushimScene };
