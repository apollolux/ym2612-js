function YM2612() {
	if (!this instanceof YM2612) return new YM2612();
	this.version = 0x101;
	this.start = 0;
	this.count = 0;
	this.chip = null;
}

(function(Y){
"use strict";

/**** CONFIG ****/
var cfg = {
	hq_fm:0,	// force 53kHz sampling rate
	dac_bits:8,	// DAC width
	maxcalc:0,	// for logging, # total chan_calc ops to log
	debug:0,	// for logging
	debugLocal:0,
	debugArr:[],
	strict:0	// abort on bad input if true
};

/**** GLOBALS ****/
var _YM = {	//////////// old?
	"FREQ_SH":16,	// 16.16 fixed point (freq calcs)
	"EG_SH":16,	// 16.16 fixed point (env gen timing)
	"LFO_SH":24,	// 8.24 fixed point (lfo calcs)
	"TIMER_SH":16	// 16.16 fixed point (timers calcs)
};
_YM.FREQ_MASK = (1<<_YM.FREQ_SH)-1;

/**** ENVELOPE GENERATOR ****/
var _ENV = {
	"BITS":10,
	"MIN_ATT_INDEX":0
};
_ENV.LEN = 1<<_ENV.BITS;
_ENV.STEP = 128.0/_ENV.LEN;
_ENV.MAX_ATT_INDEX = _ENV.LEN-1;

var _EG = {
	'ATT':4,
	'DEC':3,
	'SUS':2,
	'REL':1,
	'OFF':0
};

/**** PHASE GENERATOR (detune mask) ****/
var _DT = {
	"BITS":17
};
_DT.LEN = 1<<_DT.BITS;
_DT.MASK = _DT.LEN-1;

/**** OPERATOR UNIT ****/
var _SIN = {
	"BITS":10
};
_SIN.LEN = 1<<_SIN.BITS;
_SIN.MASK = _SIN.LEN-1;

var _TL = {
	"BITS":14
};
_TL.RES_LEN = 256;	// sinus resolution
_TL.TAB_LEN = 13*2*_TL.RES_LEN;	// 13 = sinus amplitude bits, 2 = sinus sign bit
_TL.tab = new Array(_TL.TAB_LEN);

_ENV.QUIET = _TL.TAB_LEN>>3;

/* sin waveform table in 'decibel' scale */
_YM.sin = new Array(_SIN.LEN);

/* sustain level table (3dB per step) */
/* bit0, bit1, bit2, bit3, bit4, bit5, bit6 */
/* 1,    2,    4,    8,    16,   32,   64   (value)*/
/* 0.75, 1.5,  3,    6,    12,   24,   48   (dB)*/
/* 0 - 15: 0, 3, 6, 9,12,15,18,21,24,27,30,33,36,39,42,93 (dB)*/
/* attenuation value (10 bits) = (SL << 2) << 3 */
_YM.sl = (function(){
	var SC = function(db){return (db*4.0/_ENV.STEP)|0;};
	return [
		SC(0), SC(1), SC(2), SC(3), SC(4), SC(5), SC(6), SC(7),
		SC(8), SC(9), SC(10), SC(11), SC(12), SC(13), SC(14), SC(31)
	];
})();

_EG.RATE_STEPS = 8;
_EG.inc = [	// 19*_EG.RATE_STEPS
	/*cycle:0 1  2 3  4 5  6 7*/
	
	/* 0 */ 0,1, 0,1, 0,1, 0,1, /* rates 00..11 0 (increment by 0 or 1) */
	/* 1 */ 0,1, 0,1, 1,1, 0,1, /* rates 00..11 1 */
	/* 2 */ 0,1, 1,1, 0,1, 1,1, /* rates 00..11 2 */
	/* 3 */ 0,1, 1,1, 1,1, 1,1, /* rates 00..11 3 */
	
	/* 4 */ 1,1, 1,1, 1,1, 1,1, /* rate 12 0 (increment by 1) */
	/* 5 */ 1,1, 1,2, 1,1, 1,2, /* rate 12 1 */
	/* 6 */ 1,2, 1,2, 1,2, 1,2, /* rate 12 2 */
	/* 7 */ 1,2, 2,2, 1,2, 2,2, /* rate 12 3 */
	
	/* 8 */ 2,2, 2,2, 2,2, 2,2, /* rate 13 0 (increment by 2) */
	/* 9 */ 2,2, 2,4, 2,2, 2,4, /* rate 13 1 */
	/*10 */ 2,4, 2,4, 2,4, 2,4, /* rate 13 2 */
	/*11 */ 2,4, 4,4, 2,4, 4,4, /* rate 13 3 */
	
	/*12 */ 4,4, 4,4, 4,4, 4,4, /* rate 14 0 (increment by 4) */
	/*13 */ 4,4, 4,8, 4,4, 4,8, /* rate 14 1 */
	/*14 */ 4,8, 4,8, 4,8, 4,8, /* rate 14 2 */
	/*15 */ 4,8, 8,8, 4,8, 8,8, /* rate 14 3 */
	
	/*16 */ 8,8, 8,8, 8,8, 8,8, /* rates 15 0, 15 1, 15 2, 15 3 (increment by 8) */
	/*17 */ 16,16,16,16,16,16,16,16, /* rates 15 2, 15 3 for attack */
	/*18 */ 0,0, 0,0, 0,0, 0,0, /* infinity rates for attack and decay(s) */
];

_EG.rate_select = (function(){
	var O = function(a){return (a*_EG.RATE_STEPS)|0;};
	return [	// env gen rates - 32+64 rates+32 RKS
		/* 32 infinite time rates (same as Rate 0) */
		O(18),O(18),O(18),O(18),O(18),O(18),O(18),O(18),
		O(18),O(18),O(18),O(18),O(18),O(18),O(18),O(18),
		O(18),O(18),O(18),O(18),O(18),O(18),O(18),O(18),
		O(18),O(18),O(18),O(18),O(18),O(18),O(18),O(18),
		
		/* rates 00-11 */
		/*
		O( 0),O( 1),O( 2),O( 3),
		O( 0),O( 1),O( 2),O( 3),
		*/
		O(18),O(18),O( 0),O( 0),
		O( 0),O( 0),O( 2),O( 2),   // Nemesis's tests
		
		O( 0),O( 1),O( 2),O( 3),
		O( 0),O( 1),O( 2),O( 3),
		O( 0),O( 1),O( 2),O( 3),
		O( 0),O( 1),O( 2),O( 3),
		O( 0),O( 1),O( 2),O( 3),
		O( 0),O( 1),O( 2),O( 3),
		O( 0),O( 1),O( 2),O( 3),
		O( 0),O( 1),O( 2),O( 3),
		O( 0),O( 1),O( 2),O( 3),
		O( 0),O( 1),O( 2),O( 3),
		
		/* rate 12 */
		O( 4),O( 5),O( 6),O( 7),
		
		/* rate 13 */
		O( 8),O( 9),O(10),O(11),
		
		/* rate 14 */
		O(12),O(13),O(14),O(15),
		
		/* rate 15 */
		O(16),O(16),O(16),O(16),
		
		/* 32 dummy rates (same as 15 3) */
		O(16),O(16),O(16),O(16),O(16),O(16),O(16),O(16),
		O(16),O(16),O(16),O(16),O(16),O(16),O(16),O(16),
		O(16),O(16),O(16),O(16),O(16),O(16),O(16),O(16),
		O(16),O(16),O(16),O(16),O(16),O(16),O(16),O(16)
	];
})();

/*rate  0,    1,    2,   3,   4,   5,  6,  7,  8,  9, 10, 11, 12, 13, 14, 15*/
/*shift 11,   10,   9,   8,   7,   6,  5,  4,  3,  2, 1,  0,  0,  0,  0,  0 */
/*mask  2047, 1023, 511, 255, 127, 63, 31, 15, 7,  3, 1,  0,  0,  0,  0,  0 */
_EG.rate_shift = (function(){
	var O = function(a){return (a)|0;};
	return [	// env gen counter shifts - 32+64 rates+32 RKS
		/* 32 infinite time rates */
		/* O(0),O(0),O(0),O(0),O(0),O(0),O(0),O(0),
		O(0),O(0),O(0),O(0),O(0),O(0),O(0),O(0),
		O(0),O(0),O(0),O(0),O(0),O(0),O(0),O(0),
		O(0),O(0),O(0),O(0),O(0),O(0),O(0),O(0), */
		
		/* fixed (should be the same as rate 0, even if it makes no difference since increment value is 0 for these rates) */
		O(11),O(11),O(11),O(11),O(11),O(11),O(11),O(11),
		O(11),O(11),O(11),O(11),O(11),O(11),O(11),O(11),
		O(11),O(11),O(11),O(11),O(11),O(11),O(11),O(11),
		O(11),O(11),O(11),O(11),O(11),O(11),O(11),O(11),
		
		/* rates 00-11 */
		O(11),O(11),O(11),O(11),
		O(10),O(10),O(10),O(10),
		O( 9),O( 9),O( 9),O( 9),
		O( 8),O( 8),O( 8),O( 8),
		O( 7),O( 7),O( 7),O( 7),
		O( 6),O( 6),O( 6),O( 6),
		O( 5),O( 5),O( 5),O( 5),
		O( 4),O( 4),O( 4),O( 4),
		O( 3),O( 3),O( 3),O( 3),
		O( 2),O( 2),O( 2),O( 2),
		O( 1),O( 1),O( 1),O( 1),
		O( 0),O( 0),O( 0),O( 0),
		
		/* rate 12 */
		O( 0),O( 0),O( 0),O( 0),
		
		/* rate 13 */
		O( 0),O( 0),O( 0),O( 0),
		
		/* rate 14 */
		O( 0),O( 0),O( 0),O( 0),
		
		/* rate 15 */
		O( 0),O( 0),O( 0),O( 0),
		
		/* 32 dummy rates (same as 15 3) */
		O( 0),O( 0),O( 0),O( 0),O( 0),O( 0),O( 0),O( 0),
		O( 0),O( 0),O( 0),O( 0),O( 0),O( 0),O( 0),O( 0),
		O( 0),O( 0),O( 0),O( 0),O( 0),O( 0),O( 0),O( 0),
		O( 0),O( 0),O( 0),O( 0),O( 0),O( 0),O( 0),O( 0)
	];
})();

_DT.tab = [	// 4*32
	/* this is YM2151 and YM2612 phase increment data (in 10.10 fixed point format)*/
	/* FD=0 */
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	/* FD=1 */
	0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2,
	2, 3, 3, 3, 4, 4, 4, 5, 5, 6, 6, 7, 8, 8, 8, 8,
	/* FD=2 */
	1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5,
	5, 6, 6, 7, 8, 8, 9,10,11,12,13,14,16,16,16,16,
	/* FD=3 */
	2, 2, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 6, 6, 7,
	8 , 8, 9,10,11,12,13,14,16,17,19,20,22,22,22,22
];


/* OPN key frequency number -> key code follow table */
/* fnum higher 4bit -> keycode lower 2bit */
var OPN = {
	"fktable":[0,0,0,0,0,0,0,1,2,3,3,3,3,3,3,3],
};

var LFO = {
	/* 8 LFO speed parameters */
	/* each value represents number of samples that one LFO level will last for */
	"samples_per_step":[108, 77, 71, 67, 62, 44, 8, 5],
	/*There are 4 different LFO AM depths available, they are:
	  0 dB, 1.4 dB, 5.9 dB, 11.8 dB
	  Here is how it is generated (in EG steps):

	  11.8 dB = 0, 2, 4, 6, 8, 10,12,14,16...126,126,124,122,120,118,....4,2,0
	   5.9 dB = 0, 1, 2, 3, 4, 5, 6, 7, 8....63, 63, 62, 61, 60, 59,.....2,1,0
	   1.4 dB = 0, 0, 0, 0, 1, 1, 1, 1, 2,...15, 15, 15, 15, 14, 14,.....0,0,0

	  (1.4 dB is loosing precision as you can see)

	  It's implemented as generator from 0..126 with step 2 then a shift
	  right N times, where N is:
	    8 for 0 dB
	    3 for 1.4 dB
	    1 for 5.9 dB
	    0 for 11.8 dB
	*/
	"ams_depth_shift":[8,3,1,0],
	/*There are 8 different LFO PM depths available, they are:
	  0, 3.4, 6.7, 10, 14, 20, 40, 80 (cents)

	  Modulation level at each depth depends on F-NUMBER bits: 4,5,6,7,8,9,10
	  (bits 8,9,10 = FNUM MSB from OCT/FNUM register)

	  Here we store only first quarter (positive one) of full waveform.
	  Full table (lfo_pm_table) containing all 128 waveforms is build
	  at run (init) time.

	  One value in table below represents 4 (four) basic LFO steps
	  (1 PM step = 4 AM steps).

	  For example:
	   at LFO SPEED=0 (which is 108 samples per basic LFO step)
	   one value from "lfo_pm_output" table lasts for 432 consecutive
	   samples (4*108=432) and one full LFO waveform cycle lasts for 13824
	   samples (32*432=13824; 32 because we store only a quarter of whole
	            waveform in the table below)
	*/
	"pm_output":[	// [7*8][8]
		/* 7 bits meaningful (of F-NUMBER), 8 LFO output levels per one depth (out of 32), 8 LFO depths */
		/* FNUM BIT 4: 000 0001xxxx */
		/* DEPTH 0 */ [0,   0,   0,   0,   0,   0,   0,   0],
		/* DEPTH 1 */ [0,   0,   0,   0,   0,   0,   0,   0],
		/* DEPTH 2 */ [0,   0,   0,   0,   0,   0,   0,   0],
		/* DEPTH 3 */ [0,   0,   0,   0,   0,   0,   0,   0],
		/* DEPTH 4 */ [0,   0,   0,   0,   0,   0,   0,   0],
		/* DEPTH 5 */ [0,   0,   0,   0,   0,   0,   0,   0],
		/* DEPTH 6 */ [0,   0,   0,   0,   0,   0,   0,   0],
		/* DEPTH 7 */ [0,   0,   0,   0,   1,   1,   1,   1],

		/* FNUM BIT 5: 000 0010xxxx */
		/* DEPTH 0 */ [0,   0,   0,   0,   0,   0,   0,   0],
		/* DEPTH 1 */ [0,   0,   0,   0,   0,   0,   0,   0],
		/* DEPTH 2 */ [0,   0,   0,   0,   0,   0,   0,   0],
		/* DEPTH 3 */ [0,   0,   0,   0,   0,   0,   0,   0],
		/* DEPTH 4 */ [0,   0,   0,   0,   0,   0,   0,   0],
		/* DEPTH 5 */ [0,   0,   0,   0,   0,   0,   0,   0],
		/* DEPTH 6 */ [0,   0,   0,   0,   1,   1,   1,   1],
		/* DEPTH 7 */ [0,   0,   1,   1,   2,   2,   2,   3],

		/* FNUM BIT 6: 000 0100xxxx */
		/* DEPTH 0 */ [0,   0,   0,   0,   0,   0,   0,   0],
		/* DEPTH 1 */ [0,   0,   0,   0,   0,   0,   0,   0],
		/* DEPTH 2 */ [0,   0,   0,   0,   0,   0,   0,   0],
		/* DEPTH 3 */ [0,   0,   0,   0,   0,   0,   0,   0],
		/* DEPTH 4 */ [0,   0,   0,   0,   0,   0,   0,   1],
		/* DEPTH 5 */ [0,   0,   0,   0,   1,   1,   1,   1],
		/* DEPTH 6 */ [0,   0,   1,   1,   2,   2,   2,   3],
		/* DEPTH 7 */ [0,   0,   2,   3,   4,   4,   5,   6],

		/* FNUM BIT 7: 000 1000xxxx */
		/* DEPTH 0 */ [0,   0,   0,   0,   0,   0,   0,   0],
		/* DEPTH 1 */ [0,   0,   0,   0,   0,   0,   0,   0],
		/* DEPTH 2 */ [0,   0,   0,   0,   0,   0,   1,   1],
		/* DEPTH 3 */ [0,   0,   0,   0,   1,   1,   1,   1],
		/* DEPTH 4 */ [0,   0,   0,   1,   1,   1,   1,   2],
		/* DEPTH 5 */ [0,   0,   1,   1,   2,   2,   2,   3],
		/* DEPTH 6 */ [0,   0,   2,   3,   4,   4,   5,   6],
		/* DEPTH 7 */ [0,   0,   4,   6,   8,   8, 0xa, 0xc],

		/* FNUM BIT 8: 001 0000xxxx */
		/* DEPTH 0 */ [0,   0,   0,   0,   0,   0,   0,   0],
		/* DEPTH 1 */ [0,   0,   0,   0,   1,   1,   1,   1],
		/* DEPTH 2 */ [0,   0,   0,   1,   1,   1,   2,   2],
		/* DEPTH 3 */ [0,   0,   1,   1,   2,   2,   3,   3],
		/* DEPTH 4 */ [0,   0,   1,   2,   2,   2,   3,   4],
		/* DEPTH 5 */ [0,   0,   2,   3,   4,   4,   5,   6],
		/* DEPTH 6 */ [0,   0,   4,   6,   8,   8, 0xa, 0xc],
		/* DEPTH 7 */ [0,   0,   8, 0xc,0x10,0x10,0x14,0x18],

		/* FNUM BIT 9: 010 0000xxxx */
		/* DEPTH 0 */ [0,   0,   0,   0,   0,   0,   0,   0],
		/* DEPTH 1 */ [0,   0,   0,   0,   2,   2,   2,   2],
		/* DEPTH 2 */ [0,   0,   0,   2,   2,   2,   4,   4],
		/* DEPTH 3 */ [0,   0,   2,   2,   4,   4,   6,   6],
		/* DEPTH 4 */ [0,   0,   2,   4,   4,   4,   6,   8],
		/* DEPTH 5 */ [0,   0,   4,   6,   8,   8, 0xa, 0xc],
		/* DEPTH 6 */ [0,   0,   8, 0xc,0x10,0x10,0x14,0x18],
		/* DEPTH 7 */ [0,   0,0x10,0x18,0x20,0x20,0x28,0x30],

		/* FNUM BIT10: 100 0000xxxx */
		/* DEPTH 0 */ [0,   0,   0,   0,   0,   0,   0,   0],
		/* DEPTH 1 */ [0,   0,   0,   0,   4,   4,   4,   4],
		/* DEPTH 2 */ [0,   0,   0,   4,   4,   4,   8,   8],
		/* DEPTH 3 */ [0,   0,   4,   4,   8,   8, 0xc, 0xc],
		/* DEPTH 4 */ [0,   0,   4,   8,   8,   8, 0xc,0x10],
		/* DEPTH 5 */ [0,   0,   8, 0xc,0x10,0x10,0x14,0x18],
		/* DEPTH 6 */ [0,   0,0x10,0x18,0x20,0x20,0x28,0x30],
		/* DEPTH 7 */ [0,   0,0x20,0x30,0x40,0x40,0x50,0x60]
	],
	/* all 128 LFO PM waveforms */
	/* 128 combinations of 7 bits meaningful (of F-NUMBER), 8 LFO depths, 32 LFO output levels per one depth */
	"pm_table":new Array(128*8*32)
};

OPN.CHAN = function(N){return N&0x3;};
OPN.SLOT = function(N){return (N>>2)&0x3;};

/* slot number */
var _SLOT = [0,2,1,3];

/**** END GLOBALS ****/

/**** FM STRUCTS based on genplus-gx ****/
function FM_SLOT() {
	this.DT = -1;	// index into ym2612.OPN.ST.dt_tab, formerly INT32*	detune: dt_tab[DT]
	this.KSR = 0;	// UINT8	key scale rate: 3-KSR
	function _rate() {
		this.ar = 0;	// UINT32	attack rate
		this.d1r = 0;	// UINT32	decay rate
		this.d2r = 0;	// UINT32	sustain rate
		this.rr = 0;	// UINT32	release rate
		this.ksr = 0;	// UINT8	key scale rate: kcode>>(3-KSR)
		this.mul = 1;	// UINT32	multiple: ML_TABLE[ML]
		this.init = function() {
			this.ar = 0;
			this.d1r = 0;
			this.d2r = 0;
			this.rr = 0;
			this.ksr = 0;
			this.mul = 1;
		};
	}
	this.rate = new _rate;
	// phase generator
	this.phase = 0;	// UINT32	phase counter
	this.Incr = 0;	// INT32	phase step
	// envelope generator
	this.state = 0;	// UINT8	phase type
	this.tl = 0;	// UINT32	total level: TL<<3
	this.volume = 0;	// UINT32	envelope counter
	this.sl = 0;	// UINT32	sustain level: sl_table[SL]
	this.vol_out = 0;	// UINT32	current output from EG (without AM from LFO)
	function _eg() {
		this.ar=0;	// UINT8
		this.d1r=0;	// UINT8
		this.d2r=0;	// UINT8
		this.rr=0;	// UINT8
		this.init = function(){
			this.ar=0;	// UINT8
			this.d1r=0;	// UINT8
			this.d2r=0;	// UINT8
			this.rr=0;	// UINT8
		};
	}
	this.eg = {
		sh:new _eg,	// state
		sel:new _eg,
		init:function(){this.sh.init();this.sel.init();}
	};
	this.ssg = 0;	// UINT8	ssg-eg waveform
	this.ssgn = 0;	// UINT8	ssg-eg negated output
	this.key = 0;	// UINT8	0 = last key was KEY_OFF, 1 = KEY_ON
	// lfo
	this.AMmask = 0;	// UINT32	AM enable flag
	this.reset = function() {
		this.Incr = -1;
		this.key = 0;
		this.phase = 0;
		this.ssgn = 0;
		this.state = _EG.OFF;
		this.volume = _ENV.MAX_ATT_INDEX;
		this.vol_out = _ENV.MAX_ATT_INDEX;
	};
}
function FM_CH() {
	this.SLOT = [	// four slots/ops
		new FM_SLOT(),
		new FM_SLOT(),
		new FM_SLOT(),
		new FM_SLOT()
	];
	this.ALGO = 0;	// UINT8	algorithm
	this.FB = 0;	// UINT8	feedback shift
	this.op1_out = [0,0];	// INT32	op1 output for feedback (stereo)
	this.connect = ['x','x','x','x'];	// SLOT output pointers, formerly INT32*[4]
	this.mem = {
		connect:'mem',	// INT32*	where to put the delayed sample (MEM)
		value:0	// INT32	delated sample (MEM) value
	};
	this.pms = 0;	// INT32	channel PMS
	this.ams = 0;	// UINT8	channel AMS
	this.fc = 0;	// UINT32	fnum,blk adjusted to sample rate
	this.kcode = 0;	// UINT8	key code
	this.block_fnum = 0;	// UINT32	current blk/fnum value for this slot
	this.fn_h = 0;	// replaces FM_ST.fn_h
	this.out = 0;	// replaces out_fm[ch]
	this.canCSM = 0;	// replaces hardcoded check against CH3
	this.canDAC = 0;	// replaces hardcoded check against CH6
	this.muted = 0;
	this.pan = [0,0];	// replaces FM_OPN.pan
	this.reset = function() {
		this.mem.value = 0, this.op1_out[0] = 0, this.op1_out[1] = 0;
		var s = this.SLOT.length; while (--s>-1) this.SLOT[s].reset();
	};
}
function FM_ST(c, r) {
	this.address = 0;	// UINT16	address register
	this.status = 0;	// UINT8	status flag
	this.mode = 0;	// UINT32	CSM/3SLOT mode
	//this.fn_h = 0;	// UINT8	freq latch
	this.TA = 0;	// INT32	timer a value
	this.TAL = 0;	// INT32	timer a base
	this.TAC = 0;	// INT32	timer a counter
	this.TB = 0;	// INT32	timer b value
	this.TBL = 0;	// INT32	timer b base
	this.TBC = 0;	// INT32	timer b counter
	this.dt_tab = [	// INT32[8][32]	detune table
		new Array(32),
		new Array(32),
		new Array(32),
		new Array(32),
		new Array(32),
		new Array(32),
		new Array(32),
		new Array(32)
	];
	this.clock = c||7670448;
	this.rate = r||44100;
}

function FM_3SLOT() {
	this.fc = [0,0,0];	// UINT32[3]	fnum3,blk3 calculated
	this.fn_h = 0;	// UINT8	freq3 latch
	this.kcode = [0,0,0];	// UINT8[3]	key code
	this.block_fnum = [0,0,0];	// UINT32[3]	current fnum value for this slot
	this.key_csm = 0;	// UINT8	CSM mode KEY_ON flag
}

function FM_OPN(c, r) {
	this.ST = new FM_ST(c,r);
	this.SL3 = new FM_3SLOT;
	//this.pan = new Array(6*2);	// UINT[6*2]	fm channels output masks (0xffffffff = enable)
	function _timer() {
		this.cnt = 0;
		this.timer = 0;
		this.timer_add = 0;	// vb
		this.timer_overflow = 0;	// vb unused for eg
		this.init = function() {
			this.cnt = 0;	// current phase counter (UINT32 for eg, UINT8 for lfo)
			this.timer = 0;	// UINT32
			this.timer_add = 0;	// UINT32	step of timer
			this.timer_overflow = 0;	// UINT32	timer overflows every N samples
		};
	}
	this.eg = new _timer();
	this.lfo = new _timer();
	this.lfo.AM = 0;	// UINT32	current lfo AM step
	this.lfo.PM = 0;	// UINT32	current lfo PM step
	this.fn = {"table":[], "max":0};
}

function YMX(c,r) {
	this.CH = [new FM_CH, new FM_CH, new FM_CH, new FM_CH, new FM_CH, new FM_CH];
	this.CH[2].canCSM = 1;
	this.CH[5].canDAC = 1;
	this.dacen = 0;	// UINT8
	this.dacout = 0;	// INT32
	this.OPN = new FM_OPN(c,r);
}
/**** END FM STRUCTS ****/

/**** FM DEFS based on genplus-gx ****/
/* current chip state */
_YM.m2 = 0; _YM.c1 = 0; _YM.c2 = 0;	// INT32	phase modulation input for ops 2,3,4
_YM.mem = 0;	// INT32	one sample delay memory
//_YM.out_fm = [0,0,0,0,0,0,0,0];	// INT32[8]	outputs of working channels	// REPLACED BY FM_CH.out
_YM.bitmask = 0;	//UINT32	working channels output bitmasking (DAC quantization)

FM_SLOT.prototype.keyOn = function(x,csm) {
	if (!this.key&&!x.OPN.SL3.key_csm) {
		this.phase = 0;	/* restart Phase Generator */
		this.ssgn = 0;	/* reset SSG-EG inversion flag */
		if ((this.rate.ar+this.rate.ksr)<94) this.state = (this.volume<=_ENV.MIN_ATT_INDEX)?(this.sl===_ENV.MIN_ATT_INDEX?_EG.SUS:_EG.DEC):_EG.ATT;
		else {
			this.volume = _ENV.MIN_ATT_INDEX;	/* force attenuation level to 0 */
			this.state = (this.rate.sl===_ENV.MIN_ATT_INDEX)?_EG.SUS:_EG.DEC;
		}
		/* recalculate EG output */
		if ((this.ssg&0x08)>0&&(this.ssgn^(this.ssg&0x04))>0) this.vol_out = this.tl+((0x200-this.volume)&_ENV.MAX_ATT_INDEX);
		else this.vol_out = this.tl+(this.volume|0);
	}
	if (!csm) this.key = 1;
};
FM_CH.prototype.keyOn = function(x,s) {this.SLOT[s].keyOn(x,0);};

FM_SLOT.prototype.keyOff = function(x,csm) {
	if ((csm&&!this.key)||(!csm&&this.key&&!x.OPN.SL3.key_csm)) {
		if (this.state>_EG.REL) {
			this.state = _EG.REL;	/* phase -> Release */
			/* SSG-EG specific update */
			if ((this.ssg&0x08)>0) {
				/* convert EG attenuation level */
				if ((this.ssgn^(this.ssg&0x04))>0) this.volume = (0x200-this.volume)|0;
				/* force EG attenuation level */
				if (this.volume>=0x200) {
					this.volume = _ENV.MAX_ATT_INDEX;
					this.state = _EG.OFF;
				}
				this.vol_out = this.tl+(this.volume|0);	/* recalculate EG output */
			}
		}
	}
	if (!csm) this.key = 0;
};
FM_CH.prototype.keyOff = function(x,s) {this.SLOT[s].keyOff(x,0);};

FM_CH.prototype.keyOnCSM = function(x,s) {this.SLOT[s].keyOn(x,1);};
FM_CH.prototype.keyOffCSM = function(x,s) {this.SLOT[s].keyOff(x,1);};

FM_CH.prototype.keyControlCSM = function(x) {
	this.keyOnCSM(_SLOT[0]);
	this.keyOnCSM(_SLOT[1]);
	this.keyOnCSM(_SLOT[2]);
	this.keyOnCSM(_SLOT[3]);
	x.OPN.SL3.key_csm = 1;
};

function INTERNAL_TIMER_A(x) {
	if ((x.OPN.ST.mode&0x01)>0) {
		--x.OPN.ST.TAC;
		if (x.OPN.ST.TAC<=0) {
			/* set status (if enabled) */
			if ((x.OPN.ST.mode&0x04)>0) x.OPN.ST.status |= 0x01;
			/* reload the counter */
			x.OPN.ST.TAC = x.OPN.ST.TAL;
			/* CSM mode auto key on */
			if ((x.OPN.ST.mode & 0xC0) == 0x80) x.CH[2].keyControlCSM();
		}
	}
}
function INTERNAL_TIMER_B(x, step) {
	if ((x.OPN.ST.mode & 0x02)>0) {
		x.OPN.ST.TBC -= step;
		if (x.OPN.ST.TBC <= 0) {
			/* set status (if enabled) */
			if ((x.OPN.ST.mode & 0x08)>0) x.OPN.ST.status |= 0x02;
			/* reload the counter */
			if (x.OPN.ST.TBL) x.OPN.ST.TBC += x.OPN.ST.TBL;
			else x.OPN.ST.TBC = x.OPN.ST.TBL;
		}
	}
}

/* OPN Mode Register Write */
function set_timers(x,v) {
	/* b7 = CSM MODE */
	/* b6 = 3 slot mode */
	/* b5 = reset b */
	/* b4 = reset a */
	/* b3 = timer enable b */
	/* b2 = timer enable a */
	/* b1 = load b */
	/* b0 = load a */
	if (((x.OPN.ST.mode^v)&0xc0)>0) {
		x.CH[2].SLOT[_SLOT[0]].Incr = -1;	// phase increment need to be recalculated
		// csm mode disabled and csm keyon active
		if (((v&0xc0)!==0x80)&&x.OPN.SL3.key_csm) {
			// csm mode keyoff
			x.CH[2].keyOffCSM(_SLOT[0]);
			x.CH[2].keyOffCSM(_SLOT[1]);
			x.CH[2].keyOffCSM(_SLOT[2]);
			x.CH[2].keyOffCSM(_SLOT[3]);
			x.OPN.SL3.key_csm = 0;
		}
	}
	// reload timers
	if ((v&1)&&!(x.OPN.ST.mode&1)) x.OPN.ST.TAC = x.OPN.ST.TAL;
	if ((v&2)&&!(x.OPN.ST.mode&2)) x.OPN.ST.TBC = x.OPN.ST.TBL;
	// reset timers flags
	x.OPN.ST.status &= ~v>>4;
	x.OPN.ST.mode = v;
}

/* set algorithm connection */
FM_CH.prototype.setupConnection = function() {
	var carrier = 'out';
	var om1 = 1, om2 = 3, oc1 = 2;
	switch (this.ALGO) {
		case 0:
			/* M1---C1---MEM---M2---C2---OUT */
			this.connect[om1] = 'c1';
			this.connect[oc1] = 'mem';
			this.connect[om2] = 'c2';
			this.mem.connect = 'm2';
			break;
		case 1:
			/* M1------+-MEM---M2---C2---OUT */
			/*      C1-+                     */
			this.connect[om1] = 'mem';
			this.connect[oc1] = 'mem';
			this.connect[om2] = 'c2';
			this.mem.connect = 'm2';
			break;
		case 2:
			/* M1-----------------+-C2---OUT */
			/*      C1---MEM---M2-+          */
			this.connect[om1] = 'c2';
			this.connect[oc1] = 'mem';
			this.connect[om2] = 'c2';
			this.mem.connect = 'm2';
			break;
		case 3:
			/* M1---C1---MEM------+-C2---OUT */
			/*                 M2-+          */
			this.connect[om1] = 'c1';
			this.connect[oc1] = 'mem';
			this.connect[om2] = 'c2';
			this.mem.connect = 'c2';
			break;
		case 4:
			/* M1---C1-+-OUT */
			/* M2---C2-+     */
			/* MEM: not used */
			this.connect[om1] = 'c1';
			this.connect[oc1] = carrier;
			this.connect[om2] = 'c2';
			this.mem.connect = 'mem';
			break;
		case 5:
			/*    +----C1----+     */
			/* M1-+-MEM---M2-+-OUT */
			/*    +----C2----+     */
			this.connect[om1] = 'x';
			this.connect[oc1] = carrier;
			this.connect[om2] = carrier;
			this.mem.connect = 'm2';
			break;
		case 6:
			/* M1---C1-+     */
			/*      M2-+-OUT */
			/*      C2-+     */
			/* MEM: not used */
			this.connect[om1] = 'c1';
			this.connect[oc1] = carrier;
			this.connect[om2] = carrier;
			this.mem.connect = 'mem';
			break;
		case 7:
			/* M1-+     */
			/* C1-+-OUT */
			/* M2-+     */
			/* C2-+     */
			/* MEM: not used*/
			this.connect[om1] = carrier;
			this.connect[oc1] = carrier;
			this.connect[om2] = carrier;
			this.mem.connect = 'mem';
			break;
		default:
			if (cfg.strict) throw new Error("CH::setup_connection - unsupported algorithm ("+this.ALGO+")");
			else break;
	}
	this.connect[3] = carrier;
};

/* set detune & multiple */
FM_SLOT.prototype.set_det_mul = function(x,v) {
	this.rate.mul = ((v&0x0f)>0)?((v&0x0f)<<1):1;
	this.DT = (v>>4)&7;//x.OPN.ST.dt_tab[(v>>4)&7];
};
FM_CH.prototype.set_det_mul = function(x,s,v) {
	this.SLOT[s].set_det_mul(x,v);
	this.SLOT[_SLOT[0]].Incr = -1;
};

/* set total level */
FM_SLOT.prototype.set_tl = function(v) {
	this.tl = (v&0x7f)<<(_ENV.BITS-7);	// 7-bit tl
	// recalculate eg output
	if ((this.ssg&0x08)>0&&((this.ssgn^(this.ssg&0x04))>0?1:0)&&this.state>_EG.REL)
		this.vol_out = this.tl+(((0x200-this.volume)|0)&_ENV.MAX_ATT_INDEX);
	else
		this.vol_out = this.tl+((this.volume)|0);
};
FM_CH.prototype.set_tl = function(s,v) {this.SLOT[s].set_tl(v);};

/* set attack rate & key scale  */
FM_SLOT.prototype.set_ar_ksr = function(v) {
	var old_ksr = this.KSR;
	this.rate.ar = ((v&0x1f)>0)?32+((v&0x1f)<<1):0;
	this.KSR = 3-(v>>6);
	/* Even if it seems unnecessary to do it here, it could happen that KSR and KC  */
	/* are modified but the resulted SLOT->ksr value (kc >> SLOT->KSR) remains unchanged. */
	/* In such case, Attack Rate would not be recalculated by "refresh_fc_eg_slot". */
	/* This fixes the intro of "The Adventures of Batman & Robin" (Eke-Eke)         */
	if ((this.rate.ar+this.rate.ksr)<(32+62)) {
		var q = (this.rate.ar+this.rate.ksr)|0;
		this.eg.sh.ar = _EG.rate_shift[q];
		this.eg.sel.ar = _EG.rate_select[q];
	}
	else {	/* verified by Nemesis on real hardware (Attack phase is blocked) */
		this.eg.sh.ar = 0;
		this.eg.sel.ar = 18*_EG.RATE_STEPS;
	}
	return this.KSR!==old_ksr;
};
FM_CH.prototype.set_ar_ksr = function(s,v) {if (this.SLOT[s].set_ar_ksr(v)) this.SLOT[_SLOT[0]].Incr = -1;};

/* set decay rate */
FM_SLOT.prototype.set_dr = function(v) {
	this.rate.d1r = ((v&0x1f)>0)?32+((v&0x1f)<<1):0;
	var q = (this.rate.d1r+this.rate.ksr)|0;
	this.eg.sh.d1r = _EG.rate_shift[q];
	this.eg.sel.d1r = _EG.rate_select[q];
};
FM_CH.prototype.set_dr = function(s,v) {this.SLOT[s].set_dr(v);};

/* set sustain rate */
FM_SLOT.prototype.set_sr = function(v) {
	this.rate.d2r = ((v&0x1f)>0)?32+((v&0x1f)<<1):0;
	var q = (this.rate.d2r+this.rate.ksr)|0;
	this.eg.sh.d2r = _EG.rate_shift[q];
	this.eg.sh.d2r = _EG.rate_select[q];
};
FM_CH.prototype.set_sr = function(s,v) {this.SLOT[s].set_sr(v);};

/* set release rate */
FM_SLOT.prototype.set_sl_rr = function(v) {
	this.sl = _YM.sl[(v>>4)&0xf];
	// check eg state changes
	if (this.state===_EG.DEC&&this.volume>=(this.sl|0)) this.state = _EG.SUS;
	this.rate.rr = 34+((v&0x0f)<<2);
	var q = (this.rate.rr+this.rate.ksr)|0;
	this.eg.sh.rr = _EG.rate_shift[q];
	this.eg.sel.rr = _EG.rate_select[q];
};
FM_CH.prototype.set_sl_rr = function(s,v) {this.SLOT[s].set_sl_rr(v);};

/* advance LFO to next sample */
function advance_lfo(x) {
	if (x.OPN.lfo.timer_overflow) {	/* LFO enabled ? */
		/* increment LFO timer (every samples) */
		++x.OPN.lfo.timer;	// gpgx
		//x.OPN.lfo.timer += x.OPN.lfo.timer_add;	// vb
		/* when LFO is enabled, one level will last for 108, 77, 71, 67, 62, 44, 8 or 5 samples */
		if (x.OPN.lfo.timer>=x.OPN.lfo.timer_overflow) {	// gpgx
		//while (x.OPN.lfo.timer>=x.OPN.lfo.timer_overflow) {	// vb
			x.OPN.lfo.timer = 0;	// gpgx
			//x.OPN.lfo.timer -= x.OPN.lfo.timer_overflow;	// vb
			x.OPN.lfo.cnt = (x.OPN.lfo.cnt+1)&127;	/* There are 128 LFO steps */
			/* triangle (inverted) */
			/* AM: from 126 to 0 step -2, 0 to 126 step +2 */
			if (x.OPN.lfo.cnt<64) x.OPN.lfo.AM = (x.OPN.lfo.cnt^63)<<1;
			else x.OPN.lfo.AM = (x.OPN.lfo.cnt&63)<<1;
			x.OPN.lfo.PM = x.OPN.lfo.cnt>>2;	/* PM works with 4 times slower clock */
		}
	}
}

FM_SLOT.prototype.advance_eg = function(eg_cnt) {
	switch (this.state) {
		case _EG.ATT:	/* attack phase */
			if (!(eg_cnt&((1<<this.eg.sh.ar)-1))) {
				this.volume += (~this.volume*(_EG.inc[this.eg.sel.ar+((eg_cnt>>this.eg.sh.ar)&7)]))>>4;	/* update attenuation level */
				/* check phase transition*/
				if (this.volume<=_ENV.MIN_ATT_INDEX) {
					this.volume = _ENV.MIN_ATT_INDEX;
					this.state = ((this.sl|0)===_ENV.MIN_ATT_INDEX)?_EG.SUS:_EG.DEC;	/* special case where SL=0 */
				}
				/* recalculate EG output */
				if ((this.ssg&0x08)>0&&(this.ssgn^(this.ssg&0x04))>0) this.vol_out = this.tl+(((0x200-this.volume)|0)&_ENV.MAX_ATT_INDEX);	/* SSG-EG Output Inversion */
				else this.vol_out = this.tl+(this.volume|0);
			}
			break;
		case _EG.DEC:	/* decay phase */
			if (!(eg_cnt&((1<<this.eg.sh.d1r)-1))) {
				if ((this.ssg&0x08)>0) {	/* SSG EG type */
					/* update attenuation level */
					if (this.volume<0x200) {
						this.volume += _EG.inc[this.eg.sel.d1r+((eg_cnt>>this.eg.sh.d1r)&7)]<<2;
						/* recalculate EG output */
						if ((this.ssgn^(this.ssg&0x04))>0) this.vol_out = this.tl+(((0x200-this.volume)|0)&_ENV.MAX_ATT_INDEX);	/* SSG-EG Output Inversion */
						else this.vol_out = this.tl+(this.volume|0);
					}
				}
				else {
					this.volume += (_EG.inc[this.eg.sel.d1r+((eg_cnt>>this.eg.sh.d1r)&7)]);
					this.vol_out = this.tl+(this.volume|0);	/* recalculate EG output */
				}
				/* check phase transition*/
				if (this.volume>=(this.sl|0)) this.state = _EG.SUS;
			}
			break;
		case _EG.SUS:	/* sustain phase */
			if (!(eg_cnt&((1<<this.eg.sh.d2r)-1))) {
				/* SSG EG type */
				if ((this.ssg&0x08)>0) {
					/* update attenuation level */
					if (this.volume<0x200) {
						this.volume += _EG.inc[this.eg.sel.d2r+((eg_cnt>>this.eg.sh.d2r)&7)]<<2;
						/* recalculate EG output */
						if ((this.ssgn^(this.ssg&0x04))>0) this.vol_out = this.tl+(((0x200-this.volume)|0)&_ENV.MAX_ATT_INDEX);	/* SSG-EG Output Inversion */
						else this.vol_out = this.tl+(this.volume|0);
					}
				}
				else {
					/* update attenuation level */
					this.volume += (_EG.inc[this.eg.sel.d2r+((eg_cnt>>this.eg.sh.d2r)&7)]);
					/* check phase transition*/
					if (this.volume>=_ENV.MAX_ATT_INDEX) this.volume = _ENV.MAX_ATT_INDEX;	/* do not change SLOT->state (verified on real chip) */
					this.vol_out = this.tl+(this.volume|0);	/* recalculate EG output */
				}
			}
			break;
		case _EG.REL:	/* release phase */
			if (!(eg_cnt&((1<<this.eg.sh.rr)-1))) {
				/* SSG EG type */
				if ((this.ssg&0x08)>0) {
					/* update attenuation level */
					if (this.volume<0x200) {
						this.volume += _EG.inc[this.eg.sel.rr+((eg_cnt>>this.eg.sh.rr)&7)]<<2;
						/* check phase transition*/
						if (this.volume>=0x200) {
							this.volume = _ENV.MAX_ATT_INDEX;
							this.state = _EG.OFF;
						}
					}
				}
				else {
					/* update attenuation level */
					this.volume += (_EG.inc[this.eg.sel.rr+((eg_cnt>>this.eg.sh.rr)&7)]);
					/* check phase transition*/
					if (this.volume>=_ENV.MAX_ATT_INDEX) {
						this.volume = _ENV.MAX_ATT_INDEX;
						this.state = _EG.OFF;
					}
					this.vol_out = this.tl+(this.volume|0);	/* recalculate EG output */
				}
			}
			break;
		default:
			if (cfg.strict) throw new Error("FM_SLOT::advance_eg - unsupported state ("+this.state+")");
			else break;
	}
};
FM_CH.prototype.advance_eg = function(eg_cnt) {var j = this.SLOT.length; while (--j>-1) this.SLOT[j].advance_eg(eg_cnt);};
function advance_eg_channels(x, eg_cnt) {var i = x.CH.length; while (--i>-1) x.CH[i].advance_eg(eg_cnt);}

/* SSG-EG update process */
/* The behavior is based upon Nemesis tests on real hardware */
/* This is actually executed before each samples */
FM_SLOT.prototype.update_ssg_eg = function() {
	/* detect SSG-EG transition */
	/* this is not required during release phase as the attenuation has been forced to MAX and output invert flag is not used */
	/* if an Attack Phase is programmed, inversion can occur on each sample */
	if ((this.ssg&0x08)>0&&this.volume>=0x200&&this.state>_EG.REL) {
		if ((this.ssg&0x01)>0) {	/* bit 0 = hold SSG-EG */
			if ((this.ssg&0x02)>0) this.ssgn = 4;	/* set inversion flag */
			if (this.state!==_EG.ATT&&(this.ssgn^(this.ssg&0x04))<=0) this.volume = _ENV.MAX_ATT_INDEX;	/* force attenuation level during decay phases */
		}
		else {	/* loop SSG-EG */
			/* toggle output inversion flag or reset Phase Generator */
			if ((this.ssg&0x02)>0) this.ssgn ^= 4;
			else this.phase = 0;
			/* same as Key ON */
			if (this.state!==_EG.ATT) {
				if ((this.rate.ar+this.rate.ksr)<94)	/*32+62*/
					this.state = (this.volume<=_ENV.MIN_ATT_INDEX)?
						((this.sl|0)===_ENV.MIN_ATT_INDEX?_EG.SUS:_EG.DEC):
						_EG.ATT;
				else {	/* Attack Rate is maximal: directly switch to Decay or Sustain */
					this.volume = _ENV.MIN_ATT_INDEX;
					this.state = ((this.sl|0)===_ENV.MIN_ATT_INDEX)?_EG.SUS:_EG.DEC;
				}
			}
		}
		/* recalculate EG output */
		if ((this.ssgn^(this.ssg&0x04))>0) this.vol_out = this.tl+(((0x200-this.volume)|0)&_ENV.MAX_ATT_INDEX);
		else this.vol_out = this.tl+this.volume;
	}
};
FM_CH.prototype.update_ssg_eg = function() {var j = this.SLOT.length; while (--j>-1) this.SLOT[j].update_ssg_eg();};
function update_ssg_eg_channels(x) {var i = x.CH.length; while (--i>-1) x.CH[i].update_ssg_eg();}

FM_SLOT.prototype.update_phase_lfo = function(x, pms, block_fnum) {
	var off = LFO.pm_table[(((block_fnum&0x7f0)>>4)<<8)+pms+x.OPN.lfo.PM];
	if (off) {	/* LFO phase modulation active */
		if (this.DT<0) {
			console.log("FM_SLOT::update_phase_lfo - invalid DT",this.DT);
			if (cfg.strict) throw new Error("FM_SLOT::update_phase_lfo - invalid DT="+this.DT);
			else return;
		}
		var blk, kc, fc;
		/* there are 2048 FNUMs that can be generated using FNUM/BLK registers
		      but LFO works with one more bit of a precision so we really need 4096 elements */
		block_fnum = off+(block_fnum<<1);
		blk = (block_fnum&0x7000)>>12;
		block_fnum = block_fnum&0xfff;
		kc = (blk<<2)|OPN.fktable[block_fnum>>8];	/* keyscale code */
		/* (frequency) phase increment counter */
		fc = (((block_fnum<<5)>>(7-blk))+x.OPN.ST.dt_tab[this.DT][kc])&_DT.MASK;	// gpgx
		//fc = ((x.OPN.fn.table[block_fnum]>>(7-blk))+x.OPN.ST.dt_tab[this.DT][kc]);	// vb
		this.phase +=(fc*this.rate.mul)>>1;	/* update phase */
	}
	else this.phase += this.Incr;	/* LFO phase modulation  = zero */
};
FM_CH.prototype.update_phase_lfo = function(x) {
	var pms = this.pms, block_fnum = this.block_fnum;
	var i = this.SLOT.length; while (--i>-1) this.SLOT[i].update_phase_lfo(x, pms, block_fnum);
}

/* update phase increment and envelope generator */
FM_SLOT.prototype.refresh_fc_eg = function(x, fc, kc) {
	if (this.DT<0) {
		console.log("FM_SLOT::refresh_fc_eg - invalid DT",this.DT);
		if (cfg.strict) throw new Error("FM_SLOT::refresh_fc_eg - invalid DT="+this.DT);
		else return;
	}
	if (cfg.debug>1) console.log("OPN.ST.dt_tab["+this.DT+"]["+kc+"]",x.OPN.ST.dt_tab[this.DT][kc]);
	fc += x.OPN.ST.dt_tab[this.DT][kc];	/* add detune value */
	fc &= _DT.MASK;	/* (frequency) phase overflow (credits to Nemesis) */
	this.Incr = (fc*this.rate.mul)>>1;	/* (frequency) phase increment counter */
	kc = kc>>this.KSR;	/* ksr */
	if (this.rate.ksr!==kc) {
		this.rate.ksr = kc;
		var q = (this.rate.ar+kc)|0;
		if ((q)<(32+62)) {	/* recalculate envelope generator rates */
			this.eg.sh.ar = _EG.rate_shift[q];
			this.eg.sel.ar = _EG.rate_select[q];
		}
		else {	/* verified by Nemesis on real hardware (Attack phase is blocked) */
			this.eg.sh.ar = 0;
			this.eg.sel.ar = 18*_EG.RATE_STEPS;
		}
		q = (this.rate.d1r+kc)|0;
		this.eg.sh.d1r = _EG.rate_shift[q];
		this.eg.sel.d1r = _EG.rate_select[q];
		q = (this.rate.d2r+kc)|0;
		this.eg.sh.d2r = _EG.rate_shift[q];
		this.eg.sel.d2r = _EG.rate_select[q];
		q = (this.rate.rr+kc)|0;
		this.eg.sh.rr = _EG.rate_shift[q];
		this.eg.sel.rr = _EG.rate_select[q];
	}
};
/* update phase increment counters */
FM_CH.prototype.refresh_fc_eg = function(x) {
	if (this.SLOT[_SLOT[0]].Incr===-1) {
		var fc = this.fc, kc = this.kcode;
		if (cfg.debug>1) console.log("FM_CH::refresh_fc_eg",fc,kc);
		var i = this.SLOT.length; while (--i>-1) this.SLOT[_SLOT[i]].refresh_fc_eg(x, fc, kc);
	}
};

FM_SLOT.prototype.calcVol = function(AM){return this.vol_out+(AM&this.AMmask);};

function op_calc(phase, env, pm, fb) {
	var p = (env<<3)+_YM.sin[(fb?(phase+pm)>>_SIN.BITS:(phase>>_SIN.BITS)+(pm>>1))&_SIN.MASK];	// gpgx
	//var p = (env<<3)+_YM.sin[
	//	(((phase&~_YM.FREQ_MASK)+(fb?pm:pm<<15))>>_YM.FREQ_SH)&_SIN.MASK
	//];	// vb
	if (p>=_TL.TAB_LEN) return 0;
	return _TL.tab[p];
}

FM_CH.prototype.calculate = function(x) {
	var msg = "", msg_out = (cfg.debug>1&&cfg.maxcalc>0);
	var AM = x.OPN.lfo.AM>>this.ams;
	if (this.muted) return;
	var eg_out, val;
	var i, outs = ['x','c1','m2','c2'];
	_YM.m2 = 0; _YM.c1 = 0; _YM.c2 = 0; _YM.mem = 0;
	_YM[this.mem.connect] = this.mem.value;	/* restore delayed sample (MEM) value to m2 or c2 */
	//console.log("CH::calculate",this.connect,this.mem);
	/* SLOT 1 */
	i = 0; eg_out = this.SLOT[_SLOT[i]].calcVol(AM);
	if (msg_out) msg += "[0]eg_out="+eg_out+(eg_out<_ENV.QUIET?"":"(nope)");
	if (1) {
		var out = (this.op1_out[0]+this.op1_out[1])|0;
		this.op1_out[0] = this.op1_out[1];
		val = this.op1_out[0];
		if (msg_out) msg += ";connect[0]="+this.connect[i];
		if (this.connect[i]==='x') _YM.mem = val, _YM.c1 = val, _YM.c2 = val;	/* algorithm 5  */
		else if (this.connect[i]==='out') this.out += val;
		else _YM[this.connect[i]] += val;
		if (eg_out<_ENV.QUIET) {
			if (!this.FB) out = 0;
			this.op1_out[1] = op_calc(this.SLOT[_SLOT[i]].phase, eg_out, (out<<this.FB), 1);
		}
	}
	/* SLOT 3 */
	i = 2; eg_out = this.SLOT[_SLOT[i]].calcVol(AM);
	if (msg_out) msg += "; [2]eg_out="+eg_out+(eg_out<_ENV.QUIET?"":"(nope)");
	if (eg_out<_ENV.QUIET) {
		val = op_calc(this.SLOT[_SLOT[i]].phase, eg_out, _YM[outs[i]], 0);
		if (msg_out) msg += ";connect[2]="+this.connect[i];
		if (this.connect[i]==='x') {}
		else if (this.connect[i]==='out') this.out += val;
		else _YM[this.connect[i]] += val;
	}
	/* SLOT 2 */
	i = 1; eg_out = this.SLOT[_SLOT[i]].calcVol(AM);
	if (msg_out) msg += "; [1]eg_out="+eg_out+(eg_out<_ENV.QUIET?"":"(nope)");
	if (eg_out<_ENV.QUIET) {
		val = op_calc(this.SLOT[_SLOT[i]].phase, eg_out, _YM[outs[i]], 0);
		if (msg_out) msg += ";connect[1]="+this.connect[i];
		if (this.connect[i]==='x') {}
		else if (this.connect[i]==='out') this.out += val;
		else _YM[this.connect[i]] += val;
	}
	/* SLOT 4 */
	i = 3; eg_out = this.SLOT[_SLOT[i]].calcVol(AM);
	if (msg_out) msg += "; [3]eg_out="+eg_out+(eg_out<_ENV.QUIET?"":"(nope)");
	if (eg_out<_ENV.QUIET) {
		val = op_calc(this.SLOT[_SLOT[i]].phase, eg_out, _YM[outs[i]], 0);
		if (msg_out) msg += ";connect[3]="+this.connect[i];
		if (this.connect[i]==='x') {}
		else if (this.connect[i]==='out') this.out += val;
		else _YM[this.connect[i]] += val;
	}
	this.mem.value = _YM.mem;	/* store current MEM */
	if (this.pms) {	/* update phase counters AFTER output calculations */
		if ((x.OPN.ST.mode&0xC0)>0&&this.canCSM) {	/* add support for 3 slot mode */
			this.SLOT[_SLOT[0]].update_phase_lfo(x, this.pms, x.OPN.SL3.block_fnum[1]);
			this.SLOT[_SLOT[1]].update_phase_lfo(x, this.pms, x.OPN.SL3.block_fnum[2]);
			this.SLOT[_SLOT[2]].update_phase_lfo(x, this.pms, x.OPN.SL3.block_fnum[0]);
			this.SLOT[_SLOT[3]].update_phase_lfo(x, this.pms, this.block_fnum);
		}
		else this.update_phase_lfo(x);
	}
	else {	/* no LFO phase modulation */
		this.SLOT[_SLOT[0]].phase += this.SLOT[_SLOT[0]].Incr;
		this.SLOT[_SLOT[1]].phase += this.SLOT[_SLOT[1]].Incr;
		this.SLOT[_SLOT[2]].phase += this.SLOT[_SLOT[2]].Incr;
		this.SLOT[_SLOT[3]].phase += this.SLOT[_SLOT[3]].Incr;
	}
	if (msg_out)
		msg += "; m2="+_YM.m2+";c1="+_YM.c1+";c2="+_YM.c2+";out="+this.out,
		console.log("FM_CH::calc",this.ALGO,msg),
		--cfg.maxcalc;
};

/* write a OPN mode register 0x20-0x2f */
OPN.WriteMode = function(x,r,v) {
	v = v&0xff;
	switch (r) {
		case 0x21: break;	// test mode
		case 0x22:	/* LFO FREQ (YM2608/YM2610/YM2610B/ym2612) */
			if (v&8) {	/* LFO enabled ? */
				x.OPN.lfo.timer_overflow = LFO.samples_per_step[v&7];
			}
			else {	/* hold LFO waveform in reset state */
				x.OPN.lfo.timer_overflow = 0;
				x.OPN.lfo.timer = 0;
				x.OPN.lfo.cnt = 0;
				x.OPN.lfo.AM = 126;
				x.OPN.lfo.PM = 0;
			}
			break;
		case 0x24:	/* timer A High 8*/
			x.OPN.ST.TA = (x.OPN.ST.TA&0x03)|(((v)|0)<<2);
			x.OPN.ST.TAL = (1024-x.OPN.ST.TA);
			break;
		case 0x25:	/* timer A Low 2*/
			x.OPN.ST.TA = (x.OPN.ST.TA&0x3fc)|(v&3);
			x.OPN.ST.TAL = (1024-x.OPN.ST.TA);
			break;
		case 0x26:	/* timer B */
			x.OPN.ST.TB = v;
			x.OPN.ST.TBL = (256-v);
			break;
		case 0x27:	/* mode, timer control */
			set_timers(x,v);
			break;
		case 0x28:	/* key on / off */
			var c = v&0x03; if (c===3) break;
			if (v&0x04) c += 3;	/* CH 4-6 */
			(function(ch){
				if (v&0x10) ch.keyOn(x,_SLOT[0]); else ch.keyOff(x,_SLOT[0]);
				if (v&0x20) ch.keyOn(x,_SLOT[1]); else ch.keyOff(x,_SLOT[1]);
				if (v&0x40) ch.keyOn(x,_SLOT[2]); else ch.keyOff(x,_SLOT[2]);
				if (v&0x80) ch.keyOn(x,_SLOT[3]); else ch.keyOff(x,_SLOT[3]);
			})(x.CH[c]);
			break;
	}
};

/* write a OPN register (0x30-0xff) */
OPN.WriteReg = function(x,r,v) {
	v = v&0xff;
	var c = OPN.CHAN(r),
		sl = OPN.SLOT(r);
	if (c>=3) {	/* 0xX3,0xX7,0xXB,0xXF */
		if (cfg.strict) throw new Error("OPN_Write - unsupported channel "+c+' or slot '+sl+' from {$'+r.toString(16)+',$'+v.toString(16)+'}');	// 0x?3, 0x?7, 0x?B, 0x?F
		else return;
	}
	if (r>=0x100) c += 3;
	var s = _SLOT[sl];
	switch (r&0xf0) {
		case 0x30:	/* DET , MUL */
			x.CH[c].set_det_mul(x, s, v);
			break;
		case 0x40:	/* TL */
			x.CH[c].set_tl(s, v);
			break;
		case 0x50:	/* KS, AR */
			x.CH[c].set_ar_ksr(s, v);
			break;
		case 0x60:	/* bit7 = AM ENABLE, DR */
			x.CH[c].set_dr(s, v);
			x.CH[c].SLOT[s].AMmask = (v&0x80)>0?~0:0;
			break;
		case 0x70:	/*     SR */
			x.CH[c].set_sr(s, v);
			break;
		case 0x80:	/* SL, RR */
			x.CH[c].set_sl_rr(s, v);
			break;
		case 0x90:	/* SSG-EG */
			x.CH[c].SLOT[s].ssg = v&0x0f;
			/* recalculate EG output */
			if (x.CH[c].SLOT[s].state>_EG.REL) {
				if ((x.CH[c].SLOT[s].ssg&0x08)>0&&(x.CH[c].SLOT[s].ssgn^(x.CH[c].SLOT[s].ssg&0x04))>0)
					x.CH[c].SLOT[s].vol_out = x.CH[c].SLOT[s].tl+(((0x200-x.CH[c].SLOT[s].volume)|0)&_ENV.MAX_ATT_INDEX);
				else
					x.CH[c].SLOT[s].vol_out = x.CH[c].SLOT[s].tl+((x.CH[c].SLOT[s].volume)|0);
			}
			break;
		case 0xa0:
			var fn, blk;
			switch (sl) {
				case 0:	/* 0xa0-0xa2 : FNUM1 */
					//fn = ((x.OPN.ST.fn_h&7)<<8)+v;	// old
					//blk = (x.OPN.ST.fn_h>>3)&0xff;	// old
					fn = ((x.CH[c].fn_h&7)<<8)+v;
					blk = (x.CH[c].fn_h>>3)&0xff;
					x.CH[c].kcode = (blk<<2)|OPN.fktable[fn>>7];	/* keyscale code */
					/* phase increment counter */
					x.CH[c].fc = (fn<<6)>>(7-blk);	// gpgx
					// x.CH[c].fc = x.OPN.fn.table[fn<<1]>>(7-blk);	// vb
					x.CH[c].block_fnum = (blk<<11)|fn;	/* store fnum in clear form for LFO PM calculations */
					x.CH[c].SLOT[_SLOT[0]].Incr = -1;
					if (cfg.debug>2) console.log('block_fnum=x',x.CH[c].block_fnum.toString(16),' kcode=',x.CH[c].kcode.toString(16),' fc=',x.CH[c].fc.toString(16));
					break;
				case 1:	/* 0xa4-0xa6 : FNUM2,BLK */
					//x.OPN.ST.fn_h = (v&0x3f)|0;	// old
					x.CH[c].fn_h = (v&0x3f)|0;
					break;
				case 2:	/* 0xa8-0xaa : 3CH FNUM1 */
					if (r<0x100) {
						fn = ((x.OPN.SL3.fn_h&7)<<8)+v;
						blk = x.OPN.SL3.fn_h>>3;
						x.OPN.SL3.kcode[c] = (blk<<2)|OPN.fktable[fn>>7];	/* keyscale code */
						/* phase increment counter */
						x.OPN.SL3.fc[c] = (fn<<6)>>(7-blk);	// gpgx
						//x.OPN.SL3.fc[c] = x.OPN.fn.table[fn<<1]>>(7-blk);	// vb
						x.OPN.SL3.block_fnum[c] = (blk<<11)|fn;
						x.CH[2].SLOT[_SLOT[0]].Incr = -1;
					}
					break;
				case 3:	/* 0xac-0xae : 3CH FNUM2,BLK */
					if (r<0x100) x.OPN.SL3.fn_h = v&0x3f;
					break;
			}
			break;
		case 0xb0:
			switch (sl) {
				case 0:	/* 0xb0-0xb2 : FB,ALGO */
					var fb = (v>>3)&7;
					x.CH[c].ALGO = v&7;
					x.CH[c].FB =  fb;	// gpgx
					//x.CH[c].FB =  fb?fb+6:0;	// vb
					//console.log("C[",c,']=',x.CH[c].ALGO,','+x.CH[c].FB);
					x.CH[c].setupConnection();
					break;
				case 1:	/* 0xb4-0xb6 : L , R , AMS , PMS */
					x.CH[c].pms = (v&7)<<5;	 /* b0-2 PMS */ /* CH->pms = PM depth * 32 (index in lfo_pm_table) */
					x.CH[c].ams = LFO.ams_depth_shift[(v>>4)&0x03];	/* b4-5 AMS */
					/* PAN :  b7 = L, b6 = R */
					// TODO: merge pan[] into FM_CH
					x.CH[c].pan[0] = v&0x80?_YM.bitmask:0;	// new method
					x.CH[c].pan[1] = v&0x40?_YM.bitmask:0;	// new method
					//x.OPN.pan[(c<<1)+0] = v&0x80?_YM.bitmask:0;	// old method
					//x.OPN.pan[(c<<1)+1] = v&0x40?_YM.bitmask:0;	// old method
					break;
			}
			break;
	}
};


function reset_channels(x, num) {if (num>x.CH.length) num = x.CH.length; while (--num>-1) x.CH[num].reset();}

/* prescaler set (and make time tables) */
OPN.SetPrescaler = function(x, r) {
	x.ratio = r||144;
	x.OPN.ST.scale = (x.OPN.ST.clock/x.OPN.ST.rate)/x.ratio;
	if (cfg.debug) console.log("init_timetables",x.OPN.ST.clock,x.OPN.ST.rate,x.ratio,x.OPN.ST.scale);
	// init_timetables
	var d, i, q;
	var z = x.OPN.ST.scale*(1<<(_YM.FREQ_SH-10));	// vb
	/* build DETUNE table */
	for (d=0; d<4; ++d) {
		for (i=0; i<32; ++i) {
			q = _DT.tab[(d<<5)+i];	// gpgx
			// q = _DT.tab[(d<<5)+i]*z;	// vb
			x.OPN.ST.dt_tab[d][i] = q|0;
			x.OPN.ST.dt_tab[d+4][i] = -x.OPN.ST.dt_tab[d][i];
		}
	}
	if (cfg.debug>2) console.log("init_timetables dt_tab",ym.OPN.ST.dt_tab);
	i = 4096; while (--i>-1) {x.OPN.fn.table[i] = (i*32.0*z)|0;}	// vb
	x.OPN.fn.max = (0x20000*z)|0;	// vb
	x.OPN.eg.timer_add = (x.OPN.ST.scale*(1<<_YM.EG_SH))|0;	// vb
	x.OPN.eg.timer_overflow = (3)*(1<<_YM.EG_SH);	/* EG is updated every 3 samples */	// vb
	x.OPN.lfo.timer_add = (x.OPN.ST.scale*(1<<_YM.LFO_SH))|0;	/* LFO timer increment (every samples) */	// vb
};

/* initialize generic tables */
function init_tables(ym) {
	if (cfg.debug) console.log("init_tables",ym.CH.length);
	var d, i, x;	// signed int
	var n;	// signed int
	var o, m;	// double
	var q, z;
	/* build Linear Power Table */
	var tmp = (_ENV.STEP/32.0), sh = (1<<16), rl2 = _TL.RES_LEN<<1;
	for (x=0; x<_TL.RES_LEN; ++x) {
		m = sh/Math.pow(2, (x+1)*tmp);
		//m = m|0;	// m = Math.floor(m);	// extraneous, folded into next calculation +neo
		/* we never reach (1<<16) here due to the (x+1) */
		/* result fits within 16 bits at maximum */
		//n = m|0;	/* 16 bits here */
		//n >>= 4;	/* 12 bits here */
		n = (m|0)>>4;
		if (n&1) n = (n>>1)+1;	/* round to nearest */
		else n = n>>1;
		/* 11 bits here (rounded) */
		n <<= 2;	/* 13 bits here (as in real chip) */
		z = x<<1;	/* 14 bits (with sign bit) */
		_TL.tab[z+0] = n;
		_TL.tab[z+1] = -n;
		/* one entry in the 'Power' table use the following format, xxxxxyyyyyyyys with:            */
		/*        s = sign bit                                                                      */
		/* yyyyyyyy = 8-bits decimal part (0-TL_RES_LEN)                                            */
		/* xxxxx    = 5-bits integer 'shift' value (0-31) but, since Power table output is 13 bits, */
		/*            any value above 13 (included) would be discarded.                             */
		for (i=1; i<13; ++i) {
			q = (z+0+i*rl2)|0;
			_TL.tab[q] = _TL.tab[z]>>i;
			_TL.tab[q+1] = -_TL.tab[q];
		}
	}
	//console.log("TL_TABLE",_TL.tab.join(", "));
	/* build Logarithmic Sinus table */
	q = Math.PI/_SIN.LEN, z = 8.0/Math.log(2.0), tmp = 2.0*4/_ENV.STEP; for (i=0; i<_SIN.LEN; ++i) {	/* non-standard sinus */
		m = Math.sin(((i<<1)+1.0)*q);	/* checked against the real chip */
		/* we never reach zero here due to ((i*2)+1) */
		/* convert to 'decibels' */
		if (m>0.0) o = Math.log(1.0/m)*z;
		else o = Math.log(-1.0/m)*z;
		//o = o/(_ENV.STEP/4);	// folded into next calculation +neo
		n = (o*tmp)|0; //n = (2.0*o)|0;
		if (n&1) n = (n>>1)+1;	/* round to nearest */
		else n = n>>1;
		_YM.sin[i] = (n<<1)+(m>=0.0?0:1);	/* 13-bits (8.5) value is formatted for above 'Power' table */
	}
	//console.log("SIN_TAB",_YM.sin.join(", "));
	/* build LFO PM modulation table */
	for (i=0; i<8; ++i) {	/* 8 PM depths */
		for (n=0; n<128; ++n) {	/* 7 bits meaningful of F-NUMBER */
			for (x=0; x<8; ++x) {
				z = 0;
				for (o=0; o<7; ++o) {	/* 7 bits */
					if ((n&(1<<o))>0) {	/* only if bit "bit_tmp" is set */
						z += LFO.pm_output[(o<<3)+i][x];
					}
				}
				/* 32 steps for LFO PM (sinus) */
				d = (n<<8)+(i<<5);	// fnum*32*8 + i*32
				LFO.pm_table[d+x+0] = z;
				LFO.pm_table[d+(x^7)+8] = z;
				LFO.pm_table[d+x+16] = -z;
				LFO.pm_table[d+(x^7)+24] = -z;
			}
		}
	}
}

/**** END FM DEFS ****/

/**** YM2612 API based on genplus-gx ****/

/* initialize ym2612 emulator */
Y.prototype.init = function(clock,rate) {
	if (cfg.debug) console.log("OPN::init("+clock+','+rate+")");
	if (!this.chip) this.chip = new YMX(clock, rate);
	else this.chip.ST.clock = clock||7670448, this.chip.ST.rate = rate||44100;
	this.ratio = 144;	/* chip is running a VCLK / 144 = MCLK / 7 / 144 */
	this.start = 0;
	this.count = 0;
	init_tables(this.chip);
};
/* reset OPN registers */
Y.prototype.reset = function() {
	if (cfg.debug) console.log("OPN::reset");
	(function(x){
		var i;
		OPN.SetPrescaler(x, 144);	/* chip is running a VCLK / 144 = MCLK / 7 / 144 */
		x.OPN.eg.timer = 0;
		x.OPN.eg.cnt = 0;
		x.OPN.lfo.timer_overflow = 0;
		x.OPN.lfo.timer = 0;
		x.OPN.lfo.cnt = 0;
		x.OPN.lfo.AM = 126;
		x.OPN.lfo.PM = 0;
		x.OPN.ST.TAC = 0;
		x.OPN.ST.TBC = 0;
		x.OPN.SL3.key_csm = 0;
		x.dacen = 0;
		x.dacout = 0;
		set_timers(x, 0x30);
		x.OPN.ST.TB = 0;
		x.OPN.ST.TBL = 256<<4;
		x.OPN.ST.TA = 0;
		x.OPN.ST.TAL = 1024;
		reset_channels(x, 6);
		//for (i=0; i<6; ++i) {if (i!=0) x.CH[i].muted = 1;}
		i = 0xb6; while (i>=0xb4) {
			if ((i&3)!==3)
				OPN.WriteReg(x, i, 0xc0),
				OPN.WriteReg(x, i|0x100, 0xc0);
			--i;
		}
		i = 0xb2; while (i>=30) {
			if ((i&3)!==3)
				OPN.WriteReg(x, i, 0),
				OPN.WriteReg(x, i|0x100, 0);
			--i;
		}
	})(this.chip);
	this.start = 0;
	this.count = 0;
};
/* ym2612 write */
Y.prototype.write = function(a,v) {
	if (cfg.debug>1) console.log("OPN::write",a.toString(16),v.toString(16));
	v &= 0xff;	/* adjust to 8 bit bus */
	this.chip.OPN.ST.address = a&0x1ff;
	//switch (a) {
	//	case 0:	/* address port 0 */
	//		this.chip.OPN.ST.address = v;
	//		break;
	//	case 2:	/* address port 1 */
	//		this.chip.OPN.ST.address = v|0x100;
	//		break;
	//	default:	/* data port */
			var addr = this.chip.OPN.ST.address;	/* verified by Nemesis on real YM2612 */
			switch (addr&0x1f0) {
				case 0x20:	/* 0x20-0x2f Mode */
					switch (addr) {
						case 0x2a:	/* DAC data (ym2612) */
							this.chip.dacout = ((v-0x80)|0)<<6;	/* convert to 14-bit output */
							break;
						case 0x2b:	/* DAC Sel  (ym2612) */
							this.chip.dacen = !!(v&0x80);	/* b7 = dac enable */
							break;
						default:	/* OPN section */
							OPN.WriteMode(this.chip, addr, v);	/* write register */
							break;
					}
					break;
				default:	/* 0x30-0xff OPN section */
					OPN.WriteReg(this.chip, addr, v);	/* write register */
					break;
			}
			//break;
	//}
};
Y.prototype.read = function(x){return this.chip.OPN.ST.status&0xff;};

/* Generate samples for ym2612 */
Y.prototype.update = function(len) {
	//// update length is given in samples
	//// but needs to calculate in chip cycles,
	//// adjust afterwards +neo
	var num = len*this.ratio;	// num cycles
	if(cfg.debug) console.log("==== YM::update","samples="+len,"cycles="+num);
	var buf = [[],[]], j, lt, rt;
	var is_csm = !!(this.chip.OPN.ST.mode&0xc0), dis_csm;
	var i = -1; while (++i<this.chip.CH.length) {
		if (!is_csm) this.chip.CH[i].refresh_fc_eg(this.chip);
		else if (this.chip.CH[i].canCSM) {	/* 3SLOT MODE (operator order is 0,1,3,2) */
			if (this.chip.CH[i].SLOT[_SLOT[0]].Incr===-1) {
				this.chip.CH[i].SLOT[_SLOT[0]].refresh_fc_eg(this.chip, this.chip.OPN.SL3.fc[1], this.chip.OPN.SL3.kcode[1]);
				this.chip.CH[i].SLOT[_SLOT[1]].refresh_fc_eg(this.chip, this.chip.OPN.SL3.fc[2], this.chip.OPN.SL3.kcode[2]);
				this.chip.CH[i].SLOT[_SLOT[2]].refresh_fc_eg(this.chip, this.chip.OPN.SL3.fc[0], this.chip.OPN.SL3.kcode[0]);
				this.chip.CH[i].SLOT[_SLOT[3]].refresh_fc_eg(this.chip, this.chip.CH[i].fc, this.chip.CH[i].kcode);
			}
		}
	}
	//var msg = [];
	//var z = 1.0*this.chip.OPN.ST.scale, q = (len*z+0.5)|0;//(len*this.chip.OPN.ST.scale+0.5)|0;	// len;
	cfg.debugArr.length = 0;
	/* buffering */
	i = -1; while (++i<len) {
		lt = 0, rt = 0; dis_csm = !!(this.chip.OPN.SL3.key_csm&2);
		j = this.chip.CH.length; while (--j>-1) {
			//if (j===0&&i<10) cfg.maxcalc = 10;
			//else cfg.maxcalc = 0;
			this.chip.CH[j].out = 0;	/* clear outputs */
			this.chip.CH[j].update_ssg_eg();	/* update SSG-EG output */
			if (this.chip.dacen&&this.chip.CH[j].canDAC) this.chip.CH[j].out += this.chip.dacout;	/* DAC Mode */
			else this.chip.CH[j].calculate(this.chip);	/* calculate FM */
			if (j===0&&(--cfg.debugLocal>0)) cfg.debugArr[cfg.debugArr.length] = this.chip.CH[j].out;
			/* 14-bit accumulator channels outputs (range is -8192;+8192) */
			if (this.chip.CH[j].out>8192) this.chip.CH[j].out = 8192;
			else if (this.chip.CH[j].out<-8192) this.chip.CH[j].out = -8192;
			/* stereo DAC channels outputs mixing  */
			//if (j===0) msg[i] = (this.chip.CH[j].out&this.chip.OPN.pan[(j<<1)+0]);
			//lt += this.chip.CH[j].out&this.chip.OPN.pan[(j<<1)+0];	// old method
			//rt += this.chip.CH[j].out&this.chip.OPN.pan[(j<<1)+1];	// old method
			if (!this.chip.CH[j].muted)	// new method
				lt += (this.chip.CH[j].out&this.chip.CH[j].pan[0])|0,
				rt += (this.chip.CH[j].out&this.chip.CH[j].pan[1])|0;
			if (dis_csm&&this.chip.CH[j].canCSM) {	/* CSM Mode Key ON still disabled */
				/* CSM Mode Key OFF (verified by Nemesis on real hardware) */
				this.chip.CH[j].keyOffCSM(this.chip, _SLOT[0]);
				this.chip.CH[j].keyOffCSM(this.chip, _SLOT[1]);
				this.chip.CH[j].keyOffCSM(this.chip, _SLOT[2]);
				this.chip.CH[j].keyOffCSM(this.chip, _SLOT[3]);
			}
		}
		/* advance LFO */
		advance_lfo(this.chip);
		/* advance envelope generator */
		++this.chip.OPN.eg.timer;	// gpgx
		//this.chip.OPN.eg.timer += this.chip.OPN.eg.timer_add;	// vb
		/* EG is updated every 3 samples */
		if (this.chip.OPN.eg.timer>=3) {	// gpgx
		//if (this.chip.OPN.eg.timer>=this.chip.OPN.eg.timer_overflow) {	// vb
			this.chip.OPN.eg.timer = 0;	// gpgx
			//this.chip.OPN.eg.timer -= this.chip.OPN.eg.timer_overflow;	// vb
			++this.chip.OPN.eg.cnt;
			advance_eg_channels(this.chip, this.chip.OPN.eg.cnt);
		}
		/* buffering */
		buf[0][i] = lt;
		buf[1][i] = rt;
		/* CSM mode: if CSM Key ON has occured, CSM Key OFF need to be sent       */
		/* only if Timer A does not overflow again (i.e CSM Key ON not set again) */
		this.chip.OPN.SL3.key_csm <<= 1;
		INTERNAL_TIMER_A(this.chip);	/* timer A control */
		if (dis_csm) {	/* CSM Mode Key ON still disabled */
			this.chip.OPN.SL3.key_csm = 0;	/* CSM Mode Key OFF (verified by Nemesis on real hardware) */
		}
	}
	/* timer B control */
	INTERNAL_TIMER_B(this.chip, len);
	//if (cfg.debug>1) console.log("YM::update",msg);
	//// post-update adjustments +neo
	//this.count += num;
	//var time = this.start;	/* FM frame initial timestamp */
	//var out = [[],[]];
	//i = 0; j = 0;
	//do {
	//	out[0][i] = buf[0][j|0];	/* left channel */
	//	out[1][i] = buf[1][j|0];	/* right channel */
	//	j += (z), ++i;
		//time += this.ratio, ++i;	/* increment time counter */
	//} while (i<len);
	//this.count = time-num, this.start = time-num;
	//this.count = this.start = this.count-num;
	if (cfg.debugLocal) console.log(cfg.debugArr.join(", "));
	return buf;
};
/* DAC precision (normally 9-bit on real hardware, implemented through simple 14-bit channel output bitmasking) */
Y.prototype.config = function(bits) {
	_YM.bitmask = ~((1<<(_TL.BITS-bits))-1);
	/* update L/R panning bitmasks */
	/*var i = -1; while (++i<12) {	// 2out*6ch, ORIGINAL METHOD
		if (this.chip.OPN.pan[i]) this.chip.OPN.pan[i] = _YM.bitmask;
	}*/
	var i = this.chip.CH.length; while (--i>-1) {	// 6ch*2out, NEW PER-CHANNEL PAN
		if (this.chip.CH[i].pan[0]) this.chip.CH[i].pan[0] = _YM.bitmask;
		if (this.chip.CH[i].pan[1]) this.chip.CH[i].pan[1] = _YM.bitmask;
	}
};

Y.prototype.load = function(state){};
Y.prototype.save = function(state){};
})(YM2612);
