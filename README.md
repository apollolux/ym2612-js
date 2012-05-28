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

Assuming your computer did not blow up, we should be ready to feed the chip some data! From this point forward, if you are going to feed data manually, you must know what the chip's registers do. Manually or programmatically, write to registers using `ym.write(byte_addr, byte_data)` , where `byte_reg` is the register to which to write and `byte_data` is the data to write to it. First, turn all your channels' notes off, as well as disable the DAC on channel 6 temporarily, then set the channels' panning and modulation states, then finally set the channels' FM parameters. Now it should be safe to send musical data to the chip. If you are feeding data manually, you may or may not need to write to registers such as timer registers.

Once you've written your data to the chip and your app wants to advance, get the generated audio using `buffer = ym.update(int_length)` , where `int_length` is the number of sample-frames to write to the `buffer` variable. The results should be an array[2][`int_length`] in size of 16-bit audio samples; you'll likely need to loop through `buffer` to add the samples to existing audio.

# API
<h3>How to Initialize</h3>
<dl>
	<dt>new YM2612();</dt>
		<dd>If successful, a new YM2612 object is returned. (I will likely update this soon to allow direct init of clock and sample rate in constructor)</dd>
</dl>
<dl>
	<dt>void YM2612.init(int_clock, int_samplerate);</dt>
		<dd>Initialize the chip to a given frequency and sample rate.</dd>
		<dd>Arguments: `int_clock` is the YM2612's frequency native to the app (7670445 is the ideal value here); `int_samplerate` is the app's sample-frame rate (aka, "sample rate" or "frame rate", where 44100 is a normal value to use here).</dd>
		<dd>Return: void (none)</dd>
	<dt>YM2612.reset()</dt>
		<dd>Reset the chip; silence all channels and zero all timers.</dd>
		<dd>Arguments: none</dd>
		<dd>Return: void (none)</dd>
	<dt>YM2612.write(byte_addr, byte_data)</dt>
		<dd>Write data to a chip register.</dd>
		<dd>Arguments: `byte_addr` is the address of the register to which to write; `byte_data` is the data to write to that register.</dd>
		<dd>Return: void (none)</dd>
	<dt>int YM2612.read()</dt>
		<dd>Read the chip's current status; likely more useful in a more full-featured emulator.</dd>
		<dd>Arguments: none</dd>
		<dd>Return: int status_byte</dd>
	<dt>Array YM2612.update(int_length)</dt>
		<dd>Generate audio data from the chip.</dd>
		<dd>Arguments: `int_length` is the amount of frames of stereo audio data to generate.</dd>
		<dd>Return: Array[2][`int_length`] audio_buffer</dd>
	<dt>Object YM2612.getContext()</dt>
		<dd>TODO</dd>
		<dd>Arguments: none</dd>
		<dd>Return: TODO</dd>
	<dt>int YM2612.getContextSize()</dt>
		<dd>TODO</dd>
		<dd>Arguments: none</dd>
		<dd>Return: void (none)</dd>
	<dt>void YM2612.restore(bytearray_buffer)</dt>
		<dd>TODO</dd>
		<dd>Arguments: TODO</dd>
		<dd>Return: void (none)</dd>
	<dt>void YM2612.load(bytearray_buffer)</dt>
		<dd>TODO</dd>
		<dd>Arguments: TODO</dd>
		<dd>Return: void (none)</dd>
	<dt>void YM2612.save(obj_state)</dt>
		<dd>TODO</dd>
		<dd>Arguments: TODO</dd>
		<dd>Return: void (none)</dd>
</dl>

# Disclaimer

[Genesis Plus](http://code.google.com/p/genplus-gx) is an open-source multi-platform emulator of the Sega Genesis/Mega Drive. I very much enjoy Genesis games and am a big fan of the audio output by the console, as well as FM synthesis in general, hence this project. The ultimate goal of this project is to create a usable YM2612 VST instrument for DAWs that support the VST format, as well as an Audio Unit for those OS X-based DAWs that support CoreAudio.

# License

ym2612.js is provided under an MIT license.
