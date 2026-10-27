//#region node_modules/.nitro/vite/services/ssr/assets/lock-DSiqy2QN.js
/** Visual lock. Hourly passes may not change these values. */
var LOCK = {
	void: "#02060A",
	strom: "#3AD7FF",
	kern: "#E7FBFF",
	signal: "#FF3B4E",
	proportions: {
		hipY: .96,
		chestY: 1.22,
		shoulderX: .2,
		shoulderLocalY: .28,
		upperArm: .4,
		foreArm: .31,
		thigh: .46,
		shin: .4,
		headRadius: .105,
		headLocalY: .44
	}
};
var GESTURES = [
	"idle",
	"listen",
	"think",
	"speak",
	"explain",
	"acknowledge",
	"empathize"
];
function isGesture(value) {
	return GESTURES.includes(value);
}
//#endregion
export { isGesture as n, LOCK as t };
