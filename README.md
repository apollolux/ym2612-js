# Preamble

This is a basic emulation of the Yamaha YM2612 synthesis chip written entirely in JavaScript. The intention is primarily to mockup interaction of a YM2612 core with an implementation of Steinberg's *VST* audio toolkit. This core is based entirely on the open-source C-based YM2612 core found in the Wii port of the Genesis Plus emulator.

* Genesis Plus can be found at [http://code.google.com/p/genplus-gx](http://code.google.com/p/genplus-gx)
* VST can be found at [http://www.steinberg.net/en/company/developer.html](http://www.steinberg.net/en/company/developer.html)
* Basic JavaScript implementation of VST by myself (as proof-of-concept for my mockup purposes) soon to follow!

# Installation

1. Download ym2612.js to a directory that's accessible by your intended webpage or other JavaScript-capable development environment (I personally use [Sphere](http://spheredev.org) for JavaScript).
2. Reference the file in your project.
	* In HTML, a normal script element on the page itself will do.
	* In Sphere, you'll need to RequireScript it.
3. Follow the usage instructions below!

# Usage

First, you'll need to declare a `YM2612` object (a simple `var ym = new YM2612();` or some such will do). Once the object is loaded, you'll need to initialize it using `ym.init(int_clock, int_samplerate)` , where `int_clock` is the chip's native frequency (7670445 is the ideal value here) and `int_samplerate` is your output audio's sample-frame rate (44100 is a relatively normal value). Make sure that if you update the frame rate in your app that you call `ym.init` again.

Assuming your computer did not blow up, we should be ready to feed the chip some data! From this point forward, if you are going to feed data manually, you must know what the chip's registers do. Manually or programmatically, write to registers using `ym.write(byte_reg, byte_data)` , where `byte_reg` is the register to which to write and `byte_data` is the data to write to it. First, turn all your channels' notes off, as well as disable the DAC on channel 6 temporarily, then set the channels' panning and modulation states, then finally set the channels' FM parameters. Now it should be safe to send musical data to the chip. If you are feeding data manually, you may or may not need to write to registers such as timer registers.

Once you've written your data to the chip and your app wants to advance, get the generated audio using `buffer = ym.update(int_length)` , where `int_length` is the number of sample-frames to write to the `buffer` variable. The results should be an array[2][`int_length`] in size of 16-bit audio samples; you'll likely need to loop through `buffer` to add the samples to existing audio.

# Disclaimer

[Genesis Plus](http://code.google.com/p/genplus-gx) is an open-source multi-platform emulator of the Sega Genesis/Mega Drive. I very much enjoy Genesis games and am a big fan of the audio output by the console, as well as FM synthesis in general, hence this project. The ultimate goal of this project is to create a usable YM2612 VST instrument for DAWs that support the VST format, as well as an Audio Unit for those OS X-based DAWs that support CoreAudio.
