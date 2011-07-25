function YM2612() {
	if (!this instanceof YM2612) return new YM2612();
	//this.init = function(c,r){};
	//this.reset = function(){};
	//this.update = function(b, l){};
	//this.write = function(a, v){};
	//this.read = function(){};
	//this.getContext = function(){};
	//this.getContextSize = function(){};
	//this.restore = function(b){};
	//this.load = function(s){};
	//this.save = function(s){};
}
var config = {hq_fm:0, dac_bits:8, debug:0};

(function(){
var YM = {};
YM.FREQ_SH = 16;
YM.EG_SH = 16;
YM.LFO_SH = 24;
YM.TIMER_SH = 16;
YM.FREQ_MASK = (1<<YM.FREQ_SH)-1;
//console.log("FREQ_MASK=x"+YM.FREQ_MASK.toString(16).toUpperCase());

var ENV = {};
ENV.BITS = 10;
ENV.LEN = 1<<ENV.BITS;
ENV.STEP = 128.0/ENV.LEN;
ENV.MAX_ATT_INDEX = ENV.LEN-1;
ENV.MIN_ATT_INDEX = 0;
var EG = {};
EG.ATT = 4;
EG.DEC = 3;
EG.SUS = 2;
EG.REL = 1;
EG.OFF = 0;

YM.SIN_BITS = 10
YM.SIN_LEN = 1<<YM.SIN_BITS;
YM.SIN_MASK = YM.SIN_LEN-1;

var TL = {};
TL.RES_LEN = 256;
TL.TAB_LEN = 13*2*TL.RES_LEN;
TL.tab = new Array(TL.TAB_LEN);

ENV.QUIET = TL.TAB_LEN>>3;

/* sin waveform table in 'decibel' scale */
YM.sin = new Array(YM.SIN_LEN);

/* sustain level table (3dB per step) */
/* bit0, bit1, bit2, bit3, bit4, bit5, bit6 */
/* 1,    2,    4,    8,    16,   32,   64   (value)*/
/* 0.75, 1.5,  3,    6,    12,   24,   48   (dB)*/
/* 0 - 15: 0, 3, 6, 9,12,15,18,21,24,27,30,33,36,39,42,93 (dB)*/
/* attenuation value (10 bits) = (SL << 2) << 3 */
YM.sl = (function(){
	var SC = function(db){return db*4.0/ENV.STEP;};
	return [
		SC(0), SC(1), SC(2), SC(3), SC(4), SC(5), SC(6), SC(7),
		SC(8), SC(9), SC(10), SC(11), SC(12), SC(13), SC(14), SC(31)
	];
})();
//console.log("sl_table="+YM.sl.toString());

EG.RATE_STEPS = 8;
EG.inc = [	// 19*EG.RATE_STEPS
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
EG.rate_select = (function(){
	var O = function(a){return a*EG.RATE_STEPS;};
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
//console.log("eg_rate_select="+EG.rate_select.toString());


/*rate  0,    1,    2,   3,   4,   5,  6,  7,  8,  9, 10, 11, 12, 13, 14, 15*/
/*shift 11,   10,   9,   8,   7,   6,  5,  4,  3,  2, 1,  0,  0,  0,  0,  0 */
/*mask  2047, 1023, 511, 255, 127, 63, 31, 15, 7,  3, 1,  0,  0,  0,  0,  0 */
EG.rate_shift = (function(){
	var O = function(a){return a*1;};
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
//console.log("eg_rate_shift="+EG.rate_shift.toString());


EG.dt_tab = [	// 4*32
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
var OPN = {};
OPN.fktable = [0,0,0,0,0,0,0,1,2,3,3,3,3,3,3,3];

/* 8 LFO speed parameters */
/* each value represents number of samples that one LFO level will last for */
var LFO = {}
LFO.samples_per_step = [108, 77, 71, 67, 62, 44, 8, 5];
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
LFO.ams_depth_shift = [8,3,1,0];
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
LFO.pm_output = [	// [7*8][8]
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
];
/* all 128 LFO PM waveforms */
/* 128 combinations of 7 bits meaningful (of F-NUMBER), 8 LFO depths, 32 LFO output levels per one depth */
LFO.pm_table = new Array(128*8*32);

/* register number to channel number , slot offset */
OPN.CHAN = function(N){return N&3;};
OPN.SLOT = function(N){return (N>>2)&3;};

/* slot number */
var _SLOT = [0,2,1,3];
/* struct describing a single operator (SLOT) */
function FM_SLOT() {
	this.DT = [];	// INT32*	detune: dt_tab[DT]
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
	this.rate = new _rate();
	/* this.rate = {
		ar:0,	// UINT32	attack rate
		d1r:0,	// UINT32	decay rate
		d2r:0,	// UINT32	sustain rate
		rr:0,	// UINT32	release rate
		ksr:0,	// UINT8	key scale rate: kcode>>(3-KSR)
		mul:0	// UINT32	multiple: ML_TABLE[ML]
	}; */
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
		this.sh_ar=0;	// UINT8	attack state
		this.sel_ar=0;	// UINT8
		this.sh_d1r=0;	// UINT8	decay state
		this.sel_d1r=0;	// UINT8
		this.sh_d2r=0;	// UINT8	sustain state
		this.sel_d2r=0;	// UINT8
		this.sh_rr=0;	// UINT8	release state
		this.sel_rr=0;	// UINT8
		this.init = function(){
			this.sh_ar=0;
			this.sel_ar=0;
			this.sh_d1r=0;
			this.sel_d1r=0;
			this.sh_d2r=0;
			this.sel_d2r=0;
			this.sh_rr=0;
			this.sel_rr=0;
		};
	}
	this.eg = new _eg();
	/* this.eg = {
		sh_ar:0,	// UINT8	attack state
		sel_ar:0,	// UINT8
		sh_d1r:0,	// UINT8	decay state
		sel_d1r:0,	// UINT8
		sh_d2r:0,	// UINT8	sustain state
		sel_d2r:0,	// UINT8
		sh_rr:0,	// UINT8	release state
		sel_rr:0	// UINT8
	}; */
	this.ssg = 0;	// UINT8	ssg-eg waveform
	this.ssgn = 0;	// UINT8	ssg-eg negated output
	this.key = 0;	// UINT8	0 = last key was KEY_OFF, 1 = KEY_ON
	// lfo
	this.AMmask = 0;	// UINT32	AM enable flag
	//// SLOT METHODS
/*
	this.set_det_mul = function(v){};
	this.set_tl = function(v){};
	this.set_ar_ksr = function(v){};
	this.set_dr = function(v){};
	this.set_sr = function(v){};
	this.set_sl_rr = function(v){};
*/
	this.init = function() {
		this.KSR = 0;
		this.rate.init();
		this.phase = 0;
		this.Incr = 0;
		this.state = 0;
		this.tl = 0;
		this.volume = 0;
		this.sl = 0;
		this.vol_out = 0;
		this.eg.init();
		this.ssg = 0;
		this.ssgn = 0;
		this.key = 0;
		this.AMmask = 0;
	};
}
/* set detune & multiple */
FM_SLOT.prototype.set_det_mul = function(v) {	// FM_CH*, FM_SLOT*, int
	this.mul = (v&0x0f)?(v&0x0f)<<1:1;
	this.DT = ym2612.OPN.ST.dt_tab[(v>>4)&7];
	//console.log("mul="+this.mul+", dt="+((v>>4)&7));
	//console.log(this.DT.toString());
}
/* set total level */
FM_SLOT.prototype.set_tl = function(v) {	// FM_SLOT*. int
	this.tl = (v&0x7f)<<ENV.BITS-7;	// 7-bit tl
	// recalculate eg output
	if ((this.ssg&0x08)&&(this.ssgn^(this.ssg&0x04))&&this.state>EG.REL)
		this.vol_out = parseInt(0x200-this.volume)&ENV.MAX_ATT_INDEX+this.tl;
	else
		this.vol_out = parseInt(this.volume)+this.tl;
}
/* set attack rate & key scale  */
FM_SLOT.prototype.set_ar_ksr = function(v) {	// FM_CH*, FM_SLOT*, int
	var old_KSR = this.KSR;
	this.rate.ar = (v&0x1f)?32+((v&0x1f)<<1):0;
	this.KSR = 3-(v>>6);
	/* Even if it seems unnecessary to do it here, it could happen that KSR and KC  */
	/* but the resulted SLOT->ksr value (kc >> SLOT->KSR) remains unchanged.        */
	/* In such case, Attack Rate would not be recalculated by "refresh_fc_eg_slot". */
	/* This fixes the intro of "The Adventures of Batman & Robin" (Eke-Eke)         */
	if ((this.rate.ar+this.rate.ksr)<(32+62)) {
		this.eg.sh_ar = EG.rate_shift[this.rate.ar+this.rate.ksr];
		this.eg.sel_ar = EG.rate_select[this.rate.ar+this.rate.ksr];
	}
	else {	// attack phase is blocked
		this.eg.sh_ar = 0;
		this.eg.sel_ar = 18*EG.RATE_STEPS;
	}
	return old_KSR;
}
/* set decay rate */
FM_SLOT.prototype.set_dr = function(v) {	// FM_SLOT*, int
	this.rate.d1r = (v&0x1f)?32+((v&0x1f)<<1):0;
	this.eg.sh_d1r = EG.rate_shift[this.rate.d1r+this.rate.ksr];
	this.eg.sel_d1r = EG.rate_select[this.rate.d1r+this.rate.ksr];
}
/* set sustain rate */
FM_SLOT.prototype.set_sr = function(v) {	// FM_SLOT*, int
	this.rate.d2r = (v&0x1f)?32+((v&0x1f)<<1):0;
	this.eg.sh_d2r = EG.rate_shift[this.rate.d2r+this.rate.ksr];
	this.eg.sh_d2r = EG.rate_select[this.rate.d2r+this.rate.ksr];
}
/* set release rate */
FM_SLOT.prototype.set_sl_rr = function(v) {	// FM_SLOT*, int
	this.sl = YM.sl[v>>4];
	// check eg state changes
	if (this.state===EG.DEC&&this.volume>=this.sl) this.state = EG.SUS;
	this.rate.rr = 34+((v&0x0f)<<2);
	this.eg.sh_rr = EG.rate_shift[this.rate.rr+this.rate.ksr];
	this.eg.sel_rr = EG.rate_select[this.rate.rr+this.rate.ksr];
}
FM_SLOT.prototype.advance_eg_channel = function() {
	switch (this.state) {
		case EG.ATT:	// attack phase
			if (!(ym2612.OPN.eg.cnt&((1<<this.eg.sh_ar)-1))) {
				// update attenuation level
				this.volume += (~this.volume*EG.inc[this.eg.sel_ar+((ym2612.OPN.eg.cnt>>this.eg.sh_ar)&7)])>>4;
				// check phase transition
				if (this.volume<=ENV.MIN_ATT_INDEX) {
					this.volume = ENV.MIN_ATT_INDEX;
					this.state = this.sl===ENV.MIN_ATT_INDEX?EG.SUS:EG.DEC;	// special case where sl=0
				}
				// recalculate eg output
				if ((this.ssg&0x08)&&(this.ssgn^(this.ssg&0x04)))
					this.vol_out = (parseInt(0x200-this.volume)&ENV.MAX_ATT_INDEX)+this.tl;
				else
					this.vol_out = parseInt(this.volume)+this.tl;
				//throw new Error("state:atk - vol_out="+this.vol_out);
			}
			break;
		case EG.DEC:	// decay phase
			//throw new Error("state:dec");
			if (!(ym2612.OPN.eg.cnt&((1<<this.eg.sh_d1r)-1))) {
				if (this.ssg&0x08) {	// ssg-eg type
					// update attenuation level
					if (this.volume<0x200) {
						this.volume += 4*EG.inc[this.eg.sel_d1r+((ym2612.OPN.eg.cnt>>this.eg.sh_d1r)&7)];
						// recalculate eg output
						if (this.ssgn^(this.ssg&0x04))
							this.vol_out = (parseInt(0x200-this.volume)&ENV.MAX_ATT_INDEX)+this.tl;
						else
							this.vol_out = parseInt(this.volume)+this.tl;
					}
				}
				else {
					// update attenuation level
					this.volume += EG.inc[this.eg.sel_d1r+((ym2612.OPN.eg.cnt>>this.eg.sh_d1r)&7)];
					// recalculate eg output
					this.vol_out = parseInt(this.volume)+this.tl;
				}
				// check phase transition
				if (this.volume>=this.sl) this.state = EG.SUS;
			}
			break;
		case EG.SUS:	// sustain phase
			//throw new Error("state:sus");
			if (!(ym2612.OPN.eg.cnt&((1<<this.eg.sh_d2r)-1))) {
				if (this.ssg&0x08) {	// ssg-eg type
					// update attenuation level
					if (this.volume<0x200) {
						this.volume += 4*EG.inc[this.eg.sel_d2r+((ym2612.OPN.eg.cnt>>this.eg.sh_d2r)&7)];
						// recalculate eg output
						if (this.ssgn^(this.ssg&0x04))
							this.vol_out = (parseInt(0x200-this.volume)&ENV.MAX_ATT_INDEX)+this.tl;
						else
							this.vol_out = parseInt(this.volume)+this.tl;
					}
				}
				else {
					// update attenuation level
					this.volume += EG.inc[this.eg.sel_d2r+((ym2612.OPN.eg.cnt>>this.eg.sh_d2r)&7)];
					// check phase transition
					if (this.volume>=ENV.MAX_ATT_INDEX) this.volume = ENV.MAX_ATT_INDEX;	// do not change SLOT.state
					// recalculate eg output
					this.vol_out = parseInt(this.volume)+this.tl;
				}
			}
			break;
		case EG.REL:	// release phase
			//throw new Error("state:rel");
			if (!(ym2612.OPN.eg.cnt&((1<<this.eg.sh_rr)-1))) {
				if (this.ssg&0x08) {	// ssg-eg type
					// update attenuation level
					if (this.volume<0x200)
						this.volume += 4*EG.inc[this.eg.sel_rr+((ym2612.OPN.eg.cnt>>this.eg.sh_rr)&7)];
					// check phase transition
					if (this.volume>=0x200) {
						this.volume = ENV.MAX_ATT_INDEX;
						this.state = EG.OFF;
					}
				}
				else {
					// update attenuation level
					this.volume += EG.inc[this.eg.sel_rr+((ym2612.OPN.eg.cnt>>this.eg.sh_rr)&7)];
					// check phase transition
					if (this.volume>=ENV.MAX_ATT_INDEX) {
						this.volume = ENV.MAX_ATT_INDEX;
						this.state = EG.OFF;
					}
				}
				// recalculate eg output
				this.vol_out = parseInt(this.volume)+this.tl;
			}
			break;
	}
};
FM_SLOT.prototype.update_ssg_eg = function() {
	// detect ssg-eg transition
	// this is not required during release phase as the attenuation has been forced to MAX and output invert flag is not used
	// if an attack phase is programmed, inversion can occur on each sample
	if ((this.ssg&0x08)&&this.volume>=0x200&&this.state>EG.REL) {
		if (this.ssg&0x01) {	// bit 0 = hold ssg-eg
			if (this.ssg&0x02) this.ssgn = 4;	// set inversion flag
			// force attenuation level during decay phases
			if (this.state!==EG.ATT&&!(this.ssgn^(this.ssg&0x04)))
				this.volume = ENV.MAX_ATT_INDEX;
		}
		else {	// loop ssg-eg
			// toggle output inversion flag or reset phase generator
			if (this.ssg&0x02) this.ssgn ^= 4;
			else this.phase = 0;
			if (this.state!==EG.ATT) {	// same as KEYON
				if ((this.rate.ar+this.rate.ksr)<94)	// 32+62
					this.state = this.volume<=ENV.MIN_ATT_INDEX?(this.sl===ENV.MIN_ATT_INDEX?EG.SUS:EG.DEC):EG.ATT;
				else {
					// attack rate is maximal: directly switch to decay or sustain
					this.volume = ENV.MIN_ATT_INDEX;
					this.state = this.sl===ENV.MIN_ATT_INDEX?EG.SUS:EG.DEC;
				}
			}
		}
		// recalculate eg output
		if (this.ssgn^(this.ssg&0x04))
			this.vol_out = (parseInt(0x200-this.volume)&ENV.MAX_ATT_INDEX)+this.tl;
		else
			this.vol_out = parseInt(this.volume)+this.tl;
	}
};
FM_SLOT.prototype.update_phase_lfo = function(pms, block_fnum) {	// FM_SLOT*, INT32, UINT32 block_fnum
	var fnum_lfo = ((block_fnum&0x7f0)>>4)*32*8;	// UINT32
	var lfo_fn_table_index_offset = LFO.pm_table[fnum_lfo+pms+ym2612.OPN.lfo.PM];	// INT32
	if (lfo_fn_table_index_offset) {	// lfo phase modulation active
		block_fnum = block_fnum*2+lfo_fn_table_index_offset;
		var blk = (block_fnum&0x7000)>>12,	// BYTE
			fn = block_num&0xfff;	// UINT32
		// keyscale code
		var kc = (blk<<2)|OPN.fktable[fn>>8];	// int
		// (frequency) phase increment counter
		var fc = (ym2612.OPN.fn.table[fn]>>(7-blk))+this.DT[kc];	// int
		// (frequency) phase overflow
		if (fc<0) fc += ym2612.OPN.fn.max;
		this.phase += (fc*this.rate.mul)>>1;	// update phase
	}
	else {	// lfo phase modulation = zero
		this.phase += this.Incr;
	}
};
/* update phase increment and envelope generator */
FM_SLOT.prototype.refresh_fc_eg = function(fc, kc) {	// FM_SLOT*, int, int
	//console.log("YM2612::refresh_fc_eg_slot - fc="+fc+" kc="+kc+" mul="+this.rate.mul+" incr="+this.Incr);
	var ksr = kc>>this.KSR;	// int
	fc += this.DT[kc];
	// (frequency) phase overflow
	//console.log("YM2612::refresh_fc_eg_slot - DT="+this.DT[kc]);
	if (fc<0) fc += ym2612.OPN.fn.max;
	// (frquency) phase increment counter
	this.Incr = (fc*this.rate.mul)>>1;
	//console.log("YM2612::refresh_fc_eg_slot - fc="+fc+" kc="+kc+" mul="+this.rate.mul+" incr="+this.Incr);
	if (this.rate.ksr!==ksr) {
		this.rate.ksr = ksr;
		// recalculate env gen rates
		if ((this.rate.ar+this.rate.ksr)<(32+62)) {
			this.eg.sh_ar = EG.rate_shift[this.rate.ar+this.rate.ksr];
			this.eg.sel_ar = EG.rate_select[this.rate.ar+this.rate.ksr];
		}
		else {	// attack phase is blocked
			this.eg.sh_ar = 0;
			this.eg.sel_ar = 18*EG.RATE_STEPS;
		}
		this.eg.sh_d1r = EG.rate_shift[this.rate.d1r+this.rate.ksr];
		this.eg.sel_d1r = EG.rate_select[this.rate.d1r+this.rate.ksr];
		this.eg.sh_d2r = EG.rate_shift[this.rate.d2r+this.rate.ksr];
		this.eg.sel_d2r = EG.rate_select[this.rate.d2r+this.rate.ksr];
		this.eg.sh_rr = EG.rate_shift[this.rate.rr+this.rate.ksr];
		this.eg.sel_rr = EG.rate_select[this.rate.rr+this.rate.ksr];
	}
};
FM_SLOT.prototype.reset = function() {	// FM_CH*[]
	this.Incr = -1;
	this.key = 0;
	this.phase = 0;
	this.ssgn = 0;
	this.state = EG.OFF;
	this.volume = ENV.MAX_ATT_INDEX;
	this.vol_out = ENV.MAX_ATT_INDEX;
}
FM_SLOT.prototype.keyOn = function() {	// FM_CH*, int
	if (!this.key&&!ym2612.OPN.SL3.key_csm) {
		this.phase = 0;	// restart phase generator
		this.ssgn = 0;	// reset ssg-eg inversion flag
		if ((this.rate.ar+this.rate.ksr)<94)	// 32+62
			this.state = this.volume<=ENV.MIN_ATT_INDEX?(this.sl===ENV.MIN_ATT_INDEX?EG.SUS:EG.DEC):EG.ATT;
		else {
			this.volume = ENV.MIN_ATT_INDEX;	// force attentuation level to 0
			this.state = this.sl===ENV.MIN_ATT_INDEX?EG.SUS:EG.DEC;	// directly switch to decay or sustain
		}
		// recalculate eg output
		if ((this.ssg&0x08)&&this.ssgn^(this.ssg&0x04))
			this.vol_out = parseInt((0x200-this.volume)&ENV.MAX_ATT_INDEX)+this.tl;
		else
			this.vol_out = parseInt(this.volume+this.tl);
	}
	this.key = 1;
};
FM_SLOT.prototype.keyOff = function(s) {	// FM_CH*, int
	if (this.key&&!ym2612.OPN.SL3.key_csm) {
		if (this.state>EG.REL) {
			this.state = EG.REL;	// phase -> release
			// ssg-eg specific update
			if (this.ssg&0x08) {
				// convert eg attenuation level
				if (this.ssgn^(this.ssg&0x04)) this.volume = 0x200-this.volume;
				// force eg attenuation level
				if (this.volume>=0x200) {
					this.volume = ENV.MAX_ATT_INDEX;
					this.state = EG.OFF;
				}
				// recalculate eg output
				this.vol_out = parseInt(this.volume+this.tl);
			}
		}
	}
	this.key = 0;
};
FM_SLOT.prototype.calcVol = function(AM){return this.vol_out+(AM&this.AMmask);};




/* current chip state */
YM.m2 = 0; YM.c1 = 0; YM.c2 = 0;	// INT32	phase modulation input for ops 2,3,4
YM.mem = 0;	// INT32	one sample delay memory
YM.out_fm = [0,0,0,0,0,0,0,0];	// INT32[8]	outputs of working channels

YM.limit = function(v,m,x){if(v>x)v=x;else if(v<m)v=m;return v;};


function FM_CH(i) {
	var _id = i>0?i:-1;
	this.SLOT = [	// four slots/ops
		new FM_SLOT(),
		new FM_SLOT(),
		new FM_SLOT(),
		new FM_SLOT()
	];
	this.ALGO = 0;	// UINT8	algorithm
	this.FB = 0;	// UINT8	feedback shift
	this.op1_out = [0,0];	// INT32	op1 output for feedback (stereo)
	this.connect = [	// SLOT output pointers, formerly INT32*[4]
		['out_fm',0],	// SLOT1 output pointer
		['out_fm',0],	// SLOT2 output pointer
		['out_fm',0],	// SLOT3 output pointer
		['out_fm',0]	// SLOT4 output pointer
	];
	this.mem = {
		connect:0,	// INT32*	where to put the delayed sample (MEM)
		value:0	// INT32	delated sample (MEM) value
	};
	this.pms = 0;	// INT32	channel PMS
	this.ams = 0;	// UINT8	channel AMS
	this.fc = 0;	// UINT32	fnum,blk adjusted to sample rate
	this.kcode = 0;	// UINT8	key code
	this.block_fnum = 0;	// UINT32	current blk/fnum value for this slot
	this.init = function() {
		var i;
		i = this.SLOT.length; while (--i>-1) this.SLOT[i].init();
		this.ALGO = 0;
		this.FB = 0;
		i = this.op1_out.length; while (--i>-1) this.op1_out[i] = 0;
		i = this.connect.length; while (--i>-1) this.connect[i] = 0;
		this.pms = 0;
		this.ams = 0;
		this.fc = 0;
		this.kcode = 0;
		this.block_fnum = 0;
	};
	this.__defineGetter__("id",function(){return _id;});
/*
	this.prototype = {
		get id(){return _id;}
	}
*/
}
/* SSG-EG update process */
FM_CH.prototype.advance_eg_channel = function() {
	var i = this.SLOT.length;	// four operators per channel
	while (--i>-1) {this.SLOT[i].advance_eg_channel();}
};
/* This is actually executed before each samples */
FM_CH.prototype.update_ssg_eg = function() {	// formerly FM_SLOT*
	var i = this.SLOT.length;	// four operators per channel
	while (--i>-1) this.SLOT[i].update_ssg_eg();
};
FM_CH.prototype.update_phase_lfo = function() {	// FM_CH*
	var block_fnum = this.block_fnum;	// UINT32
	var fnum_lfo = ((block_fnum&0x7f0)>>4)*32*8;	// UINT32
	var lfo_fn_table_index_offset = LFO.pm_table[fnum_lfo+this.pms+ym2612.OPN.lfo.PM];
	if (lfo_fn_table_index_offset) {	// lfo phase modulation active
		block_fnum = block_fnum*2+lfo_fn_table_index_offset;
		var blk = (block_fnum&0x7000)>>12;	// UINT8
		var fn = block_fnum&0xfff;
		// keyscale code
		var kc = (blk<<2)|OPN.fktable[fn>>8];	// int
		// (frequency) phase increment counter
		var fc = ym2612.OPN.fn.table[fn]>>(7-blk);	// int
		// (frequency) phase overflow
		var finc;
		finc = fc+this.SLOT[_SLOT[0]].DT[kc];	// int
		if (finc<0) finc += ym2612.OPN.fn.max;
		this.SLOT[_SLOT[0]].phase += (finc*this.SLOT[_SLOT[0]].rate.mul)>>1;
		finc = fc+this.SLOT[_SLOT[1]].DT[kc];	// int
		if (finc<0) finc += ym2612.OPN.fn.max;
		this.SLOT[_SLOT[1]].phase += (finc*this.SLOT[_SLOT[1]].rate.mul)>>1;
		finc = fc+this.SLOT[_SLOT[2]].DT[kc];	// int
		if (finc<0) finc += ym2612.OPN.fn.max;
		this.SLOT[_SLOT[2]].phase += (finc*this.SLOT[_SLOT[2]].rate.mul)>>1;
		finc = fc+this.SLOT[_SLOT[3]].DT[kc];	// int
		if (finc<0) finc += ym2612.OPN.fn.max;
		this.SLOT[_SLOT[2]].phase += (finc*this.SLOT[_SLOT[2]].rate.mul)>>1;
	}
	else {	// lfo phase modulation = zero
		this.SLOT[_SLOT[0]].phase += this.SLOT[_SLOT[0]].Incr;
		this.SLOT[_SLOT[1]].phase += this.SLOT[_SLOT[1]].Incr;
		this.SLOT[_SLOT[2]].phase += this.SLOT[_SLOT[2]].Incr;
		this.SLOT[_SLOT[3]].phase += this.SLOT[_SLOT[3]].Incr;
	}
	//console.log("YM::update_phase_lfo_ch - ["+this.SLOT[_SLOT[0]].phase+","+this.SLOT[_SLOT[1]].phase+","+this.SLOT[_SLOT[2]].phase+","+this.SLOT[_SLOT[3]].phase+"]");
};

function op_calc(phase, env, pm) {	// UINT32, UINT, SINT
	var p, nm = ~YM.FREQ_MASK;	// UINT32
	var pn = (phase&nm)+(pm<<15), ps = (pn>>YM.FREQ_SH)&YM.SIN_MASK,
		es = env<<3;
	p = es+YM.sin[ps];
	//console.log("YM::op_calc ("+phase+","+env+","+pm+")="+p+"/"+TL.TAB_LEN+(p<TL.TAB_LEN?"="+TL.tab[p]:''));
	if (p>=TL.TAB_LEN) return 0;
	return TL.tab[p];
}
function op_calc1(phase, env, pm) {	// UINT32, UINT, SINT
	var p, nm = ~YM.FREQ_MASK;	// UINT32
	var pn = (phase&nm)+pm, ps = (pn>>YM.FREQ_SH)&YM.SIN_MASK,
		es = env<<3;
	//console.log(es+"+"+YM.sin[ps]+" aka SIN("+phase+"&"+(nm)+"="+(pn)+",>>"+YM.FREQ_SH+"="+((pn>>YM.FREQ_SH)&YM.SIN_MASK)+"==="+ps+")");
	p = es+YM.sin[ps];
	//console.log("YM::op_calc1 ("+phase+","+env+","+pm+")="+p+"/"+TL.TAB_LEN+(p<TL.TAB_LEN?"="+TL.tab[p]:''));
	if (p>=TL.TAB_LEN) return 0;
	return TL.tab[p];
}
FM_CH.prototype.calculate = function() {	// FM_CH*
	var AM = ym2612.OPN.lfo.AM>>this.ams;	// UINT32
	YM.m2 = YM.c1 = YM.c2 = YM.mem = 0;
	YM[this.mem.connect] = this.mem.value;	// restore delayed sample value to m2 or c2
	var eg_out = this.SLOT[_SLOT[0]].calcVol(AM);
	//console.log("YM2612::CH("+this.id+")::calc - eg_out="+eg_out);
	//if(this.id===1)console.log("YM2612::CH("+this.id+")::calc - connect=["+this.connect.toString()+"]");
	//
	var out = this.op1_out[0]+this.op1_out[1];	// INT32
	this.op1_out[0] = this.op1_out[1];
	if (this.connect[0]==='all') YM.mem = YM.c1 = YM.c2 = this.op1_out[0];	// algorithm 5
	else {
		//console.log("connect 1="+(typeof this.connect[0]));
		// other algorithms
		if ((typeof this.connect[0])!=='string')	{// LUX UPDATE FOR JS SYNTAX
			//console.log("connect 1 is an array!");
			YM[this.connect[0][0]][this.connect[0][1]] += this.op1_out[0];
			//console.log(this.connect[0].toString());
		}
		else YM[this.connect[0]] += this.op1_out[0];
		//if(this.id===1)console.log("YM::calc_ch - s"+_SLOT[0]+" connect="+YM[this.connect[0]]);
	}
	this.op1_out[1] = 0;
	if (eg_out<ENV.QUIET) {	// slot 1
		if (!this.FB) out = 0;
		this.op1_out[1] = op_calc1(this.SLOT[_SLOT[0]].phase, eg_out, out<<this.FB);
		//if(this.id===1)console.log("YM::calc_ch - s"+_SLOT[0]+"="+this.SLOT[_SLOT[0]].phase+"+"+this.SLOT[_SLOT[0]].Incr);
	}
	// slot 3
	eg_out = this.SLOT[_SLOT[2]].calcVol(AM);
	if (eg_out<ENV.QUIET) {
		//console.log("connect 3="+(typeof this.connect[2]));
		if ((typeof this.connect[2])!=='string')	{// LUX UPDATE FOR JS SYNTAX
			//console.log("connect 3 is an array!");
			YM[this.connect[2][0]][this.connect[2][1]] += op_calc(this.SLOT[_SLOT[2]].phase, eg_out, YM.m2);
			//console.log(this.connect[2].toString());
		}
		else YM[this.connect[2]] += op_calc(this.SLOT[_SLOT[2]].phase, eg_out, YM.m2);
		//if(this.id===1)console.log("YM2612::CH("+this.id+")::calc - s"+_SLOT[2]+" ("+this.connect[2]+")="+op_calc(this.SLOT[_SLOT[2]].phase, eg_out, YM.m2));
		//if(this.id===1)console.log("YM::calc_ch - s"+_SLOT[2]+" connect="+YM[this.connect[2]]);
	}
	// slot 2
	eg_out = this.SLOT[_SLOT[1]].calcVol(AM);
	if (eg_out<ENV.QUIET) {
		//console.log("connect 2="+(typeof this.connect[1]));
		if ((typeof this.connect[1])!=='string')	{// LUX UPDATE FOR JS SYNTAX
			//console.log("connect 2 is an array!");
			YM[this.connect[1][0]][this.connect[1][1]] += op_calc(this.SLOT[_SLOT[1]].phase, eg_out, YM.c1);
			//console.log(this.connect[1].toString());
		}
		else YM[this.connect[1]] += op_calc(this.SLOT[_SLOT[1]].phase, eg_out, YM.c1);
		//if(this.id===1)console.log("YM::calc_ch - s"+_SLOT[1]+" connect="+YM[this.connect[1]]);
	}
	// slot 4
	eg_out = this.SLOT[_SLOT[3]].calcVol(AM);
	if (eg_out<ENV.QUIET) {
		//console.log("connect 4="+(typeof this.connect[3]));
		if ((typeof this.connect[3])!=='string') {	// LUX UPDATE FOR JS SYNTAX
			//console.log("connect 4 is an array!");
			YM[this.connect[3][0]][this.connect[3][1]] += op_calc(this.SLOT[_SLOT[3]].phase, eg_out, YM.c2);
			//console.log(this.connect[3].toString());
		}
		else YM[this.connect[3]] += op_calc(this.SLOT[_SLOT[3]].phase, eg_out, YM.c2);
		//if(this.id===1)console.log("YM::calc_ch - s"+_SLOT[3]+" connect="+YM[this.connect[3][0]][2]);
	}
	this.mem.value = YM.mem;	// store current mem
	if (this.pms) {	// update phase counters AFTER output calculations
		// add support for 3 slot mode
		if ((ym2612.OPN.ST.mode&0xc0)&&this.id===3) {
			this.SLOT[_SLOT[0]].update_phase_lfo(this.pms, ym2612.OPN.SL3.block_fnum[1]);
			this.SLOT[_SLOT[1]].update_phase_lfo(this.pms, ym2612.OPN.SL3.block_fnum[2]);
			this.SLOT[_SLOT[2]].update_phase_lfo(this.pms, ym2612.OPN.SL3.block_fnum[0]);
			this.SLOT[_SLOT[3]].update_phase_lfo(this.pms, this.block_fnum);
		}
		else this.update_phase_lfo();
	}
	else {	// no lfo phase modulation
		this.SLOT[_SLOT[0]].phase += this.SLOT[_SLOT[0]].Incr;
		this.SLOT[_SLOT[1]].phase += this.SLOT[_SLOT[1]].Incr;
		this.SLOT[_SLOT[2]].phase += this.SLOT[_SLOT[2]].Incr;
		this.SLOT[_SLOT[3]].phase += this.SLOT[_SLOT[3]].Incr;
	}
	//if(this.id===1)console.log("YM2612::CH("+this.id+")::calc - ["+this.SLOT[_SLOT[0]].phase+":"+this.SLOT[_SLOT[0]].Incr+","+this.SLOT[_SLOT[1]].phase+":"+this.SLOT[_SLOT[1]].Incr+","+this.SLOT[_SLOT[2]].phase+":"+this.SLOT[_SLOT[2]].Incr+","+this.SLOT[_SLOT[3]].phase+":"+this.SLOT[_SLOT[3]].Incr+"]");
	//if(this.id===1)console.log("YM2612::CH("+this.id+")::calc - mem="+YM.mem+", c1="+YM.c1+", c2="+YM.c2+", m2="+YM.m2);
};
/* update phase increment counters */
FM_CH.prototype.refresh_fc_eg = function() {	// FM_CH*
	if (this.SLOT[_SLOT[0]].Incr===-1) {
		var fc = this.fc,	// int
			kc = this.kcode;	// int
		this.SLOT[_SLOT[0]].refresh_fc_eg(fc,kc);
		this.SLOT[_SLOT[1]].refresh_fc_eg(fc,kc);
		this.SLOT[_SLOT[2]].refresh_fc_eg(fc,kc);
		this.SLOT[_SLOT[3]].refresh_fc_eg(fc,kc);
	}
};
/* set detune & multiple */
FM_CH.prototype.set_det_mul = function(s, v) {	// FM_CH*, FM_SLOT*, int
	//console.log("YM::set_det_mul_ch - writing dt/mul "+s);
	this.SLOT[s].set_det_mul(v);
	this.SLOT[_SLOT[0]].Incr = -1;
}
/* set attack rate & key scale  */
FM_CH.prototype.set_ar_ksr = function(s, v) {	// FM_CH*, FM_SLOT*, int
	var old_KSR = this.SLOT[s].set_ar_ksr(v);
	if (this.SLOT[s].KSR!==old_KSR) this.SLOT[_SLOT[0]].Incr = -1;
}
FM_CH.prototype.reset = function() {	// FM_CH*[]
	this.mem.value = 0;
	this.op1_out[0] = 0;
	this.op1_out[1] = 0;
	s = -1; while (++s<4) this.SLOT[s].reset();
}
/****
SETUP ALGORITHM NOTES
Normally the slots' connections would be pointers to the final output ops,
but since JS is weird about passing by reference the connections instead are
assigned the property of the YM object they will modulate, with the carrier
being a special case (an array ['out_fm', the channel index to affect]).
For algorithm 5, 'all' will indicate the intent to modulate C1, M2, and C2.
~lux
****/
/* set algorithm connection */
FM_CH.prototype.setup_connection = function(ch) {	// FM_CH*, int
	//var carrier = YM.out_fm[ch];	// INT32*	the active channel
	//var om1 = CH.connect[0],	// INT32**	modulator 1 path
	//	om2 = CH.connect[2],	// INT32**	modulator 2 path
	//	oc1 = CH.connect[1];	// INT32**	carrier 1 path
	//var memc = CH.mem.connect;	// INT32**	delayed sample memory
	switch (this.ALGO) {
		case 0:
			/* M1---C1---MEM---M2---C2---OUT */
			this.connect[0] = 'c1';
			this.connect[1] = 'mem';
			this.connect[2] = 'c2';
			this.mem.connect = 'm2';
			break;
		case 1:
			/* M1------+-MEM---M2---C2---OUT */
			/*      C1-+                     */
			this.connect[0] = 'mem';
			this.connect[1] = 'mem';
			this.connect[2] = 'c2';
			this.mem.connect = 'm2';
			break;
		case 2:
			/* M1-----------------+-C2---OUT */
			/*      C1---MEM---M2-+          */
			this.connect[0] = 'c2';
			this.connect[1] = 'mem';
			this.connect[2] = 'c2';
			this.mem.connect = 'm2';
			break;
		case 3:
			/* M1---C1---MEM------+-C2---OUT */
			/*                 M2-+          */
			this.connect[0] = 'c1';
			this.connect[1] = 'mem';
			this.connect[2] = 'c2';
			this.mem.connect = 'c2';
			break;
		case 4:
			/* M1---C1-+-OUT */
			/* M2---C2-+     */
			/* MEM: not used */
			this.connect[0] = 'c1';
			this.connect[1] = ['out_fm',ch];
			this.connect[2] = 'c2';
			this.mem.connect = 'mem';	// unused
			break;
		case 5:
			/*    +----C1----+     */
			/* M1-+-MEM---M2-+-OUT */
			/*    +----C2----+     */
			this.connect[0] = 'all';	// special mark
			this.connect[1] = ['out_fm',ch];
			this.connect[2] = ['out_fm',ch];
			this.mem.connect = 'm2';
			break;
		case 6:
			/* M1---C1-+     */
			/*      M2-+-OUT */
			/*      C2-+     */
			/* MEM: not used */
			this.connect[0] = 'c1';
			this.connect[1] = ['out_fm',ch];
			this.connect[2] = ['out_fm',ch];
			this.mem.connect = 'mem';	// unused
			break;
		case 7:
			/* M1-+     */
			/* C1-+-OUT */
			/* M2-+     */
			/* C2-+     */
			/* MEM: not used*/
			this.connect[0] = ['out_fm',ch];
			this.connect[1] = ['out_fm',ch];
			this.connect[2] = ['out_fm',ch];
			this.mem.connect = 'mem';	// unused
			break;
	}
	this.connect[3] = ['out_fm',ch];
}



function FM_ST() {
	this.clock = 0.0;	// DOUBLE	master clock (Hz)
	this.rate = 0;	// UINT32	sampling rate (Hz)
	this.address = 0;	// UINT16	address register
	this.status = 0;	// UINT8	status flag
	this.mode = 0;	// UINT32	CSM/3SLOT mode
	this.fn_h = 0;	// UINT8	freq latch
	this.TimerBase = 0;	// INT32	timer base time
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
	this.init = function() {
		this.clock = 0.0;
		this.rate = 0;
		this.address = 0;
		this.status = 0;
		this.mode = 0;
		this.fn_h = 0;
		this.TimerBase = 0;
		this.TA = 0;
		this.TAL = 0;
		this.TAC = 0;
		this.TB = 0;
		this.TBL = 0;
		this.TBC = 0;
		var j, i = this.dt_tab.length; while (--i>-1) {
			j = this.dt_tab[i].length; while (--j>-1) this.dt_tab[i][j] = 0;
		}
	};
}

/* OPN 3slot struct */
function FM_3SLOT() {
	this.fc = [0,0,0];	// UINT32[3]	fnum3,blk3 calculated
	this.fn_h = 0;	// UINT8	freq3 latch
	this.kcode = [0,0,0];	// UINT8[3]	key code
	this.block_fnum = [0,0,0];	// UINT32[3]	current fnum value for this slot
	this.key_csm = 0;	// UINT8	CSM mode KEY_ON flag
	this.init = function() {
		var i;
		i = this.fc.length; while (--i>-1) this.fc[i] = 0;
		this.fn_h = 0;
		i = this.kcode.length; while (--i>-1) this.kcode[i] = 0;
		i = this.block_fnum.length; while (--i>-1) this.block_fnum[i] = 0;
		this.key_csm = 0;
	};
}

/* OPN/A/B common state */
function FM_OPN() {
	this.ST = new FM_ST;	// general state
	this.SL3 = new FM_3SLOT;	// 3slot mode state
	this.pan = new Array(6*2);	// UINT[6*2]	fm channels output masks (0xffffffff = enable)
	function _timer() {
		this.cnt = 0;
		this.timer = 0;
		this.timer_add = 0;
		this.timer_overflow = 0;
		this.init = function() {
			this.cnt = 0;	// current phase counter (UINT32 for eg, UINT8 for lfo)
			this.timer = 0;	// UINT32
			this.timer_add = 0;	// UINT32	step of timer
			this.timer_overflow = 0;	// UINT32	timer overflows every N samples
		};
	}
	this.eg = new _timer();
	/* this.eg = {
		cnt:0,	// UINT32	global env gen counter
		timer:0,	// UINT32	global env gen counter works at freq = chipclock/144/3
		timer_add:0,	// UINT32	step of eg_timer
		timer_overflow:0	// UINT32	env gen timer overflows every 3 samples (on real chip)
	}; */
	/* there are 2048 FNUMs that can be generated using FNUM/BLK registers
		but LFO works with one more bit of a precision so we really need 4096 elements */
	this.fn = {
		table:new Array(4096),	// UINT32[4096]	fnumber->increment counter
		max:0	// UINT32	max increment (required for calculating phase overflow)
	};
	// lfo
	this.lfo = new _timer();
	this.lfo.AM = 0;
	this.lfo.PM = 0;
	/* this.lfo = {
		cnt:0,	// UINT8	current lfo phase (out of 128)
		timer:0,	// UINT32	current lfo phase runs at lfo freq
		timer_add:0,	// UINT32	step of lfo_timer
		timer_overflow:0,	// UINT32	lfo timer overflows every N samples (depends on lfo freq)
		AM:0,	// UINT32	current lfo AM step
		PM:0	// UINT32	current lfo PM step
	}; */
	this.init = function() {
		this.ST.init();
		this.SL3.init();
		var i = this.pan.length; while (--i>-1) this.pan[i] = 0;
		this.eg.init();
		this.lfo.init();
		this.lfo.AM = 0;
		this.lfo.PM = 0;
	};
}

/***********************************************************/
/* YM2612 chip                                             */
/***********************************************************/
/* emulated chip */
ym2612 = (function(){
	var o = {};
	o.CH = [	// FM_CH[6]	channel state
		new FM_CH(1),
		new FM_CH(2),
		new FM_CH(3),
		new FM_CH(4),
		new FM_CH(5),
		new FM_CH(6)
	];
	//throw new Error("new ym2612 - "+o.CH[0].id);
	o.dacen = 0;	// UINT8	dac mode
	o.dacout = 0;	// INT32	dac output
	o.OPN = new FM_OPN();
	o.init = function() {
		var i = o.CH.length; while (--i>-1) o.CH[i].init();
		o.dacen = 0;
		o.dacout = 0;
		o.OPN.init();
	};
	return o;
})();


function FM_KEYON_CSM(CH,s) {	// FM_CH*, int
	if (s<0||s>=CH.SLOT.length) throw new RangeError("FM_KEYON_CSM - out of range");
	if (!CH.SLOT[s].key&&!ym2612.OPN.SL3.key_csm) {
		// restart phase generator
		CH.SLOT[s].phase = 0;
		// reset ssg-eg inversion flag
		CH.SLOT[s].ssgn = 0;
		if ((CH.SLOT[s].rate.ar+CH.SLOT[s].rate.ksr)<94)
			CH.SLOT[s].state = CH.SLOT[s].volum<=ENV.MIN_ATT_INDEX?(CH.SLOT[s].sl===ENV.MIN_ATT_INDEX?EG.SUS:EG.DEC):EG.ATT;
		else {
			CH.SLOT[s].volume = ENV.MIN_ATT_INDEX;	// force attenuation level to 0
			CH.SLOT[s].state = CH.SLOT[s].sl===ENV.MIN_ATT_INDEX?EG.SUS:EG.DEC;	// directly switch to decay or sustain
		}
		// recalculate eg output
		if ((CH.SLOT[s].ssg&0x08)&&CH.SLOT[s].ssgn^(CH.SLOT[s].ssg&0x04))
			CH.SLOT[s].vol_out = parseInt((0x200-CH.SLOT[s].volume)&ENV.MAX_ATT_INDEX)+CH.SLOT[s].tl;
		else
			CH.SLOT[s].vol_out = parseInt(CH.SLOT[s].volume+CH.SLOT[s].tl);
	}
}

function FM_KEYOFF_CSM(CH,s) {	// FM_CH*, int
	if (s<0||s>=CH.SLOT.length) throw new RangeError("FM_KEYOFF_CSM - out of range");
	if (!CH.SLOT[s].key) {
		if (CH.SLOT[s].state>EG.REL) {
			CH.SLOT[s].state = EG.REL;	// phase -> release
			// ssg-eg specific update
			if (CH.SLOT[s].ssg&0x08) {
				// convert eg attenuation level
				if (CH.SLOT[s].ssgn^(CH.SLOT[s].ssg&0x04)) CH.SLOT[s].volume = 0x200 - CH.SLOT[s].volume;
				// force eg attenuation level
				if (CH.SLOT[s].volume>=0x200) {
					CH.SLOT[s].volume = ENV.MAX_ATT_INDEX;
					CH.SLOT[s].state = EG.OFF;
				}
				// recalculate eg output
				CH.SLOT[s].vol_out = parseInt(SLOT.volume+SLOT.tl);
			}
		}
	}
}

/* CSM Key Controll */
function CSMKeyControl(CH) {	// FM_CH*
	// all key on
	FM_KEYON_CSM(CH,_SLOT[0]);
	FM_KEYON_CSM(CH,_SLOT[1]);
	FM_KEYON_CSM(CH,_SLOT[2]);
	FM_KEYON_CSM(CH,_SLOT[3]);
	ym2612.OPN.SL3.key_csm = 1;
}

function INTERNAL_TIMER_A() {
	if (ym2612.OPN.ST.mode&0x01) {
		if ((ym2612.OPN.ST.TAC-=ym2612.OPN.ST.TimerBase)<=0) {
			// set status (if enabled)
			if (ym2612.OPN.ST.mode&0x04) ym2612.OPN.ST.status |= 0x01;
			// reload the counter
			if (ym2612.OPN.ST.TAL) ym2612.OPN.ST.TAC += ym2612.OPN.ST.TAL;
			else ym2612.OPN.ST.TAC = ym2612.OPN.ST.TAL;
			// csm mode auto keyon
			if ((ym2612.OPN.ST.mode&0xc0)===0x80) CSMKeyControl(ym2612.CH[2]);
		}
	}
}

function INTERNAL_TIMER_B(step) {	// int
	if (ym2612.OPN.ST.mode&0x02) {
		if ((ym2612.OPN.ST.TBC-=(ym2612.OPN.ST.TimerBase*step))<=0) {
			// set status (if enabled)
			if (ym2612.OPN.ST.mode&0x08) ym2612.OPN.ST.status |= 0x02;
			// reload the counter
			if (ym2612.OPN.ST.TBL) ym2612.OPN.ST.TBC += ym2612.OPN.ST.TBL;
			else ym2612.OPN.ST.TBC = ym2612.OPN.ST.TBL;
		}
	}
}

/* OPN Mode Register Write */
function set_timers(v) {	// int
	/* b7 = CSM MODE */
	/* b6 = 3 slot mode */
	/* b5 = reset b */
	/* b4 = reset a */
	/* b3 = timer enable b */
	/* b2 = timer enable a */
	/* b1 = load b */
	/* b0 = load a */
	if ((ym2612.OPN.ST.mode^v)&0xc0) {
		// phase increment need to be recalculated
		ym2612.CH[2].SLOT[_SLOT[0]].Incr = -1;
		// csm mode disabled and csm keyon active
		if (((v&0xc0)!==0x80)&&ym2612.OPN.SL3.key_csm) {
			// csm mode keyoff
			FM_KEYOFF_CSM(ym2612.CH[2]._SLOT[0]);
			FM_KEYOFF_CSM(ym2612.CH[2]._SLOT[1]);
			FM_KEYOFF_CSM(ym2612.CH[2]._SLOT[2]);
			FM_KEYOFF_CSM(ym2612.CH[2]._SLOT[3]);
			ym2612.OPN.SL3.key_csm = 0;
		}
	}
	// reload timers
	if ((v&1)&&!(ym2612.OPN.ST.mode&1)) ym2612.OPN.ST.TAC = ym2612.OPN.ST.TAL;
	if ((v&2)&&!(ym2612.OPN.ST.mode&2)) ym2612.OPN.ST.TBC = ym2612.OPN.ST.TBL;
	// reset timers flags
	ym2612.OPN.ST.status &= ~v>>4;
	ym2612.OPN.ST.mode = v;
}

/* advance LFO to next sample */
ym2612.OPN.advance_lfo = function() {
	if (this.lfo.timer_overflow) {	// is lfo enabled?
		// increment lfo timer
		this.lfo.timer += this.lfo.timer_add;
		// when lfo is enabled, one level will last for 108, 77, 71, 67, 62, 44, 8 or 5 samples
		while (this.lfo.timer>=this.lfo.timer_overflow) {
			this.lfo.timer -= this.lfo.timer_overflow;
			// there are 128 lfo steps
			this.lfo.cnt = (this.lfo.cnt+1)&127;
			// triangle
			// AM: 0 to 126 step +2, 126 to 0 step -2
			if (this.lfo.cnt<64) this.lfo.AM = this.lfo.cnt*2;
			else this.lfo.AM = 126-((this.lfo.cnt&63)*2);
			// PM works w/4 times slower clock
			this.lfo.PM = this.lfo.cnt>>2;
		}
	}
}


/* write a OPN mode register 0x20-0x2f */
OPN.WriteMode = function(r,v){	// int, int
	switch (r) {
		case 0x21: break;	// test mode
		case 0x22:	// lfo freq
			if (v&8) {	// is lfo enabled?
				if (!ym2612.OPN.lfo.timer_overflow) {	// restart lfo
					ym2612.OPN.lfo.cnt = 0;
					ym2612.OPN.lfo.timer = 0;
					ym2612.OPN.lfo.AM = 0;
					ym2612.OPN.lfo.PM = 0;
				}
				ym2612.OPN.lfo.timer_overflow = LFO.samples_per_step[v&7]<<YM.LFO_SH;
			}
			else ym2612.OPN.lfo.timer_overflow = 0;
			break;
		case 0x24:	// timer a high 8
			ym2612.OPN.ST.TA = (ym2612.OPN.ST.TA&0x03)|(parseInt(v)<<2);
			ym2612.OPN.ST.TAL = (1024-ym2612.OPN.ST.TA)<<YM.TIMER_SH;
			break;
		case 0x25:	// timer a low 2
			ym2612.OPN.ST.TA = (ym2612.OPN.ST.TA&0x3fc)|(v&3);
			ym2612.OPN.ST.TAL = (1024-ym2612.OPN.ST.TA)<<YM.TIMER_SH;
			break;
		case 0x26:	// timer b
			ym2612.OPN.ST.TB = v;
			ym2612.OPN.ST.TBL = (256-ym2612.OPN.ST.TB)<<(YM.TIMER_SH+4);
			break;
		case 0x27:	// mode, timer control
			set_timers(v);
			break;
		case 0x28:	// key on/off
			//console.log("YM::write_mode - writing key "+(v&0xf0?"on":"off"));
			var c = v&0x03; if (c===3) break;
			if (v&0x04) c += 3;	// ch 4-6
/*
			//// OLD
			if (v&0x10) FM_KEYON(ym2612.CH[c],_SLOT[0]); else FM_KEYOFF(ym2612.CH[c],_SLOT[0]);
			if (v&0x20) FM_KEYON(ym2612.CH[c],_SLOT[1]); else FM_KEYOFF(ym2612.CH[c],_SLOT[1]);
			if (v&0x40) FM_KEYON(ym2612.CH[c],_SLOT[2]); else FM_KEYOFF(ym2612.CH[c],_SLOT[2]);
			if (v&0x80) FM_KEYON(ym2612.CH[c],_SLOT[3]); else FM_KEYOFF(ym2612.CH[c],_SLOT[3]);
*/
			if (v&0x10) ym2612.CH[c].SLOT[_SLOT[0]].keyOn(); else ym2612.CH[c].SLOT[_SLOT[0]].keyOff();
			if (v&0x20) ym2612.CH[c].SLOT[_SLOT[1]].keyOn(); else ym2612.CH[c].SLOT[_SLOT[1]].keyOff();
			if (v&0x40) ym2612.CH[c].SLOT[_SLOT[2]].keyOn(); else ym2612.CH[c].SLOT[_SLOT[2]].keyOff();
			if (v&0x80) ym2612.CH[c].SLOT[_SLOT[3]].keyOn(); else ym2612.CH[c].SLOT[_SLOT[3]].keyOff();
			break;
	}
};
/* write a OPN register (0x30-0xff) */
OPN.WriteReg = function(r,v){	// int, int
	var c = OPN.CHAN(r), s = OPN.SLOT(r);
	if (c===3) throw new Error("OPN_Write - unsupported channel");	// 0x?3, 0x?7, 0x?B, 0x?F
	switch (r&0xf0) {
		case 0x30:	// DET, MUL
			//console.log("YM::write_reg - writing dt/mul "+v);
			ym2612.CH[c].set_det_mul(s, v);
			break;
		case 0x40:	// TL
			ym2612.CH[c].SLOT[s].set_tl(v);
			break;
		case 0x50:	// KS, AR
			ym2612.CH[c].set_ar_ksr(s, v);
			break;
		case 0x60:	// bit7 = AM ENABLE, DR
			ym2612.CH[c].SLOT[s].set_dr(v);
			ym2612.CH[c].SLOT[s].AMmask = v&0x80?~0:0;
			break;
		case 0x70:	// SR
			ym2612.CH[c].SLOT[s].set_sr(v);
			break;
		case 0x80:	// SL, RR
			ym2612.CH[c].SLOT[s].set_sl_rr(v);
			break;
		case 0x90:	// SSG-EG
			ym2612.CH[c].SLOT[s].ssg = v&0x0f;
			// recalculate eg output
			if (ym2612.CH[c].SLOT[s].state>EG.REL) {
				if ((ym2612.CH[c].SLOT[s].ssg&0x08)&&(ym2612.CH[c].SLOT[s].ssgn^(ym2612.CH[c].SLOT[s].ssg&0x04)))
					ym2612.CH[c].SLOT[s].vol_out = (parseInt(0x200-ym2612.CH[c].SLOT[s].volume)&ENV.MAX_ATT_INDEX)+ym2612.CH[c].SLOT[s].tl;
				else
					ym2612.CH[c].SLOT[s].vol_out = parseInt(ym2612.CH[c].SLOT[s].volume)+ym2612.CH[c].SLOT[s].tl;
			}
			break;
		case 0xa0:
			//console.log("YM::write_reg - writing f-num/blk");
			//console.log("YM::write_reg - ["+r+","+v+"]");
			var fn, blk;
			switch (s) {
				case 0:	// 0xA0-0xA2: FNUM1
					fn = ((parseInt(ym2612.OPN.ST.fn_h)&7)<<8)+v;
					blk = ym2612.OPN.ST.fn_h>>3;
					// keyscale code
					ym2612.CH[c].kcode = (blk<<2)|OPN.fktable[fn>>7];
					// phase increment counter
					ym2612.CH[c].fc = ym2612.OPN.fn.table[fn*2]>>(7-blk);
					// store fnum in clear form for lfo pm calculations
					ym2612.CH[c].block_fnum = (blk<<11)|fn;
					ym2612.CH[c].SLOT[_SLOT[0]].Incr = -1;
					break;
				case 1:	// 0xA4-0xA6: FNUM2, BLK
					ym2612.OPN.ST.fn_h = v&0x3f;
					break;
				case 2:	// 0xA8-0xAA: 3CH FNUM1
					if (r<0x100) {
						fn = ((parseInt(ym2612.OPN.SL3.fn_h)&7)<<8)+v;
						blk = ym2612.OPN.SL3.fn_h>>3;
						// keyscale code
						ym2612.OPN.SL3.kcode[c] = (blk<<2)|OPN.fktable[fn>>7];
						// phase increment counter
						ym2612.OPN.SL3.fc[c] = ym2612.OPN.fn.table[fn*2]>>(7-blk);
						ym2612.OPN.SL3.block_fnum[c] = (blk<<11)|fn;
						ym2612.CH[2].SLOT[_SLOT[0]].Incr = -1;
					}
					break;
				case 3:	// 0xAC-0xAE: 3CH FNUM2, BLK
					if (r<0x100) ym2612.OPN.SL3.fn_h = v&0x3f;
					break;
			}
			break;
		case 0xb0:
			switch (s) {
				case 0:	// 0xB0-0xB2: FB, ALGO
					var feedback = (v>>3)&7;	// int
					ym2612.CH[c].ALGO = v&7;
					ym2612.CH[c].FB = feedback?feedback+6:0;
					ym2612.CH[c].setup_connection(c);
					break;
				case 1:	// 0xB4-0xB6: L/R/AMS/PMS
					ym2612.CH[c].pms = (v&7)*32;
					ym2612.CH[c].ams = LFO.ams_depth_shift[(v>>4)&0x03];
					ym2612.OPN.pan[c*2] = v&0x80?0xffffffff:0;
					ym2612.OPN.pan[c*2+1] = v&0x40?0xffffffff:0;
					break;
			}
			break;
	}
};

/* initialize time tables */
function init_timetables(freqbase) {	// double
	var i, d;	// int
	var rate;	// double
	// detune table
	d = -1; while (++d<=3) {
		i = -1; while (++i<=31) {
			rate = EG.dt_tab[d*32+i]*freqbase*(1<<(YM.FREQ_SH-10));
			//console.log("YM::init_timetables - rate["+d+","+i+"]="+rate);
			ym2612.OPN.ST.dt_tab[d][i] = parseInt(rate);
			ym2612.OPN.ST.dt_tab[d+4][i] = -ym2612.OPN.ST.dt_tab[d][i];
		}
	}
	// there are 2048 FNUMs that can be generated using FNUM/BLK registers
	// but LFO works with one more bit of a precision so we really need 4096 elements
	// calculate fnumber -> increment counter table
	i = -1; while (++i<4096) {
		ym2612.OPN.fn.table[i] = parseInt(i*32*freqbase*(1<<(YM.FREQ_SH-10)));
		//console.log("YM::init_timetables - fn["+i+"]="+ym2612.OPN.fn.table[i]);
	}
	// maximal frequency is required for Phase overflow calculation, register size is 17 bits
	ym2612.OPN.fn.max = parseInt(0x20000*freqbase*(1<<(YM.FREQ_SH-10)));
	//console.log("YM::init_timetables - fn_max="+ym2612.OPN.fn.max);
}

/* prescaler set (and make time tables) */
OPN.SetPres = function(pres){	// int
	// frequency base (ratio btwn fm original samplerate & desired output samplerate
	if(config.debug)console.log("OPN::SetPrescaler - clock="+ym2612.OPN.ST.clock+" rate="+ym2612.OPN.ST.rate+" prescale="+pres);
	var freqbase = ym2612.OPN.ST.clock/ym2612.OPN.ST.rate/pres;
	if(config.debug)console.log("OPN::SetPrescaler - EG shift="+YM.EG_SH+", freq ratio="+freqbase.toFixed(4)+(config.hq_fm?", but HQ is on so 1.0":""));
	// YM2612 running at original frequency (~53267 Hz)
	if (config.hq_fm) freqbase = 1.0;
	//console.log("OPN::SetPrescaler - base mult="+freqbase);
	// eg is updated every 3 samples
	ym2612.OPN.eg.timer_add = parseInt((1<<YM.EG_SH)*freqbase);
	ym2612.OPN.eg.timer_overflow = 3*(1<<YM.EG_SH);
	//console.log("OPN::SetPrescaler - eg_timer_add="+ym2612.OPN.eg.timer_add+", eg_timer_overflow="+ym2612.OPN.eg.timer_overflow);
	// lfo timer increment (every sample)
	ym2612.OPN.lfo.timer_add = parseInt((1<<YM.LFO_SH)*freqbase);
	// timers increment (every sample
	ym2612.OPN.ST.TimerBase = parseInt((1<<YM.TIMER_SH)*freqbase);
	// make timetables
	init_timetables(freqbase);
};

/* initialize generic tables */
function init_tables() {
	var i,x;	// SINT
	var n;	// SINT
	var o,m;	// double
	// dac precision
	var mask = ~((1<<(14-config.dac_bits))-1);
	// build linear power table
	var tmp_es = (ENV.STEP/4.0), tmp_es8 = tmp_es/8.0, tmp_sh = 1<<16;
	var tmp_trl = 2*TL.RES_LEN, tmp_irl, tmp_2x;
	x = -1; while (++x<TL.RES_LEN) {
		m = Math.floor(tmp_sh/Math.pow(2,(x+1)*tmp_es8));
		n = parseInt(m)>>4;	// 12 bits here
		if (n&1) n = (n>>1)+1;
		else n = n>>1;
		n <<= 2;	// 13 bits here (as in real chip)
		tmp_2x = x*2;
		TL.tab[tmp_2x+0] = n&mask;
		TL.tab[tmp_2x+1] = -TL.tab[tmp_2x+0]&mask;
		//console.log("init_tables - ["+(tmp_2x+0)+","+(tmp_2x+1)+"]="+TL.tab[tmp_2x+0]+","+(-TL.tab[tmp_2x+0]&mask));
		i = 0; while (++i<13) {
			tmp_irl = i*tmp_trl;
			TL.tab[tmp_2x+0+tmp_irl] = (TL.tab[tmp_2x+0]>>i)&mask;
			TL.tab[tmp_2x+1+tmp_irl] = -TL.tab[tmp_2x+0+tmp_irl]&mask;
			//console.log("init_tables - ["+(tmp_2x+0+tmp_irl)+","+(tmp_2x+1+tmp_irl)+"]="+TL.tab[tmp_2x+0+tmp_irl]+","+(-TL.tab[tmp_2x+0+tmp_irl]&mask));
		}
	}
	//console.log("init_tables - TL["+TL.tab.toString()+"]");
	//$(".vst-output").sparkline(TL.tab,{type:'bar',barWidth:1,barSpacing:0,height:256,barColor:'rgba(18,10,143,0.25)',negBarColor:'rgba(63,0,255,0.25)'});
	//$(".vst-output").text(TL.tab.toString());
	var tmp_pi = Math.PI/YM.SIN_LEN, tmp_8l2 = 8/Math.log(2);
	// build logarithmic sinus table
	i = -1; while (++i<YM.SIN_LEN) {
		// non-standard sinus
		m = Math.sin((i*2+1)*tmp_pi);
		if (m>0.0) o = Math.log(1.0/m)*tmp_8l2;
		else o = Math.log(-1.0/m)*tmp_8l2;
		o = o/tmp_es;
		n = parseInt(2.0*o);
		if (n&1) n = (n>>1)+1;
		else n = n>>1;
		// 13-bits (8.5) value is formatted for above 'power' table
		YM.sin[i] = n*2+(m>=0.0?0:1);
	}
	//console.log("init_tables - sin["+YM.sin.toString()+"]");
	//$(".vst-output").text(YM.sin.toString());
	// build lfo pm modulation table
	var fnum, value, step;	// UINT8
	var offset_depth, offset_fnum_bit, bit_tmp;	// UINT32
	var tmp_fmul = 32*8;
	i = -1; while (++i<8) {
		offset_depth = i;
		fnum = -1; while (++fnum<128) {	//7 bits meaningful
			step = -1; while (++step<8) {
				value = 0;
				bit_tmp = -1; while (++bit_tmp<7) {
					if (fnum&(1<<bit_tmp)) {
						offset_fnum_bit = bit_tmp*8;
						value += LFO.pm_output[offset_fnum_bit+offset_depth][step];
					}
					// 32 steps for lfo pm (sinus)
					LFO.pm_table[fnum*tmp_fmul+i*32+step+0] = value;
					LFO.pm_table[fnum*tmp_fmul+i*32+(step^7)+8] = value;
					LFO.pm_table[fnum*tmp_fmul+i*32+step+16] = -value;
					LFO.pm_table[fnum*tmp_fmul+i*32+(step^7)+24] = -value;
				}
			}
		}
	}
	//$(".vst-output").text(LFO.pm_table.toString());
}


/* initialize ym2612 emulator(s) */
YM2612.prototype.init = function(clock,rate) {	// double, int
	ym2612.init();
	init_tables();
	ym2612.OPN.ST.clock = clock;
	ym2612.OPN.ST.rate = rate;
	OPN.SetPres(6*24);	// ym2612 prescaler is fixed to 1/6, one sample (6 mixed channels) is output for each 24 fm clocks
};
/* reset OPN registers */
YM2612.prototype.reset = function() {
	var i;
	ym2612.OPN.eg.timer = 0;
	ym2612.OPN.eg.cnt = 0;
	ym2612.OPN.lfo.timer = 0;
	ym2612.OPN.lfo.cnt = 0;
	ym2612.OPN.lfo.AM = 0;
	ym2612.OPN.lfo.PM = 0;
	ym2612.OPN.ST.TAC = 0;
	ym2612.OPN.ST.TBC = 0;
	ym2612.OPN.SL3.key_csm = 0;
	ym2612.dacen = 0;
	ym2612.dacout = 0;
	OPN.WriteMode(0x27,0x30);
	OPN.WriteMode(0x26,0x30);
	OPN.WriteMode(0x25,0x30);
	OPN.WriteMode(0x24,0x30);
	OPN.WriteMode(0x22,0x30);
	i = ym2612.CH.length; while (--i>-1) ym2612.CH[i].reset();
	i = 0xb6+1; while (--i>=0xb4) {
		OPN.WriteReg(i,0xc0);
		OPN.WriteReg(i|0x100,0xc0);
	}
	i = 0xb2+1; while (--i>=0x30) {
		OPN.WriteReg(i,0);
		OPN.WriteReg(i|0x100,0);
	}
};
/* ym2612 write */
/* n = number  */
/* a = address */
/* v = value   */
/****
WRITE NOTES
This is now rewritten to perform an IMMEDIATE write.
~lux
****/
YM2612.prototype.write = function(a,v) {
	v &= 0xff;	// adjust to 8-bit bus
/*
	switch (a) {
		case 0:	// address port 0
			ym2612.OPN.ST.address = v;
			break;
		case 2:	// address port 1
			ym2612.OPN.ST.address = v|0x100;
			break;
	}
*/
	ym2612.OPN.ST.address = a&0xff;
	var addr = ym2612.OPN.ST.address;
	//console.log("YM2612::write - writing to addr "+addr);
	switch (addr&0x1f0) {
		case 0x20:	// 0x20-0x2f mode
			switch (addr) {
				case 0x2a:	// dac data
					ym2612.dacout = (parseInt(v)&0x80)<<6;
					break;
				case 0x2b:	// dac sel
					ym2612.dacen = v&0x80;
					break;
				default:
					OPN.WriteMode(addr,v);
					break;
			}
			break;
		default:
			OPN.WriteReg(addr,v);
	}
};
YM2612.prototype.read = function(){return ym2612.OPN.ST.status&0xff;};

/* Generate 16 bits samples for ym2612 */
YM2612.prototype.update = function(length) {	// [formerly LINT[],] int
	if(config.debug)console.log("==== YM::update("+length+") - start...");
	var i;	// int
	var lt = 0, rt = 0;	// LINT
	var buffer = [[],[]];
	//throw new Error("YM2612::update break early");
	if(config.debug)console.log("YM::update - refresh_fc_eg_chan*6...");
	// refresh pg increments and eg rates if required
	ym2612.CH[0].refresh_fc_eg();
	ym2612.CH[1].refresh_fc_eg();
	if (ym2612.OPN.ST.mode&0xc0) {
		// 3slot mode (op order is 0,1,3,2)
		if (ym2612.CH[2].SLOT[_SLOT[0]].Incr===-1) {
			ym2612.CH[2].SLOT[_SLOT[0]].refresh_fc_eg(ym2612.OPN.SL3.fc[1], ym2612.OPN.SL3.kcode[1]);
			ym2612.CH[2].SLOT[_SLOT[1]].refresh_fc_eg(ym2612.OPN.SL3.fc[2], ym2612.OPN.SL3.kcode[2]);
			ym2612.CH[2].SLOT[_SLOT[2]].refresh_fc_eg(ym2612.OPN.SL3.fc[0], ym2612.OPN.SL3.kcode[0]);
			ym2612.CH[2].SLOT[_SLOT[3]].refresh_fc_eg(ym2612.CH[2].fc, ym2612.CH[2].kcode);
		}
	}
	else ym2612.CH[2].refresh_fc_eg();
	ym2612.CH[3].refresh_fc_eg();
	ym2612.CH[4].refresh_fc_eg();
	ym2612.CH[5].refresh_fc_eg();
	//console.log("YM::update - timer="+ym2612.OPN.eg.timer+", add="+ym2612.OPN.eg.timer_add);
	if(config.debug)console.log("YM::update - buffering...");
	// buffering
	i = length; while (--i>-1) {
		// clear outputs
		YM.out_fm[0] = 0;
		YM.out_fm[1] = 0;
		YM.out_fm[2] = 0;
		YM.out_fm[3] = 0;
		YM.out_fm[4] = 0;
		YM.out_fm[5] = 0;
		// update ssg-eg output
		ym2612.CH[0].update_ssg_eg();
		ym2612.CH[1].update_ssg_eg();
		ym2612.CH[2].update_ssg_eg();
		ym2612.CH[3].update_ssg_eg();
		ym2612.CH[4].update_ssg_eg();
		ym2612.CH[5].update_ssg_eg();
		ym2612.CH[0].calculate();
		ym2612.CH[1].calculate();
		ym2612.CH[2].calculate();
		ym2612.CH[3].calculate();
		ym2612.CH[4].calculate();
		if (ym2612.dacen) YM.out_fm[5] = ym2612.dacout;
		else ym2612.CH[5].calculate();
		// advance lfo
		ym2612.OPN.advance_lfo();
		// advance env gen
		ym2612.OPN.eg.timer += ym2612.OPN.eg.timer_add;
		while (ym2612.OPN.eg.timer>=ym2612.OPN.eg.timer_overflow) {
			//console.log("YM::update - timer="+ym2612.OPN.eg.timer);
			ym2612.OPN.eg.timer -= ym2612.OPN.eg.timer_overflow;
			++ym2612.OPN.eg.cnt;
			ym2612.CH[0].advance_eg_channel();
			ym2612.CH[1].advance_eg_channel();
			ym2612.CH[2].advance_eg_channel();
			ym2612.CH[3].advance_eg_channel();
			ym2612.CH[4].advance_eg_channel();
			ym2612.CH[5].advance_eg_channel();
		}
		// 14-bit dac inputs (range is -8192;+8192)
		//console.log("YM::update(buffer) - out[0]="+YM.out_fm[0]);
		YM.out_fm[0] = YM.limit(YM.out_fm[0],-8192,8192);
		YM.out_fm[1] = YM.limit(YM.out_fm[1],-8192,8192);
		YM.out_fm[2] = YM.limit(YM.out_fm[2],-8192,8192);
		YM.out_fm[3] = YM.limit(YM.out_fm[3],-8192,8192);
		YM.out_fm[4] = YM.limit(YM.out_fm[4],-8192,8192);
		YM.out_fm[5] = YM.limit(YM.out_fm[5],-8192,8192);
		//console.log(YM.out_fm[0]+"&"+ym2612.OPN.pan[0]+"="+(YM.out_fm[0]&ym2612.OPN.pan[0]));
		lt = (YM.out_fm[0]&ym2612.OPN.pan[0])+
			(YM.out_fm[1]&ym2612.OPN.pan[2])+
			(YM.out_fm[2]&ym2612.OPN.pan[4])+
			(YM.out_fm[3]&ym2612.OPN.pan[6])+
			(YM.out_fm[4]&ym2612.OPN.pan[8])+
			(YM.out_fm[5]&ym2612.OPN.pan[10])+
			0;
		rt = (YM.out_fm[0]&ym2612.OPN.pan[1])+
			(YM.out_fm[1]&ym2612.OPN.pan[3])+
			(YM.out_fm[2]&ym2612.OPN.pan[5])+
			(YM.out_fm[3]&ym2612.OPN.pan[7])+
			(YM.out_fm[4]&ym2612.OPN.pan[9])+
			(YM.out_fm[5]&ym2612.OPN.pan[11])+
			0;
		// buffering
		buffer[0].push(lt);
		buffer[1].push(rt);
		// csm mode: if csm KEYON has occurred, csm KEYOFF needs to be sent only if timer A does not overflow again
		ym2612.OPN.SL3.key_csm <<= 1;
		// timer A control
		INTERNAL_TIMER_A();
		// csm mode KEYON still disabled
		if (ym2612.OPN.SL3.key_csm&2) {
			// csm mode KEYOFF
			FM_KEYOFF_CSM(ym2612.CH[2],_SLOT[0]);
			FM_KEYOFF_CSM(ym2612.CH[2],_SLOT[1]);
			FM_KEYOFF_CSM(ym2612.CH[2],_SLOT[2]);
			FM_KEYOFF_CSM(ym2612.CH[2],_SLOT[3]);
			ym2612.OPN.SL3.key_csm = 0;
		}
		//console.log("YM::update(buffer) - mem="+YM.mem+" c1="+YM.c1+" c2="+YM.c2+" m2="+YM.m2);
	}
	if(config.debug)console.log("YM::update - end buffering...");
	//console.log("YM::update = ["+buffer[0].toString()+"]");
	// timer B control
	INTERNAL_TIMER_B(length);
	//console.log("YM buffer: "+length);
	//alert("YM buffer: "+length);
	if(config.debug)console.log("==== YM::update("+length+") - end...");
	return buffer;
};

YM2612.prototype.getContext = function(){return ym2612;};
YM2612.getContextSize = function(){return 1;};
/****
YM2612::RESTORE NOTES
The original YM2612Restore took a buffer of bytes and copied it raw to the
ym2612 struct. I need to modify it for JS to allow object copying.
TODO:
-	convert to deep object copy/clone
~lux
****/
YM2612.prototype.restore = function(buffer){};
/****
YM2612::LOAD NOTES
The original YM2612LoadContext took a buffer of bytes and copied it raw to the
ym2612 struct. I need to modify it for JS to allow object copying.
TODO:
-	convert to deep object copy/clone
~lux
****/
YM2612.prototype.load = function(state){};
/****
YM2612::SAVE NOTES
The original YM2612Save took a pointer to a buffer of bytes, copied it raw from
the ym2612 struct, and returned the size. I need to modify it for JS to allow
object copying.
TODO:
-	convert to deep object copy/clone
~lux
****/
YM2612.prototype.save = function(state){};

})();
